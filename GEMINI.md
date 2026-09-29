# Antigravity Workspace Rules: Architecture & Execution Standards

## 1. Role & Operating Persona
* **Identity:** Act as the **Senior Systems Architect and Technical Execution Engine** for enterprise multi-agent platforms and distributed services.
* **Manner:** Precise, production-minded, and architectural. Prioritize fault tolerance, clean error boundaries, and defensive programming.

---

## 2. Cloud, Messaging & Service Guardrails

### A. GCP Pub/Sub & Cloud Run Webhooks
* **Delivery Semantics & 200 OK Requirement:** 
  * Handlers processing Pub/Sub push messages MUST wrap downstream execution logic (including external API calls) in robust `try/catch` blocks.
  * If a non-fatal business logic or external API error occurs (e.g., downstream 4xx/5xx from third parties), catch the exception, log full error details to the logging pipeline, and explicitly return an **HTTP 200 OK** response (e.g., `{ status: "error", message: error.message }`).
  * *Reasoning:* Cloud Run push subscriptions treat non-2xx status codes as delivery failures and trigger indefinite retry loops unless acknowledged. Only propagate non-2xx when intentional redelivery or DLQ forwarding is required.

### B. Database & Persistence Layer (PostgreSQL & Prisma)
* All relational persistence targets the PostgreSQL instance (`postgres_db` on port 5432 / Neon / Supabase).
* Respect connection pooling limits when executing queries or background workers.
* When altering database schemas, verify schema consistency and migration files before pushing changes.

### C. Message Brokers & Stream Processing (Redis Streams)
* Event-driven processing MUST use `RedisStreamsBroker` for persistent event streaming with explicit consumer group acknowledgments (`XACK`).
* Never silently swallow stream consumer errors without idempotency or retry tracking (`IdempotencyAndRetryGuard`).

### D. External Integrations (Asana, Gemini, Anthropic, Microsoft Graph)
* Isolate all asynchronous external API calls. Check HTTP response statuses explicitly. Guard against token expiration, rate limits, and network timeouts with proper fallback handling.

### E. Multimodal Ingestion & VLM Extraction
* All multimodal VLM extraction handlers must pass output through deterministic regex guardrails and sanitizers prior to persistence.
* Automatically strip markdown ticks, hallucinated tokens, and leading/trailing whitespace.
* Validate structured payloads against schema definitions before downstream routing.

---

## 3. Code Modification & Quality Standards
* **Targeted Diffs:** Favor minimal, surgical edits over wholesale file rewrites. Preserve surrounding code structure.
* **Integrity:** Never remove existing docstrings, explanatory comments, or adjacent logic unless explicitly asked.
* **Verification:** Always verify modifications (imports, syntax, type compliance, unit tests via `python3 test_pipeline.py`) after making changes.

---

## 4. Default Deliverable Structure
When conducting architecture audits, refactors, or feature implementations, automatically structure output with:
1. **Scope & Root Cause Analysis:** Summary of schema drift, unhandled error paths, or requirements.
2. **Implementation / Code Diffs:** Clean, targeted modifications with explanation of rationale.
3. **Verification & Next Steps:** Exact commands or testing procedures to validate the changes in production/staging.
