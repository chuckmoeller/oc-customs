import os
import json
import logging
from datetime import datetime
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import redis.asyncio as redis
from sqlalchemy import text

from db import get_db_pool
from orchestrator import Orchestrator
from models import WorkflowRequest, ActionResult, WorkflowResult

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

redis_client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client
    redis_client = await redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"))
    yield
    await redis_client.close()

app = FastAPI(title="Automation Hub", lifespan=lifespan)

@app.post("/orchestrate")
async def orchestrate(request: WorkflowRequest, background_tasks: BackgroundTasks):
    db_pool = await get_db_pool()
    orchestrator = Orchestrator(db_pool, redis_client)

    try:
        if not request.actions:
            raise HTTPException(status_code=400, detail="No actions in workflow")

        workflow_id = await orchestrator.create_workflow(request)
        logger.info(f"Created workflow {workflow_id}")

        background_tasks.add_task(
            orchestrator.execute_workflow,
            workflow_id,
            request
        )

        return {
            "workflow_id": workflow_id,
            "status": "queued",
            "message": "Workflow queued for execution"
        }

    except Exception as e:
        logger.error(f"Orchestration error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/orchestrations/{workflow_id}")
async def get_workflow_status(workflow_id: str):
    db_pool = await get_db_pool()
    orchestrator = Orchestrator(db_pool, redis_client)

    result = await orchestrator.get_workflow_status(workflow_id)
    if not result:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return result

@app.get("/dlq")
async def list_dlq_items(limit: int = 100):
    dlq_items = await redis_client.zrange("dlq:failed_actions", 0, limit - 1, withscores=True)

    items = []
    for item_id, score in dlq_items:
        item_data = await redis_client.hgetall(f"dlq:item:{item_id.decode()}")
        items.append({
            "id": item_id.decode(),
            "created_at": datetime.fromtimestamp(score),
            "data": {k.decode(): v.decode() for k, v in item_data.items()}
        })

    return {"count": len(items), "items": items}

@app.post("/dlq/{item_id}/retry")
async def retry_dlq_item(item_id: str, background_tasks: BackgroundTasks):
    db_pool = await get_db_pool()
    orchestrator = Orchestrator(db_pool, redis_client)

    item_data = await redis_client.hgetall(f"dlq:item:{item_id}")
    if not item_data:
        raise HTTPException(status_code=404, detail="DLQ item not found")

    background_tasks.add_task(
        orchestrator.retry_dlq_item,
        item_id,
        item_data
    )

    return {"message": f"Retry queued for {item_id}"}

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090)
