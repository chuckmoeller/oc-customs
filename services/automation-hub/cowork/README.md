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

Or read the task from a file (avoids shell quoting issues with long/multi-line text):

```bash
python run_session.py --file task.txt
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

## Fieldy integration (bridge pattern)

The Managed Agent has no direct connection to Fieldy — Fieldy's MCP server isn't
a locally-configured process with a discoverable URL, so it can't be added
directly to the agent's `mcp_servers`. Instead, Fieldy transcripts are fetched
by Claude Code (which has `mcp__fieldy__*` tools via a connected app) and handed
to `run_session.py` as the task input.

**Workflow** (ask Claude Code to do this — it's not a script you run yourself):

1. Say something like: *"Follow up on today's call with John — send an email,
   post to #deals, and create an Asana task."*
2. Claude Code uses `fieldy_search_conversations` / `fieldy_browse_conversations`
   to find the matching conversation, then `fieldy_get_conversation` to fetch
   the full transcript.
3. Claude Code writes the transcript + your instruction to a task file and runs:
   ```bash
   python run_session.py --file /path/to/task.txt
   ```
4. The Cowork agent executes the workflow and reports back.

This means you never paste a transcript — you just describe what you want in
terms of who/when/what, and Claude Code does the fetch-and-kick-off for you.

**Requires:** at least one recorded Fieldy conversation. As of 2026-09-29 this
account (free tier, 7-day history window) has zero recorded conversations —
`fieldy_search_conversations` returns `earliestConversationAt: null`. Record a
call/meeting with Fieldy first, then this flow works end-to-end.

**If you want it fully server-side** (agent calls Fieldy directly, no Claude Code
in the loop): find Fieldy's MCP server URL and an API key or OAuth credential in
Fieldy's account/developer settings, then it can be added to the agent's
`mcp_servers` + a vault credential — ask to have this wired up once you have
those details.
