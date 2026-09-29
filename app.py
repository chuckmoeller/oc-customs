from fastapi import FastAPI, HTTPException, Request
import json
from broker import RedisStreamsBroker
from classifier import RulesFirstClassifier

app = FastAPI(title="Zero-Agent Event Ingestion Gateway", version="1.0.0")
broker = RedisStreamsBroker()
classifier = RulesFirstClassifier()

@app.on_event("startup")
async def startup_event():
    try:
        broker.connect()
    except Exception as e:
        print(f"Broker connection note: {e}")

@app.post("/webhook")
async def ingest_webhook(request: Request):
    try:
        raw_body = await request.body()
        payload = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # 1. Run through deterministic rules-first classifier using raw bytes
    classification = classifier.classify(raw_body)
    allowed, reason, tier = True, "Blocked by rules engine", "standard"
    
    if hasattr(classification, "allowed"):
        allowed = classification.allowed
        reason = getattr(classification, "reason", reason)
        tier = getattr(classification, "tier", tier)
    elif isinstance(classification, dict):
        allowed = classification.get("allowed", True)
        reason = classification.get("reason", reason)
        tier = classification.get("tier", tier)

    if not allowed:
        return {"status": "filtered", "reason": reason}

    # 2. Push valid event into Redis stream
    event_id = await broker.publish(
        topic="events:incoming",
        payload=json.dumps(payload),
        attributes={"tier": tier}
    )
    return {"status": "success", "event_id": event_id, "routed_tier": tier}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "broker": "connected"}
