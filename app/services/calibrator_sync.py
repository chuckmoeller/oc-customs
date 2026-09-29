"""
The Calibrator Project Sync Service & Event Publisher.

Publishes `project_sync` events directly to the dedicated `events:calibrator` Redis stream
and provides SSE streaming updates to the Site Hunter frontend.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, AsyncGenerator, Dict, Optional
from fastapi import Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

logger = logging.getLogger("calibrator.sync")

DEFAULT_REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
CALIBRATOR_STREAM = os.getenv("EVENT_STREAM_NAME", "events:calibrator")


def get_redis_client():
    """Initializes async Redis client with dynamic host resolution."""
    import redis.asyncio as aioredis
    url = os.getenv("REDIS_URL") or DEFAULT_REDIS_URL
    if "redis:6379" in url and not os.path.exists("/.dockerenv"):
        url = url.replace("redis:6379", "localhost:6379")
    return aioredis.from_url(url, decode_responses=True)


async def publish_project_sync_event(
    project_id: str,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Publishes a project_sync event directly to the dedicated events:calibrator Redis stream.
    """
    r = get_redis_client()
    try:
        data_payload = {
            "event": "project_sync",
            "event_type": "project_sync",
            "project_id": str(project_id),
            "job_id": str(project_id),
            "timestamp": time.time(),
        }
        if extra:
            data_payload.update(extra)

        fields = {
            "event_type": "project_sync",
            "project_id": str(project_id),
            "job_id": str(project_id),
            "payload": json.dumps(data_payload),
            "timestamp": str(time.time()),
        }

        msg_id = await r.xadd(CALIBRATOR_STREAM, fields)
        logger.info(
            f"[Calibrator Sync] Published project_sync event for project={project_id} "
            f"to stream={CALIBRATOR_STREAM} (msg_id={msg_id})"
        )
        return {
            "status": "ok",
            "stream": CALIBRATOR_STREAM,
            "msg_id": str(msg_id),
            "project_id": str(project_id),
            "event_type": "project_sync",
        }
    finally:
        try:
            await r.aclose()
        except Exception:
            pass


async def sse_project_sync_generator(
    project_id: str,
    extra: Optional[Dict[str, Any]] = None,
) -> AsyncGenerator[str, None]:
    """
    Server-Sent Events generator streaming status to UI while dispatching project_sync.
    Matches the SSE protocol expected by useQuickExport.js:
      - event: progress (label, current, total)
      - event: complete (status, label, current, total)
    """
    try:
        # Step 1: Connecting
        yield f"event: progress\ndata: {json.dumps({'status': 'connecting', 'label': 'Connecting to Calibrator worker stream...', 'current': 1, 'total': 3})}\n\n"
        await asyncio.sleep(0.05)

        # Step 2: Publish to Redis
        res = await publish_project_sync_event(project_id, extra=extra)
        msg_id = res.get("msg_id", "unknown")

        yield f"event: progress\ndata: {json.dumps({'status': 'dispatched', 'label': f'Published project_sync to events:calibrator ({msg_id})', 'current': 2, 'total': 3})}\n\n"
        await asyncio.sleep(0.1)

        # Step 3: Complete
        yield f"event: complete\ndata: {json.dumps({'status': 'ok', 'label': 'Calibrator simulation synchronized successfully', 'current': 3, 'total': 3, 'projectId': str(project_id), 'stream': CALIBRATOR_STREAM, 'msg_id': msg_id})}\n\n"

    except Exception as exc:
        logger.error(f"[Calibrator Sync] SSE stream error: {exc}", exc_info=True)
        yield f"event: error\ndata: {json.dumps({'error': str(exc), 'project_id': str(project_id)})}\n\n"


async def handle_project_sync_request(
    project_id: str,
    request: Optional[Request] = None,
    stream: bool = False,
    extra: Optional[Dict[str, Any]] = None,
) -> Response:
    """
    Unified route handler supporting both SSE text/event-stream and JSON response.
    """
    # Detect stream request from query param or Accept header
    is_stream = stream
    if request:
        if request.query_params.get("stream") in ("true", "1", "yes"):
            is_stream = True
        elif "text/event-stream" in request.headers.get("accept", ""):
            is_stream = True

    if is_stream:
        return StreamingResponse(
            sse_project_sync_generator(project_id, extra=extra),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "Access-Control-Allow-Origin": "*",
            },
        )

    try:
        res = await publish_project_sync_event(project_id, extra=extra)
        return JSONResponse(status_code=200, content=res)
    except Exception as exc:
        logger.error(f"[Calibrator Sync] Failed: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"status": "error", "error": str(exc), "project_id": str(project_id)},
        )
