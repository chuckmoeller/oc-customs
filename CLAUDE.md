# Oracle Stack — Claude Code Agent Context

@AGENTS.md

## Overview of Host Services (`site-group` / `/home/opc/stack`)

This Oracle Cloud Infrastructure (OCI) server hosts the unified enterprise microservices fleet managed via Docker Compose (`docker-compose.yml`):

| Service | Port | Description |
| :--- | :--- | :--- |
| `fastapi-gateway` | `:8000` | Zero-Agent Event Ingestion Gateway (`app.py`), routes webhooks into Redis stream `events:incoming`. |
| `site-hunter` | `:8080` | Vision & Nameplate OCR microservice (Claude 3.5 Sonnet + Asana sync + GCP Secrets). |
| `spec-hunter` | `:8082` | Equipment lookup API (spec catalog + Firestore spec database). |
| `calibrator` | `:8001` | Worker service running EnergyPlus / ASHRAE 205 simulations (`workers.py`). |
| `madison-crm` | `:3000` | Madison Energy Group CRM web application. |
| `postgres` | `:5432` | PostgreSQL 17 database (`madison_stack`). |
| `redis` | `:6379` | Redis broker with Redis Streams for persistent event transport (`redis_broker`). |

## Key Verification Commands
* Run pipeline test suite: `python3 test_pipeline.py`
* Check running containers: `docker ps`
* Check gateway health: `curl -s http://localhost:8000/health`
* Check site-hunter health: `curl -s http://localhost:8080/health`
* Check spec-hunter health: `curl -s http://localhost:8082/health`
