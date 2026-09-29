import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Test basic imports
try:
    from fastapi import FastAPI
    logger.info("✓ FastAPI imported")
except Exception as e:
    logger.error(f"✗ FastAPI import failed: {e}")
    raise

try:
    from contextlib import asynccontextmanager
    logger.info("✓ asynccontextmanager imported")
except Exception as e:
    logger.error(f"✗ asynccontextmanager import failed: {e}")
    raise

try:
    from models import WorkflowRequest
    logger.info("✓ models imported")
except Exception as e:
    logger.error(f"✗ models import failed: {e}")
    raise

try:
    from db import get_db_pool
    logger.info("✓ db imported")
except Exception as e:
    logger.error(f"✗ db import failed: {e}")
    raise

try:
    from orchestrator import Orchestrator
    logger.info("✓ orchestrator imported")
except Exception as e:
    logger.error(f"✗ orchestrator import failed: {e}")
    raise

from datetime import datetime
from typing import Dict, Any, List
from collections import defaultdict

import redis.asyncio as redis
from fastapi import HTTPException, BackgroundTasks

redis_client = None
dlq_fallback = defaultdict(dict)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client
    logger.info("App starting...")
    try:
        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            redis_client = await redis.from_url(
                redis_url,
                socket_connect_timeout=5,
                socket_keepalive=True
            )
            await redis_client.ping()
            logger.info("✓ Redis connected")
        else:
            logger.info("✓ Redis not configured, using in-memory DLQ")
    except Exception as e:
        logger.warning(f"⚠ Redis unavailable: {e}, using in-memory fallback")
        redis_client = None
    
    yield
    
    if redis_client:
        try:
            await redis_client.close()
        except:
            pass

app = FastAPI(title="Automation Hub", lifespan=lifespan)
logger.info("✓ FastAPI app created")

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/orchestrate")
async def orchestrate(request: WorkflowRequest, background_tasks: BackgroundTasks):
    db_engine = await get_db_pool()
    dlq = redis_client if redis_client else dlq_fallback
    orchestrator = Orchestrator(db_engine, dlq)

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
    db_engine = await get_db_pool()
    dlq = redis_client if redis_client else dlq_fallback
    orchestrator = Orchestrator(db_engine, dlq)

    result = await orchestrator.get_workflow_status(workflow_id)
    if not result:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return result

@app.get("/dlq")
async def list_dlq_items(limit: int = 100):
    dlq = redis_client if redis_client else dlq_fallback
    
    if redis_client:
        dlq_items = await redis_client.zrange("dlq:failed_actions", 0, limit - 1, withscores=True)
        items = []
        for item_id, score in dlq_items:
            item_data = await redis_client.hgetall(f"dlq:item:{item_id.decode()}")
            items.append({
                "id": item_id.decode(),
                "created_at": datetime.fromtimestamp(score),
                "data": {k.decode(): v.decode() for k, v in item_data.items()}
            })
    else:
        items = [{"id": k, "data": v} for k, v in list(dlq.items())[:limit]]

    return {"count": len(items), "items": items}

@app.post("/dlq/{item_id}/retry")
async def retry_dlq_item(item_id: str, background_tasks: BackgroundTasks):
    db_engine = await get_db_pool()
    dlq = redis_client if redis_client else dlq_fallback
    orchestrator = Orchestrator(db_engine, dlq)

    if redis_client:
        item_data = await redis_client.hgetall(f"dlq:item:{item_id}")
        if not item_data:
            raise HTTPException(status_code=404, detail="DLQ item not found")
    else:
        if item_id not in dlq:
            raise HTTPException(status_code=404, detail="DLQ item not found")
        item_data = dlq[item_id]

    background_tasks.add_task(orchestrator.retry_dlq_item, item_id, item_data)
    return {"message": f"Retry queued for {item_id}"}

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting uvicorn...")
    port = int(os.getenv("PORT", "8090"))
    logger.info(f"Listening on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
