import json
import logging
import asyncio
import uuid
from datetime import datetime
from typing import Dict, Any, List

from models import WorkflowRequest, ActionRequest, ActionType
from db import Workflow, workflows_db
from actions import ActionExecutor

logger = logging.getLogger(__name__)

MAX_RETRIES = 3

class Orchestrator:
    def __init__(self, db_pool, dlq):
        self.db_pool = db_pool
        self.dlq = dlq
        self.executor = ActionExecutor(dlq)

    async def create_workflow(self, request: WorkflowRequest) -> str:
        workflow_id = str(uuid.uuid4())
        
        workflow = Workflow(
            workflow_id=workflow_id,
            workflow_name=request.workflow_name,
            status="queued",
            context=request.context,
            results=None,
            created_at=datetime.utcnow(),
            completed_at=None
        )
        workflows_db[workflow_id] = workflow
        
        return workflow_id

    async def execute_workflow(self, workflow_id: str, request: WorkflowRequest):
        logger.info(f"Starting workflow {workflow_id}")
        results = []
        failed_actions = []
        dlq_count = 0

        try:
            workflow = workflows_db.get(workflow_id)
            if workflow:
                workflow.status = "running"

            for action in request.actions:
                try:
                    start = datetime.utcnow()
                    result = await self._execute_action(action, request.context)
                    duration = (datetime.utcnow() - start).total_seconds() * 1000

                    results.append({
                        "action_type": action.type.value,
                        "idempotency_key": action.idempotency_key,
                        "status": "success",
                        "result": result,
                        "duration_ms": duration
                    })
                    logger.info(f"Action {action.idempotency_key} succeeded")

                except Exception as e:
                    logger.error(f"Action {action.idempotency_key} failed: {e}")
                    duration = (datetime.utcnow() - start).total_seconds() * 1000

                    dlq_item_id = str(uuid.uuid4())
                    await self._park_in_dlq(dlq_item_id, {
                        "workflow_id": workflow_id,
                        "action": action.dict(),
                        "error": str(e),
                        "retry_count": 1
                    })

                    results.append({
                        "action_type": action.type.value,
                        "idempotency_key": action.idempotency_key,
                        "status": "failed",
                        "error": str(e),
                        "duration_ms": duration
                    })

                    failed_actions.append({
                        "action": action.dict(),
                        "dlq_item_id": dlq_item_id,
                        "error": str(e)
                    })
                    dlq_count += 1

            overall_status = "success" if dlq_count == 0 else "partial" if results else "failed"

            workflow = workflows_db.get(workflow_id)
            if workflow:
                workflow.status = overall_status
                workflow.results = {
                    "actions": results,
                    "failed_actions": failed_actions,
                    "dlq_count": dlq_count
                }
                workflow.completed_at = datetime.utcnow()

            logger.info(f"Workflow {workflow_id} completed with status {overall_status}")

        except Exception as e:
            logger.error(f"Workflow {workflow_id} execution failed: {e}")
            workflow = workflows_db.get(workflow_id)
            if workflow:
                workflow.status = "failed"
                workflow.completed_at = datetime.utcnow()

    async def _execute_action(self, action: ActionRequest, context: Dict[str, Any]) -> Dict[str, Any]:
        try:
            result = await asyncio.wait_for(
                self.executor.execute(action, context),
                timeout=action.timeout_seconds
            )
            return result
        except asyncio.TimeoutError:
            raise Exception(f"Action timeout after {action.timeout_seconds}s")

    async def _park_in_dlq(self, dlq_item_id: str, data: Dict[str, Any]):
        if isinstance(self.dlq, dict):
            self.dlq[dlq_item_id] = data
        else:
            score = datetime.utcnow().timestamp()
            await self.dlq.zadd("dlq:failed_actions", {dlq_item_id: score})
            await self.dlq.hset(
                f"dlq:item:{dlq_item_id}",
                mapping={
                    "workflow_id": data.get("workflow_id", ""),
                    "action": json.dumps(data.get("action", {})),
                    "error": data.get("error", ""),
                    "retry_count": str(data.get("retry_count", 0)),
                    "created_at": datetime.utcnow().isoformat()
                }
            )
            await self.dlq.expire(f"dlq:item:{dlq_item_id}", 604800)

    async def get_workflow_status(self, workflow_id: str) -> Dict[str, Any]:
        workflow = workflows_db.get(workflow_id)
        
        if not workflow:
            return None

        return {
            "workflow_id": workflow.workflow_id,
            "workflow_name": workflow.workflow_name,
            "status": workflow.status,
            "created_at": workflow.created_at.isoformat(),
            "completed_at": workflow.completed_at.isoformat() if workflow.completed_at else None,
            "results": workflow.results or {}
        }

    async def retry_dlq_item(self, dlq_item_id: str, item_data: Any):
        try:
            if isinstance(item_data, dict):
                action_data = item_data.get("action", {})
                retry_count = item_data.get("retry_count", 0)
            else:
                action_data = json.loads(item_data.get(b"action", b"{}"))
                retry_count = int(item_data.get(b"retry_count", b"0"))

            from models import ActionRequest
            action = ActionRequest(**action_data)
            context = {}

            result = await self._execute_action(action, context)

            if isinstance(self.dlq, dict):
                if dlq_item_id in self.dlq:
                    del self.dlq[dlq_item_id]
            else:
                await self.dlq.zrem("dlq:failed_actions", dlq_item_id)
                await self.dlq.delete(f"dlq:item:{dlq_item_id}")

            logger.info(f"DLQ item {dlq_item_id} retried successfully")

        except Exception as e:
            logger.error(f"DLQ retry failed (attempt {retry_count + 1}): {e}")
            retry_count_new = retry_count + 1
            
            if retry_count_new < MAX_RETRIES:
                logger.info(f"Parking DLQ item {dlq_item_id} for retry (attempt {retry_count_new + 1}/{MAX_RETRIES})")
                await self._park_in_dlq(dlq_item_id, {
                    "workflow_id": item_data.get("workflow_id"),
                    "action": item_data.get("action"),
                    "error": str(e),
                    "retry_count": retry_count_new
                })
            else:
                logger.error(f"DLQ item {dlq_item_id} exceeded max retries ({MAX_RETRIES}). Giving up.")
