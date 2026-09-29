"""
Fieldy Webhook Receiver & Task Routing Server

Listens for incoming Fieldy conversation webhooks, extracts tasks,
and routes them through the Redis Streams pub/sub pipeline.

Can be run standalone or integrated into the fastapi-gateway.
"""

from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import JSONResponse
import asyncio
import json
import logging
import os
from typing import Optional

try:
    import redis.asyncio as aioredis
except ImportError:
    aioredis = None

from fieldy_integration_worker import FieldyTaskWorker

logger = logging.getLogger("fieldy.webhook")

# Initialize FastAPI app
app = FastAPI(
    title="Fieldy Webhook Receiver",
    description="Receives Fieldy conversation webhooks and routes extracted tasks to Outlook/Asana/Agents",
    version="1.0.0",
)

# Global state
fieldy_worker: Optional[FieldyTaskWorker] = None
redis_client: Optional[aioredis.Redis] = None


# =============================================================================
# STARTUP / SHUTDOWN
# =============================================================================
@app.on_event("startup")
async def startup():
    """Initialize Fieldy worker and Redis connection."""
    global fieldy_worker, redis_client

    # Initialize Fieldy worker
    fieldy_worker = FieldyTaskWorker()
    logger.info("[Fieldy Webhook] Fieldy worker initialized")

    # Connect to Redis for pub/sub publishing
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    redis_password = os.getenv("REDIS_PASSWORD", "")

    if redis_password and "@" not in redis_url:
        redis_url = redis_url.replace("redis://", f"redis://:{redis_password}@", 1)

    try:
        redis_client = aioredis.from_url(redis_url, decode_responses=False)
        await redis_client.ping()
        logger.info("[Fieldy Webhook] Connected to Redis for pub/sub")
    except Exception as e:
        logger.warning(f"[Fieldy Webhook] Redis connection failed: {e}. Pub/sub disabled.")
        redis_client = None


@app.on_event("shutdown")
async def shutdown():
    """Cleanup."""
    global fieldy_worker, redis_client

    if fieldy_worker:
        await fieldy_worker.close()
    if redis_client:
        await redis_client.close()


# =============================================================================
# WEBHOOK ENDPOINTS
# =============================================================================
@app.post("/webhook/fieldy/conversation")
async def handle_fieldy_webhook(
    payload: dict,
    x_fieldy_signature: Optional[str] = Header(None),
) -> JSONResponse:
    """
    Webhook endpoint for Fieldy conversation events.

    Expects:
        POST /webhook/fieldy/conversation
        {
            "conversation_id": "conv-xyz",
            "title": "Sales call with Acme Corp",
            "recorded_at": "2026-09-28T14:30:00Z",
            ...
        }

    Returns:
        {
            "status": "success|error",
            "tasks_extracted": N,
            "tasks_routed": [...]
        }
    """
    if not fieldy_worker:
        raise HTTPException(status_code=503, detail="Fieldy worker not initialized")

    try:
        # Process the webhook
        result = await fieldy_worker.process_fieldy_webhook(payload)

        # Publish tasks to Redis Streams for async processing
        if result.get("status") == "success" and redis_client:
            for routed_task in result.get("tasks_routed", []):
                try:
                    task_data = routed_task["task"]
                    routing = routed_task["routing"]

                    # Publish to appropriate stream based on routing decision
                    stream_name = (
                        "events:outlook-tasks" if routing["destination"] == "OUTLOOK_TASKS"
                        else "events:agent-executor"
                    )

                    event_payload = json.dumps({
                        "type": "fieldy_task",
                        "task": task_data,
                        "routing": routing,
                        "fieldy_conversation_id": result.get("conversation_id"),
                    }).encode("utf-8")

                    msg_id = await redis_client.xadd(
                        stream_name,
                        {
                            "payload": event_payload,
                            "task_id": task_data["id"].encode("utf-8"),
                            "priority": task_data["priority"].encode("utf-8"),
                            "action_type": task_data["action_type"].encode("utf-8"),
                        },
                    )

                    logger.info(f"[Webhook] Published task {task_data['id'][:12]} to {stream_name} (msg: {msg_id})")

                except Exception as e:
                    logger.error(f"[Webhook] Failed to publish task to Redis: {e}")

        return JSONResponse(status_code=200, content=result)

    except Exception as e:
        logger.error(f"[Webhook] Error processing Fieldy webhook: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process webhook: {e}")


@app.post("/webhook/fieldy/test")
async def test_webhook(payload: dict) -> JSONResponse:
    """Test endpoint (debugging only)."""
    if not fieldy_worker:
        raise HTTPException(status_code=503, detail="Fieldy worker not initialized")

    result = await fieldy_worker.process_fieldy_webhook(payload)
    return JSONResponse(status_code=200, content=result)


# =============================================================================
# HEALTH & INFO ENDPOINTS
# =============================================================================
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "fieldy-webhook-receiver",
        "redis_connected": redis_client is not None,
        "worker_initialized": fieldy_worker is not None,
    }


@app.get("/info")
async def info():
    """Service info endpoint."""
    return {
        "service": "Fieldy Webhook Receiver",
        "version": "1.0.0",
        "endpoints": {
            "webhook": "POST /webhook/fieldy/conversation",
            "test": "POST /webhook/fieldy/test",
            "health": "GET /health",
            "info": "GET /info",
        },
        "features": {
            "task_extraction": True,
            "priority_scoring": True,
            "agent_routing": True,
            "email_action_detection": True,
            "outlook_integration": "pending",
            "asana_sync": "pending",
        },
    }


# =============================================================================
# CLI TEST
# =============================================================================
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.getenv("FIELDY_WEBHOOK_PORT", "8003")),
        log_level="info",
    )
