# Automation Hub

Orchestration engine that connects Fieldy conversations with Claude Cowork to trigger automated actions: emails, Slack messages, Asana tasks, and enriched analysis.

## Features

✅ **Orchestration Broker** - Single `/orchestrate` endpoint handles workflow execution
✅ **Resilience** - 5s timeout per action, fail-fast error handling
✅ **Dead Letter Queue** - Failed actions parked in Redis with manual retry
✅ **Idempotency** - Prevent duplicate actions via idempotency keys
✅ **Enrichment** - Use Claude or Gemini to analyze context and enhance actions
✅ **Audit Trail** - All workflows logged to PostgreSQL with results

## API

### Execute Workflow
POST /orchestrate
```bash
curl -X POST http://localhost:8090/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"workflow_name": "call-follow-up", "context": {...}, "actions": [...]}'
```

### Check Status
GET /orchestrations/{workflow_id}

### List Failed Actions
GET /dlq

## Setup

1. Copy `.env.example` → `.env` and fill in credentials
2. Add to docker-compose.yml (see COWORK_INTEGRATION.md)
3. Deploy: `docker compose up -d automation-hub`

See COWORK_INTEGRATION.md for Claude Cowork integration.
