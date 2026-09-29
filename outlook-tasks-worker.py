"""
Outlook Tasks Worker

Consumes task events from Redis Streams and creates/updates tasks in Outlook via Microsoft Graph API.
Listens on events:outlook-tasks stream for routed Fieldy tasks.

Supports:
- Creating new tasks with due dates and priority
- Setting assignees
- Adding task descriptions with conversation links
- Detecting "send it" actions
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

try:
    import redis.asyncio as aioredis
except ImportError:
    aioredis = None

import httpx

logger = logging.getLogger("outlook.worker")


# =============================================================================
# MICROSOFT GRAPH API CLIENT
# =============================================================================
class MicrosoftGraphClient:
    """Creates and manages tasks in Outlook via Microsoft Graph API."""

    def __init__(self, access_token: Optional[str] = None):
        self.access_token = access_token or os.getenv("MICROSOFT_GRAPH_TOKEN", "")
        self.base_url = "https://graph.microsoft.com/v1.0"
        self._http_client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            headers = {
                "Authorization": f"Bearer {self.access_token}",
                "Content-Type": "application/json",
            }
            self._http_client = httpx.AsyncClient(headers=headers, timeout=15.0)
        return self._http_client

    async def create_task(
        self,
        title: str,
        description: str,
        due_date: Optional[str] = None,
        priority: str = "normal",  # "low", "normal", "high"
        assignee_email: Optional[str] = None,
        fieldy_conversation_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a task in Outlook To Do list.

        Args:
            title: Task title
            description: Task description
            due_date: Due date (ISO 8601 or relative like "today", "tomorrow")
            priority: Task priority
            assignee_email: Email of person to assign task to
            fieldy_conversation_id: Link back to Fieldy conversation

        Returns:
            Task data from Graph API response
        """
        try:
            client = self._get_client()

            # Convert relative dates to ISO 8601
            resolved_due_date = self._resolve_due_date(due_date)

            # Map priority
            importance = "high" if priority == "urgent" else "normal" if priority in ("high", "normal") else "low"

            # Build task payload
            payload: Dict[str, Any] = {
                "title": title[:255],  # Outlook limit
                "body": {
                    "content": description + (
                        f"\n\n---\nFieldy Conversation: {fieldy_conversation_id}"
                        if fieldy_conversation_id
                        else ""
                    ),
                    "contentType": "text",
                },
                "importance": importance,
                "isReminderOn": True,
            }

            if resolved_due_date:
                payload["dueDateTime"] = {
                    "dateTime": resolved_due_date,
                    "timeZone": "UTC",
                }

            # Create in Outlook default To Do list
            url = f"{self.base_url}/me/todo/lists/tasks/tasks"
            resp = await client.post(url, json=payload)
            resp.raise_for_status()

            task_data = resp.json()
            logger.info(f"[Outlook] Created task: {task_data.get('id')} - '{title}'")

            return {
                "status": "created",
                "task_id": task_data.get("id"),
                "web_link": task_data.get("webLink"),
            }

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                logger.error("[Outlook] Unauthorized - token expired or invalid")
            elif e.response.status_code == 403:
                logger.error("[Outlook] Forbidden - insufficient permissions")
            else:
                logger.error(f"[Outlook] HTTP {e.response.status_code}: {e.response.text}")
            return {"status": "error", "reason": f"HTTP {e.response.status_code}"}

        except Exception as e:
            logger.error(f"[Outlook] Failed to create task: {e}")
            return {"status": "error", "reason": str(e)}

    async def update_task(
        self,
        task_id: str,
        **kwargs,
    ) -> Dict[str, Any]:
        """Update an existing task."""
        try:
            client = self._get_client()

            payload = {}
            if "title" in kwargs:
                payload["title"] = kwargs["title"][:255]
            if "description" in kwargs:
                payload["body"] = {"content": kwargs["description"], "contentType": "text"}
            if "priority" in kwargs:
                payload["importance"] = "high" if kwargs["priority"] == "urgent" else "normal"
            if "due_date" in kwargs:
                resolved_date = self._resolve_due_date(kwargs["due_date"])
                if resolved_date:
                    payload["dueDateTime"] = {"dateTime": resolved_date, "timeZone": "UTC"}

            url = f"{self.base_url}/me/todo/lists/tasks/tasks/{task_id}"
            resp = await client.patch(url, json=payload)
            resp.raise_for_status()

            logger.info(f"[Outlook] Updated task: {task_id}")
            return {"status": "updated", "task_id": task_id}

        except Exception as e:
            logger.error(f"[Outlook] Failed to update task {task_id}: {e}")
            return {"status": "error", "reason": str(e)}

    def _resolve_due_date(self, due_date: Optional[str]) -> Optional[str]:
        """Convert relative date strings to ISO 8601."""
        if not due_date:
            return None

        due_lower = due_date.lower()
        now = datetime.utcnow()

        if due_lower == "today":
            return now.isoformat() + "Z"
        elif due_lower == "tomorrow":
            return (now + timedelta(days=1)).isoformat() + "Z"
        elif due_lower == "this week":
            # End of this week (Friday)
            days_until_friday = (4 - now.weekday()) % 7
            if days_until_friday == 0:
                days_until_friday = 7
            return (now + timedelta(days=days_until_friday)).isoformat() + "Z"
        elif due_lower == "this month":
            # End of month
            if now.month == 12:
                end_of_month = datetime(now.year + 1, 1, 1) - timedelta(days=1)
            else:
                end_of_month = datetime(now.year, now.month + 1, 1) - timedelta(days=1)
            return end_of_month.isoformat() + "Z"
        elif due_lower.startswith("next"):
            # "next friday", "next monday", etc.
            parts = due_lower.split()
            if len(parts) == 2:
                day_name = parts[1]
                # Simple: add 7 days
                return (now + timedelta(days=7)).isoformat() + "Z"
        elif "/" in due_date or "-" in due_date:
            # MM/DD or MM-DD format - assume current year
            try:
                parsed = datetime.strptime(due_date.replace("-", "/"), "%m/%d")
                parsed = parsed.replace(year=now.year)
                if parsed < now:
                    parsed = parsed.replace(year=now.year + 1)
                return parsed.isoformat() + "Z"
            except Exception:
                pass

        # If already in ISO format, return as-is
        if "T" in due_date and ("Z" in due_date or "+" in due_date):
            return due_date

        return None

    async def close(self):
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()


# =============================================================================
# OUTLOOK TASKS WORKER
# =============================================================================
class OutlookTasksWorker:
    """Consumes task events from Redis and creates them in Outlook."""

    def __init__(self):
        self.graph_client = MicrosoftGraphClient()
        self._redis: Optional[aioredis.Redis] = None
        self._running = False

    async def connect(self) -> None:
        """Connect to Redis."""
        if aioredis is None:
            raise RuntimeError("redis package required: pip install redis")

        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        redis_password = os.getenv("REDIS_PASSWORD", "")

        if redis_password and "@" not in redis_url:
            redis_url = redis_url.replace("redis://", f"redis://:{redis_password}@", 1)

        self._redis = aioredis.from_url(redis_url, decode_responses=False)
        await self._redis.ping()
        logger.info("[OutlookWorker] Connected to Redis")

        # Create consumer group if needed
        try:
            await self._redis.xgroup_create("events:outlook-tasks", "outlook_group", id="0", mkstream=True)
            logger.info("[OutlookWorker] Created consumer group 'outlook_group'")
        except Exception as e:
            if "BUSYGROUP" not in str(e):
                logger.warning(f"[OutlookWorker] Consumer group note: {e}")

    async def process_message(self, msg_id: bytes, fields: Dict[bytes, bytes]) -> None:
        """Process a single task event from Redis."""
        try:
            payload = fields.get(b"payload") or b"{}"
            data = json.loads(payload.decode("utf-8", errors="replace"))

            task = data.get("task", {})
            routing = data.get("routing", {})
            fieldy_id = data.get("fieldy_conversation_id", "")

            logger.info(f"[OutlookWorker] Processing task: {task.get('title')}")

            # Create task in Outlook
            result = await self.graph_client.create_task(
                title=task.get("title", "Untitled Task"),
                description=task.get("description", ""),
                due_date=task.get("due_date"),
                priority=task.get("priority", "normal"),
                assignee_email=task.get("assignee"),
                fieldy_conversation_id=fieldy_id,
            )

            if result.get("status") == "created":
                # Acknowledge message
                await self._redis.xack("events:outlook-tasks", "outlook_group", msg_id)
                logger.info(f"[OutlookWorker] Task created: {result.get('task_id')}")

                # If email_action detected, log for later processing
                if task.get("email_action"):
                    logger.warning(
                        f"[OutlookWorker] EMAIL ACTION DETECTED: '{task.get('title')}' - "
                        f"User said 'ok send it'. Task created but manual approval may be needed."
                    )
            else:
                logger.error(f"[OutlookWorker] Failed to create task: {result.get('reason')}")
                # Don't ACK - let it retry

        except Exception as e:
            logger.error(f"[OutlookWorker] Error processing message: {e}", exc_info=True)

    async def run(self) -> None:
        """Main event loop - listen to Redis stream."""
        await self.connect()
        self._running = True

        logger.info("[OutlookWorker] Listening for task events...")

        while self._running:
            try:
                # Read from stream
                read_res = await self._redis.xreadgroup(
                    "outlook_group",
                    f"outlook-worker-{os.getpid()}",
                    {"events:outlook-tasks": ">"},
                    count=5,
                    block=2000,
                )

                if not read_res:
                    await asyncio.sleep(0.01)
                    continue

                for stream_key, messages in read_res:
                    for msg_id, fields in messages:
                        await self.process_message(msg_id, fields)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[OutlookWorker] Stream loop error: {e}")
                await asyncio.sleep(1.0)

    async def stop(self) -> None:
        """Gracefully stop."""
        self._running = False
        if self._redis:
            await self._redis.close()
        await self.graph_client.close()
        logger.info("[OutlookWorker] Stopped")


# =============================================================================
# CLI ENTRYPOINT
# =============================================================================
async def main():
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    worker = OutlookTasksWorker()

    # Handle signals
    loop = asyncio.get_running_loop()
    for sig in (asyncio.SIGINT, asyncio.SIGTERM):
        try:
            loop.add_signal_handler(sig, lambda w=worker: asyncio.create_task(w.stop()))
        except NotImplementedError:
            pass  # Windows

    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
