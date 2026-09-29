from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from enum import Enum

class ActionType(str, Enum):
    SEND_EMAIL = "send_email"
    SEND_SLACK = "send_slack"
    CREATE_TASK = "create_task"
    ENRICH = "enrich"

class ActionRequest(BaseModel):
    type: ActionType
    idempotency_key: str
    params: Dict[str, Any]
    timeout_seconds: int = 5
    retry_count: int = 0

class WorkflowRequest(BaseModel):
    workflow_name: str
    context: Dict[str, Any]
    actions: List[ActionRequest]

class ActionResult(BaseModel):
    action_type: ActionType
    idempotency_key: str
    status: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    duration_ms: float

class WorkflowResult(BaseModel):
    workflow_id: str
    workflow_name: str
    status: str
    created_at: str
    completed_at: Optional[str] = None
    results: List[ActionResult]
    failed_actions: List[Dict[str, Any]]
    dlq_count: int
