"""
Fieldy Conversation → Task Automation Pipeline

Listens for Fieldy conversation webhooks, extracts actionable tasks,
and routes them to Outlook Tasks (immediate), Asana (eventual),
or agent execution (complex/ambiguous cases).

Design Principles:
1. Fieldy is the authoritative source of truth for conversations & tasks
2. Real-time processing via webhook listener
3. Smart routing: deterministic → Outlook (programmed), ambiguous → Agent
4. Priority scoring via keywords (ASAP, urgent, today)
5. Audit trail: Task linked back to original Fieldy conversation
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger("fieldy.worker")


# =============================================================================
# ENUMS & DATA STRUCTURES
# =============================================================================
class TaskPriority(str, Enum):
    """Task urgency level."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class TaskAction(str, Enum):
    """Extracted action type."""
    REMINDER = "reminder"
    SCHEDULE_MEETING = "schedule_meeting"
    SEND_EMAIL = "send_email"
    FOLLOW_UP = "follow_up"
    DECISION = "decision"
    RESEARCH = "research"
    OTHER = "other"


@dataclass
class ExtractedTask:
    """Structured task extracted from Fieldy conversation."""
    conversation_id: str
    speaker: str  # Person who needs the task done
    action_type: TaskAction
    title: str
    description: str
    due_date: Optional[str] = None  # ISO 8601 or relative ("today", "tomorrow", "Friday")
    priority: TaskPriority = TaskPriority.NORMAL
    assignee: Optional[str] = None  # Person assigned (may be None → needs agent)
    dependencies: List[str] = field(default_factory=list)  # "after X is done"
    email_action: bool = False  # "ok send it" detected
    confidence: float = 0.9
    payload_hash: str = field(default="")

    def __post_init__(self):
        """Compute hash for idempotency."""
        content = f"{self.conversation_id}:{self.title}:{self.speaker}:{self.action_type}"
        self.payload_hash = hashlib.sha256(content.encode()).hexdigest()

    @property
    def needs_agent(self) -> bool:
        """Determine if task requires agent routing (complex/ambiguous)."""
        # Agent needed if: unclear assignee OR complex dependencies
        has_unclear_assignee = self.assignee is None
        has_dependencies = len(self.dependencies) > 0
        return has_unclear_assignee or has_dependencies


@dataclass
class FieldyConversation:
    """Fieldy conversation data fetched from API."""
    id: str
    title: str
    summary: str
    speakers: List[str]
    participants: List[str]
    duration_seconds: int
    recorded_at: str
    location: Optional[str] = None
    calendar_event_title: Optional[str] = None
    transcript: str = ""


# =============================================================================
# FIELDY API CLIENT
# =============================================================================
class FieldyAPIClient:
    """Fetches conversation data from Fieldy API."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("FIELDY_API_KEY", "")
        self.base_url = "https://api.fieldy.ai/api/public/v2"
        self._http_client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=15.0,
            )
        return self._http_client

    async def get_conversation(self, conversation_id: str) -> Optional[FieldyConversation]:
        """Fetch full conversation details from Fieldy API."""
        try:
            client = self._get_client()
            url = f"{self.base_url}/conversations/{conversation_id}"
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

            return FieldyConversation(
                id=data.get("id", ""),
                title=data.get("title", ""),
                summary=data.get("summary", ""),
                speakers=data.get("speakers", []),
                participants=data.get("participants", []),
                duration_seconds=data.get("duration_seconds", 0),
                recorded_at=data.get("recorded_at", ""),
                location=data.get("location"),
                calendar_event_title=data.get("calendar_event_title"),
                transcript=data.get("transcript", ""),
            )
        except Exception as e:
            logger.error(f"[Fieldy API] Failed to fetch conversation {conversation_id}: {e}")
            return None

    async def close(self):
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()


# =============================================================================
# TASK EXTRACTION ENGINE
# =============================================================================
class TaskExtractor:
    """Extracts structured tasks from Fieldy conversations."""

    def __init__(self):
        # Priority keywords for scoring
        self.urgent_keywords = {"asap", "urgent", "critical", "emergency", "immediately", "right now"}
        self.high_keywords = {"today", "this afternoon", "this evening", "before close", "eod"}
        self.medium_keywords = {"tomorrow", "this week", "soon", "next few days"}

        # Action detection patterns
        self.action_patterns = {
            TaskAction.REMINDER: [
                r"remind\s+(?:me|us)\s+to\s+(.+?)(?:\s+(?:on|by|in|at)|$)",
                r"(?:don't forget|remember)\s+to\s+(.+?)(?:\s+(?:on|by|in|at)|$)",
            ],
            TaskAction.SCHEDULE_MEETING: [
                r"(?:schedule|book|set up)\s+(?:a\s+)?meeting\s+(?:with|to)\s+(.+?)(?:\s+(?:on|by|for)|$)",
                r"calendar invite\s+(?:to|for)\s+(.+?)(?:\s+(?:on|by|for)|$)",
            ],
            TaskAction.SEND_EMAIL: [
                r"send\s+(?:an?\s+)?email\s+(?:to|about)\s+(.+?)(?:\s+(?:with|saying|about)|$)",
                r"email\s+(.+?)\s+(?:about|regarding|with)\s+(.+?)(?:\s+(?:on|by|in)|$)",
            ],
            TaskAction.FOLLOW_UP: [
                r"follow\s+up\s+(?:on|with|about)\s+(.+?)(?:\s+(?:in|on|by)|$)",
                r"check\s+(?:on|with)\s+(.+?)(?:\s+(?:in|on|by)|$)",
            ],
            TaskAction.DECISION: [
                r"decide\s+(?:on|about)\s+(.+?)(?:\s+by|$)",
                r"(?:make a\s+)?decision\s+(?:on|about|regarding)\s+(.+?)(?:\s+by|$)",
            ],
        }

        # Dependency patterns
        self.dependency_patterns = [
            r"after\s+(.+?)\s+(?:is\s+)?(?:done|complete)",
            r"once\s+(.+?)\s+(?:is\s+)?(?:done|complete)",
            r"depends on\s+(.+?)(?:\s+(?:being|is)|$)",
        ]

        # Email action pattern
        self.email_action_pattern = r"(?:ok|yes|approved|sure)[,.]?\s+send\s+(?:it|the email|that)"

    def score_priority(self, text: str) -> TaskPriority:
        """Assign priority based on keywords."""
        text_lower = text.lower()

        if any(kw in text_lower for kw in self.urgent_keywords):
            return TaskPriority.URGENT
        if any(kw in text_lower for kw in self.high_keywords):
            return TaskPriority.HIGH
        if any(kw in text_lower for kw in self.medium_keywords):
            return TaskPriority.NORMAL
        return TaskPriority.LOW

    def extract_action_type(self, text: str) -> TaskAction:
        """Detect action type from text patterns."""
        for action, patterns in self.action_patterns.items():
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    return action
        return TaskAction.OTHER

    def extract_due_date(self, text: str) -> Optional[str]:
        """Extract due date (relative or absolute)."""
        # Relative dates
        if re.search(r"\btoday\b", text, re.IGNORECASE):
            return "today"
        if re.search(r"\btomorrow\b", text, re.IGNORECASE):
            return "tomorrow"
        if re.search(r"\b(?:this\s+)?(?:Friday|Monday|Tuesday|Wednesday|Thursday|Saturday|Sunday)\b", text, re.IGNORECASE):
            day = re.search(r"\b((?:this\s+)?(?:Friday|Monday|Tuesday|Wednesday|Thursday|Saturday|Sunday))\b", text, re.IGNORECASE).group(1)
            return day.lower()
        if re.search(r"\b(?:this|next)\s+week\b", text, re.IGNORECASE):
            return "this week"
        if re.search(r"\b(?:this|next)\s+month\b", text, re.IGNORECASE):
            return "this month"

        # Date patterns (MM/DD, MM-DD)
        date_match = re.search(r"(\d{1,2}[-/]\d{1,2})", text)
        if date_match:
            return date_match.group(1)

        return None

    def extract_dependencies(self, text: str) -> List[str]:
        """Extract task dependencies."""
        dependencies = []
        for pattern in self.dependency_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            dependencies.extend(matches)
        return dependencies

    def detect_email_action(self, text: str) -> bool:
        """Detect "ok send it" pattern."""
        return bool(re.search(self.email_action_pattern, text, re.IGNORECASE))

    def extract_assignee(self, text: str, participants: List[str]) -> Optional[str]:
        """Extract assignee from text and participant list."""
        # Look for "assign to X" or "X should do this"
        assign_match = re.search(r"(?:assign\s+to|give\s+to|for)\s+(\w+)", text, re.IGNORECASE)
        if assign_match:
            assignee_name = assign_match.group(1)
            # Try to match against participants (case-insensitive)
            for participant in participants:
                if assignee_name.lower() in participant.lower() or participant.lower() in assignee_name.lower():
                    return participant
            return assignee_name

        return None

    async def extract_tasks(
        self,
        conversation: FieldyConversation,
    ) -> List[ExtractedTask]:
        """Extract all tasks from conversation."""
        tasks = []
        text = conversation.transcript or conversation.summary

        # Simple heuristic: split by sentences and look for action words
        sentences = re.split(r"[.!?]+", text)

        for sentence in sentences:
            sentence = sentence.strip()
            if not sentence or len(sentence) < 10:
                continue

            # Check if sentence contains action keywords
            if not any(kw in sentence.lower() for kw in ["remind", "schedule", "send", "follow", "decide", "email", "meeting"]):
                continue

            action_type = self.extract_action_type(sentence)
            if action_type == TaskAction.OTHER:
                continue

            priority = self.score_priority(sentence)
            due_date = self.extract_due_date(sentence)
            dependencies = self.extract_dependencies(sentence)
            email_action = self.detect_email_action(sentence)
            assignee = self.extract_assignee(sentence, conversation.participants)

            # Infer speaker from context (first speaker or from sentence)
            speaker = conversation.speakers[0] if conversation.speakers else "Unknown"

            task = ExtractedTask(
                conversation_id=conversation.id,
                speaker=speaker,
                action_type=action_type,
                title=sentence[:100],  # First 100 chars as title
                description=sentence,
                due_date=due_date,
                priority=priority,
                assignee=assignee,
                dependencies=dependencies,
                email_action=email_action,
                confidence=0.85,
            )

            tasks.append(task)

        logger.info(
            f"[TaskExtractor] Extracted {len(tasks)} tasks from conversation {conversation.id}: "
            f"{[t.action_type.value for t in tasks]}"
        )
        return tasks


# =============================================================================
# TASK ROUTER (Programmed vs. Agent)
# =============================================================================
class TaskRouter:
    """Routes extracted tasks to appropriate handler."""

    def __init__(self, redis_client: Optional[Any] = None):
        self.redis = redis_client

    async def route(self, task: ExtractedTask) -> Dict[str, Any]:
        """Determine routing: programmed (Outlook) vs. agent execution."""
        routing_decision = {
            "task_id": task.payload_hash,
            "conversation_id": task.conversation_id,
            "action_type": task.action_type.value,
            "needs_agent": task.needs_agent,
            "priority": task.priority.value,
        }

        if task.needs_agent:
            # Complex/ambiguous → route to agent
            routing_decision["destination"] = "AGENT_EXECUTOR"
            routing_decision["reason"] = (
                "Agent routing: "
                + ("unclear assignee, " if task.assignee is None else "")
                + ("complex dependencies" if task.dependencies else "")
            ).rstrip(", ")
            logger.info(f"[TaskRouter] → AGENT: {task.title}")
        else:
            # Simple & clear → programmed response (Outlook)
            routing_decision["destination"] = "OUTLOOK_TASKS"
            routing_decision["reason"] = "Deterministic routing to Outlook Tasks"
            logger.info(f"[TaskRouter] → OUTLOOK: {task.title}")

        return routing_decision


# =============================================================================
# MAIN FIELDY WORKER
# =============================================================================
class FieldyTaskWorker:
    """Main worker: listen for Fieldy webhooks, extract tasks, route them."""

    def __init__(self):
        self.fieldy_client = FieldyAPIClient()
        self.extractor = TaskExtractor()
        self.router = TaskRouter()
        self._processed_tasks: Dict[str, float] = {}  # For idempotency

    async def process_fieldy_webhook(self, webhook_payload: Dict[str, Any]) -> Dict[str, Any]:
        """Process incoming Fieldy webhook (triggered by new conversation)."""
        conversation_id = webhook_payload.get("conversation_id") or webhook_payload.get("id")
        if not conversation_id:
            logger.error(f"[FieldyWorker] Invalid webhook payload (no conversation_id): {webhook_payload}")
            return {"status": "error", "reason": "missing conversation_id"}

        logger.info(f"[FieldyWorker] Received webhook for conversation {conversation_id}")

        # 1. Fetch full conversation from Fieldy API
        conversation = await self.fieldy_client.get_conversation(conversation_id)
        if not conversation:
            return {"status": "error", "reason": f"could not fetch conversation {conversation_id}"}

        logger.info(f"[FieldyWorker] Fetched conversation: '{conversation.title}' ({len(conversation.transcript)} chars)")

        # 2. Extract tasks
        tasks = await self.extractor.extract_tasks(conversation)
        if not tasks:
            logger.info(f"[FieldyWorker] No actionable tasks found in conversation {conversation_id}")
            return {"status": "success", "tasks_extracted": 0, "conversation_id": conversation_id}

        # 3. Route each task
        routed_tasks = []
        for task in tasks:
            # Skip duplicates (idempotency)
            if task.payload_hash in self._processed_tasks:
                logger.info(f"[FieldyWorker] Skipping duplicate task (hash: {task.payload_hash[:12]})")
                continue

            routing = await self.router.route(task)
            routed_tasks.append({
                "task": {
                    "id": task.payload_hash,
                    "conversation_id": task.conversation_id,
                    "action_type": task.action_type.value,
                    "title": task.title,
                    "description": task.description,
                    "due_date": task.due_date,
                    "priority": task.priority.value,
                    "assignee": task.assignee,
                    "dependencies": task.dependencies,
                    "email_action": task.email_action,
                },
                "routing": routing,
            })

            # Mark as processed
            self._processed_tasks[task.payload_hash] = time.time()

        logger.info(
            f"[FieldyWorker] Routed {len(routed_tasks)} tasks: "
            f"{sum(1 for t in routed_tasks if t['routing']['destination'] == 'OUTLOOK_TASKS')} to Outlook, "
            f"{sum(1 for t in routed_tasks if t['routing']['destination'] == 'AGENT_EXECUTOR')} to Agent"
        )

        return {
            "status": "success",
            "conversation_id": conversation_id,
            "tasks_extracted": len(tasks),
            "tasks_routed": routed_tasks,
        }

    async def close(self):
        await self.fieldy_client.close()


# =============================================================================
# CLI ENTRYPOINT (for testing)
# =============================================================================
async def main():
    """Test the worker with a sample Fieldy conversation."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    worker = FieldyTaskWorker()

    # Test with sample webhook
    test_conversation_id = os.getenv("TEST_FIELDY_CONVERSATION_ID", "test-conv-123")
    result = await worker.process_fieldy_webhook({"conversation_id": test_conversation_id})
    print(json.dumps(result, indent=2))

    await worker.close()


if __name__ == "__main__":
    asyncio.run(main())
