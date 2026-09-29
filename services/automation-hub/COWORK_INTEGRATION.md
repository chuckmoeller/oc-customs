# Claude Cowork Integration Guide

Claude Cowork orchestrates the automation hub by:
1. Accessing Fieldy conversations (via Fieldy MCP tools)
2. Building workflow plans based on user intent
3. Calling the hub to execute actions (email, Slack, tasks)
4. Enriching output with Claude/Gemini analysis

## Tool Definitions for Claude Cowork

Add these tools to Claude Cowork:

### execute_workflow
Send workflow to hub for execution. Returns workflow_id for tracking.

**POST /orchestrate**

### get_workflow_status
Check status and results of a workflow execution.

**GET /orchestrations/{workflow_id}**

### list_dlq_items
List actions in dead-letter queue waiting for retry.

**GET /dlq**

### retry_dlq_item
Manually retry a failed action from DLQ.

**POST /dlq/{item_id}/retry**

## API Endpoints

Hub Base URL: `http://localhost:8090`

### POST /orchestrate
Execute workflow immediately.

### GET /orchestrations/{workflow_id}
Get workflow status and results.

### GET /dlq
List failed actions in queue.

### POST /dlq/{item_id}/retry
Retry a failed action.

## Example Workflows

### call-follow-up
Enrich + email + Slack + task after sales call

### deal-creation
Create deal record and notify team

### issue-escalation
Document issue and alert relevant teams

See README.md for full setup instructions.
