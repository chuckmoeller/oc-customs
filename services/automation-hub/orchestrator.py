import json
import logging
import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import insert, update, select

from models import WorkflowRequest, ActionRequest, ActionType
from db import Workflow
from actions import ActionExecutor

logger = logging.getLogger(__name__)

class Orchestrator:
    def __init__(self, db_pool, redis_client):
        self.db_pool = db_pool
        self.redis = redis_client
        self.executor = ActionExecutor(redis_client)

    async def create_workflow(self, request: WorkflowRequest) -> str:
        workflow_id = str(uuid.uuid4())

        async with AsyncSession(self.db_pool) as session:
            workflow = Workflow(
                workflow_id=workflow_id,
                workflow_name=request.workflow_name,
                status="queued",
                context=request.context,
                created_at=datetime.utcnow()
            )
            session.add(workflow)
            await session.commit()

        return workflow_id

    async def execute_workflow(self, workflow_id: str, request: WorkflowRequest):
        logger.info(f"Starting workflow {workflow_id}")
        results = []
        failed_actions = []
        dlq_count = 0

        try:
            async with AsyncSession(self.db_pool) as session:
                stmt = update(Workflow).where(Workflow.workflow_id == workflow_id).values(
                    status="running"
                )
                await session.execute(stmt)
                await session.commit()

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
                        "retry_count": action.retry_count + 1
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

            async with AsyncSession(self.db_pool) as session:
                stmt = update(Workflow).where(Workflow.workflow_id == workflow_id).values(
                    status=overall_status,
                    results={
                        "actions": results,
                        "failed_actions": failed_actions,
                        "dlq_count": dlq_count
                    },
                    completed_at=datetime.utcnow()
                )
                await session.execute(stmt)
                await session.commit()

            logger.info(f"Workflow {workflow_id} completed with status {overall_status}")

        except Exception as e:
            logger.error(f"Workflow {workflow_id} execution failed: {e}")
            async with AsyncSession(self.db_pool) as session:
                stmt = update(Workflow).where(Workflow.workflow_id == workflow_id).values(
                    status="failed",
                    completed_at=datetime.utcnow()
                )
                await session.execute(stmt)
                await session.commit()

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
        score = datetime.utcnow().timestamp()
        await self.redis.zadd("dlq:failed_actions", {dlq_item_id: score})

        await self.redis.hset(
            f"dlq:item:{dlq_item_id}",
            mapping={
                "workflow_id": data.get("workflow_id", ""),
                "action": json.dumps(data.get("action", {})),
                "error": data.get("error", ""),
                "retry_count": str(data.get("retry_count", 0)),
                "created_at": datetime.utcnow().isoformat()
            }
        )

        await self.redis.expire(f"dlq:item:{dlq_item_id}", 604800)

    async def get_workflow_status(self, workflow_id: str) -> Dict[str, Any]:
        async with AsyncSession(self.db_pool) as session:
            stmt = select(Workflow).where(Workflow.workflow_id == workflow_id)
            result = await session.execute(stmt)
            workflow = result.scalar_one_or_none()

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

    async def retry_dlq_item(self, dlq_item_id: str, item_data: Dict[str, bytes]):
        try:
            action_data = json.loads(item_data.get(b"action", b"{}"))
            workflow_id = item_data.get(b"workflow_id", b"").decode()

            action = ActionRequest(**action_data)
            context = {}

            result = await self._execute_action(action, context)

            await self.redis.zrem("dlq:failed_actions", dlq_item_id)
            await self.redis.delete(f"dlq:item:{dlq_item_id}")

            logger.info(f"DLQ item {dlq_item_id} retried successfully")

        except Exception as e:
            logger.error(f"DLQ retry failed: {e}")
            retry_count = int(item_data.get(b"retry_count", b"0")) + 1
            if retry_count < 3:
                await self._park_in_dlq(dlq_item_id, {
                    "workflow_id": item_data.get(b"workflow_id", b"").decode(),
                    "action": json.loads(item_data.get(b"action", b"{}")),
                    "error": str(e),
                    "retry_count": retry_count
                })
            else:
                logger.error(f"DLQ item {dlq_item_id} exceeded max retries")
