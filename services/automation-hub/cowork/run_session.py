import os
import sys
import json
import requests
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

BASE_URL = os.getenv(
    "AUTOMATION_HUB_URL",
    "https://automation-hub-119254250994.us-central1.run.app"
)

client = Anthropic()

AGENT_ID = os.environ["AGENT_ID"]
AGENT_VERSION = int(os.environ["AGENT_VERSION"])
ENVIRONMENT_ID = os.environ["ENVIRONMENT_ID"]


def call_tool(name, tool_input):
    try:
        if name == "execute_workflow":
            resp = requests.post(f"{BASE_URL}/orchestrate", json=tool_input, timeout=15)
        elif name == "get_workflow_status":
            workflow_id = tool_input["workflow_id"]
            resp = requests.get(f"{BASE_URL}/orchestrations/{workflow_id}", timeout=15)
        elif name == "list_dlq_items":
            resp = requests.get(
                f"{BASE_URL}/dlq", params={"limit": tool_input.get("limit", 10)}, timeout=15
            )
        elif name == "retry_dlq_item":
            item_id = tool_input["item_id"]
            resp = requests.post(f"{BASE_URL}/dlq/{item_id}/retry", timeout=15)
        else:
            return f"Unknown tool: {name}"

        resp.raise_for_status()
        return json.dumps(resp.json())
    except Exception as e:
        return f"Error calling {name}: {e}"


def main():
    task = " ".join(sys.argv[1:]) or input("What should the automation hub do? ")

    session = client.beta.sessions.create(
        agent={"type": "agent", "id": AGENT_ID, "version": AGENT_VERSION},
        environment_id=ENVIRONMENT_ID,
        title="Automation Hub Session",
    )
    print(f"Session: {session.id}")
    print(f"Trace: https://platform.claude.com/workspaces/default/sessions/{session.id}")

    with client.beta.sessions.events.stream(session_id=session.id) as stream:
        client.beta.sessions.events.send(
            session_id=session.id,
            events=[{"type": "user.message", "content": [{"type": "text", "text": task}]}],
        )

        for event in stream:
            if event.type == "agent.message":
                for block in event.content:
                    if block.type == "text":
                        print(block.text, end="", flush=True)
            elif event.type == "agent.custom_tool_use":
                print(f"\n[calling tool: {event.name}]")
                result = call_tool(event.name, event.input)
                client.beta.sessions.events.send(
                    session_id=session.id,
                    events=[{
                        "type": "user.custom_tool_result",
                        "custom_tool_use_id": event.id,
                        "content": [{"type": "text", "text": result}],
                    }],
                )
            elif event.type == "session.status_idle":
                if event.stop_reason.type != "requires_action":
                    break
            elif event.type == "session.status_terminated":
                break

    print("\nDone.")


if __name__ == "__main__":
    main()
