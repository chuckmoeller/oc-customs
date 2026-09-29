import os
import json
from datetime import datetime

DB_PATH = os.getenv("DB_PATH", "/tmp/automation_hub.db")

# Simple in-memory workflow storage (SQLite for Cloud Run without async complexity)
workflows_db = {}

class Workflow:
    def __init__(self, workflow_id, workflow_name, status, context, results, created_at, completed_at):
        self.workflow_id = workflow_id
        self.workflow_name = workflow_name
        self.status = status
        self.context = context
        self.results = results
        self.created_at = created_at
        self.completed_at = completed_at

async def get_db_pool():
    return workflows_db

def init_db():
    pass

async def get_session():
    return workflows_db
