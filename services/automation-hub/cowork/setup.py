import os
from anthropic import Anthropic
from dotenv import load_dotenv, set_key

ENV_FILE = os.path.join(os.path.dirname(__file__), ".env")

SYSTEM_PROMPT = """You are the orchestration agent for Madison Energy Group's automation hub.

You have access to Fieldy conversation data (sales calls, meetings) provided by the user in context.
Your job is to turn that context into automated actions: sending follow-up emails, posting Slack
updates, creating Asana tasks, and enriching context with Claude analysis.

Always use execute_workflow to run these actions through the automation hub rather than describing
what should happen. Use get_workflow_status to confirm a workflow completed. If actions fail, check
list_dlq_items and use retry_dlq_item to retry them.

Be concise in your responses. After executing a workflow, briefly summarize what was sent/created and
to whom, and report any failures found in the DLQ."""

TOOLS = [
    {
        "type": "custom",
        "name": "execute_workflow",
        "description": "Send a workflow to the automation hub for execution. Returns workflow_id for tracking status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "workflow_name": {
                    "type": "string",
                    "description": "Name of workflow (e.g., 'call-follow-up', 'deal-creation', 'issue-escalation')"
                },
                "context": {
                    "type": "object",
                    "description": "Fieldy conversation data and other context",
                    "properties": {
                        "fieldy_conversation_id": {"type": "string"},
                        "fieldy_transcript": {"type": "string"},
                        "prospect_name": {"type": "string"},
                        "prospect_email": {"type": "string"},
                        "call_summary": {"type": "string"}
                    }
                },
                "actions": {
                    "type": "array",
                    "description": "List of actions to execute in sequence",
                    "items": {
                        "type": "object",
                        "properties": {
                            "type": {
                                "type": "string",
                                "enum": ["send_email", "send_slack", "create_task", "enrich"],
                                "description": "Action type"
                            },
                            "idempotency_key": {
                                "type": "string",
                                "description": "Unique key to prevent duplicate execution"
                            },
                            "params": {
                                "type": "object",
                                "description": "Action-specific parameters (recipients, channel, title, prompt, etc.)"
                            },
                            "timeout_seconds": {
                                "type": "integer",
                                "default": 5,
                                "description": "Timeout for this action"
                            }
                        },
                        "required": ["type", "idempotency_key", "params"]
                    }
                }
            },
            "required": ["workflow_name", "context", "actions"]
        }
    },
    {
        "type": "custom",
        "name": "get_workflow_status",
        "description": "Check the status and results of a workflow execution. Use to track progress and retrieve results.",
        "input_schema": {
            "type": "object",
            "properties": {
                "workflow_id": {
                    "type": "string",
                    "description": "The workflow ID returned from execute_workflow"
                }
            },
            "required": ["workflow_id"]
        }
    },
    {
        "type": "custom",
        "name": "list_dlq_items",
        "description": "List actions that failed and are waiting in the dead-letter queue for manual retry",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "default": 10,
                    "description": "Maximum number of failed items to return"
                }
            }
        }
    },
    {
        "type": "custom",
        "name": "retry_dlq_item",
        "description": "Manually retry a failed action from the dead-letter queue",
        "input_schema": {
            "type": "object",
            "properties": {
                "item_id": {
                    "type": "string",
                    "description": "The DLQ item ID from list_dlq_items"
                }
            },
            "required": ["item_id"]
        }
    }
]


def main():
    if not os.path.exists(ENV_FILE):
        open(ENV_FILE, "a").close()
    load_dotenv(ENV_FILE)

    client = Anthropic()

    environment_id = os.getenv("ENVIRONMENT_ID")
    if not environment_id:
        environment = client.beta.environments.create(
            name="automation-hub-cowork",
            config={"type": "cloud", "networking": {"type": "unrestricted"}},
        )
        environment_id = environment.id
        set_key(ENV_FILE, "ENVIRONMENT_ID", environment_id)
        print(f"Created environment: {environment_id}")
    else:
        print(f"Using existing environment: {environment_id}")

    agent_id = os.getenv("AGENT_ID")
    if not agent_id:
        agent = client.beta.agents.create(
            name="Automation Hub Orchestrator",
            model="claude-opus-4-8",
            system=SYSTEM_PROMPT,
            tools=TOOLS,
        )
        agent_id = agent.id
        set_key(ENV_FILE, "AGENT_ID", agent_id)
        set_key(ENV_FILE, "AGENT_VERSION", str(agent.version))
        print(f"Created agent: {agent_id} (version {agent.version})")
    else:
        print(f"Using existing agent: {agent_id}")

    print("\nSetup complete. IDs saved to .env")


if __name__ == "__main__":
    main()
