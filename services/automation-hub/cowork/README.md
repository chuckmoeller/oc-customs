# Claude Cowork Orchestrator

Runs a Claude Managed Agent that calls the automation-hub via 4 custom tools:
`execute_workflow`, `get_workflow_status`, `list_dlq_items`, `retry_dlq_item`.

The agent talks to the live Cloud Run automation-hub:
`https://automation-hub-119254250994.us-central1.run.app`

## Setup

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...

# One-time: creates the agent + environment, saves IDs to .env
python setup.py
```

Re-running `setup.py` is safe — it skips creation if `AGENT_ID` / `ENVIRONMENT_ID`
are already in `.env`. To push agent changes (new system prompt, new tool), use
`client.beta.agents.update()` with the stored `AGENT_ID` rather than re-running
`setup.py` (which never re-creates once IDs exist).

## Run a session

```bash
python run_session.py "Send a follow-up email to john@acme.com about today's call, post a summary in #deals, and create an Asana task for next steps"
```

Or with no argument, it will prompt interactively.

The script:
1. Creates a session referencing the stored agent + environment
2. Opens the event stream
3. Sends your instruction as the kickoff message
4. Whenever the agent calls one of the 4 tools, dispatches an HTTP request to
   the automation-hub and returns the result
5. Prints the agent's text responses live, and a Console trace URL for the session

## Environment variables

- `ANTHROPIC_API_KEY` — required
- `AUTOMATION_HUB_URL` — override the automation-hub base URL (defaults to the
  Cloud Run URL above)
- `AGENT_ID` / `AGENT_VERSION` / `ENVIRONMENT_ID` — written by `setup.py`, read
  by `run_session.py`

## Wiring in Fieldy context

This orchestrator does not call Fieldy directly. Pass Fieldy transcript/context
in the task text you give `run_session.py`, e.g.:

```bash
python run_session.py "Here is the transcript from today's call with John Doe: [paste transcript]. Send a follow-up email and log the deal."
```

A future iteration could fetch the transcript automatically via the Fieldy MCP
tools before starting the session.
