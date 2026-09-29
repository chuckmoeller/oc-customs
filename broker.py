"""
Zero-Agent Transport Layer ("Dumb Pipe"), Idempotency Guard & Strict Retry Ceiling.

Design Principles:
1. Pure byte transport only. Zero business logic, schema interpretation, or AI code.
2. Dual target: Redis Streams (local dev / low latency) and Google Cloud Pub/Sub (production free tier).
3. Idempotency Guard: SHA-256 hash checks with Redis / memory cache to discard redeliveries immediately.
4. Hard Retry Ceiling: If a payload fails, retries are strictly capped at 3 or 5 attempts.
   Upon reaching the ceiling, the message is permanently diverted to the Dead Letter Queue (DLQ)
   and explicitly ACKed from the primary queue to halt infinite loops.
"""

from __future__ import annotations

import abc
import asyncio
import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, Optional, Union

logger = logging.getLogger("pipeline.broker")

# Allowed retry ceiling constants
ALLOWED_RETRY_CEILINGS = (3, 5)


# -----------------------------------------------------------------------------
# 1. Normalized Message Envelope
# -----------------------------------------------------------------------------
@dataclass
class BrokerMessage:
    """Raw, uninterpreted byte envelope passing through the dumb pipe."""
    message_id: str
    data: bytes
    attributes: Dict[str, str] = field(default_factory=dict)
    delivery_attempt: int = 1
    publish_time: float = field(default_factory=time.time)
    _ack_handle: Optional[Any] = None

    @property
    def payload_hash(self) -> str:
        """Deterministic SHA-256 hash of raw bytes for idempotency & retry tracking."""
        return hashlib.sha256(self.data).hexdigest()

    def text(self) -> str:
        """Decode raw bytes as UTF-8 string safely."""
        return self.data.decode("utf-8", errors="replace")

    def json(self) -> Dict[str, Any]:
        """Convenience parser for JSON payloads."""
        return json.loads(self.text())


# -----------------------------------------------------------------------------
# 2. Idempotency & Retry Tracker Guard
# -----------------------------------------------------------------------------
class IdempotencyAndRetryGuard:
    """
    Enforces two critical guardrails:
    1. Idempotency: Blocks duplicate processing of already completed payloads.
    2. Retry Ceiling: Enforces a hard cap of 3 or 5 delivery attempts per payload hash.
    """

    def __init__(
        self,
        redis_client=None,
        default_ttl_sec: int = 86400,
        max_delivery_attempts: int = 3,
    ):
        self.redis = redis_client
        self.default_ttl_sec = default_ttl_sec
        # Enforce that retry ceiling is strictly 3 or 5
        self.max_delivery_attempts = (
            max_delivery_attempts if max_delivery_attempts in ALLOWED_RETRY_CEILINGS else 3
        )

        # Fallback local in-memory caches
        self._processed_cache: Dict[str, float] = {}
        self._attempt_counts: Dict[str, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    async def is_duplicate(self, payload_hash: str) -> bool:
        """Returns True if this payload was already successfully completed."""
        namespaced_key = f"idempotency:done:{payload_hash}"

        if self.redis is not None:
            try:
                val = await self.redis.get(namespaced_key)
                return val is not None
            except Exception as e:
                logger.warning(f"[IdempotencyGuard] Redis check failed ({e}); falling back to memory.")

        async with self._lock:
            now = time.time()
            exp = self._processed_cache.get(namespaced_key, 0.0)
            return exp > now

    async def mark_success(self, payload_hash: str, ttl_sec: Optional[int] = None) -> None:
        """Marks payload as successfully completed so future redeliveries are dropped."""
        ttl = ttl_sec or self.default_ttl_sec
        namespaced_key = f"idempotency:done:{payload_hash}"

        if self.redis is not None:
            try:
                await self.redis.set(namespaced_key, "1", ex=ttl)
                await self.redis.delete(f"idempotency:attempts:{payload_hash}")
                return
            except Exception as e:
                logger.warning(f"[IdempotencyGuard] Redis mark_success failed: {e}")

        async with self._lock:
            self._processed_cache[namespaced_key] = time.time() + ttl
            if payload_hash in self._attempt_counts:
                del self._attempt_counts[payload_hash]

    async def record_and_get_attempt(self, payload_hash: str) -> int:
        """
        Increments and returns the attempt count for this payload.
        Atomically tracked via Redis INCR or in-memory dictionary.
        """
        namespaced_key = f"idempotency:attempts:{payload_hash}"

        if self.redis is not None:
            try:
                count = await self.redis.incr(namespaced_key)
                if count == 1:
                    await self.redis.expire(namespaced_key, self.default_ttl_sec)
                return int(count)
            except Exception as e:
                logger.warning(f"[RetryGuard] Redis attempt increment failed ({e}); using memory.")

        async with self._lock:
            now = time.time()
            record = self._attempt_counts.get(payload_hash)
            if not record or record["expires_at"] <= now:
                count = 1
            else:
                count = record["count"] + 1

            self._attempt_counts[payload_hash] = {
                "count": count,
                "expires_at": now + self.default_ttl_sec,
            }
            return count

    def is_exceeded(self, attempts: int) -> bool:
        """Checks if attempts have reached or exceeded the configured 3 or 5 ceiling."""
        return attempts >= self.max_delivery_attempts


# -----------------------------------------------------------------------------
# 3. Abstract Event Broker Interface
# -----------------------------------------------------------------------------
class BaseBroker(abc.ABC):
    """Abstract byte transport broker."""

    @abc.abstractmethod
    async def connect(self) -> None:
        """Initialize connections to the transport backend."""
        pass

    @abc.abstractmethod
    async def publish(
        self,
        topic: str,
        payload: Union[bytes, str],
        attributes: Optional[Dict[str, str]] = None,
    ) -> str:
        """Publish pure byte payload to the target stream/topic."""
        pass

    @abc.abstractmethod
    async def subscribe(
        self,
        topic_or_stream: str,
        group_or_sub: str,
        handler: Callable[[BrokerMessage], Awaitable[None]],
    ) -> None:
        """Subscribe and stream raw messages to the handler."""
        pass

    @abc.abstractmethod
    async def ack(self, message: BrokerMessage) -> None:
        """Acknowledge message processing completion."""
        pass

    @abc.abstractmethod
    async def nack(self, message: BrokerMessage) -> None:
        """Negative acknowledge or release back to the broker."""
        pass

    @abc.abstractmethod
    async def dead_letter(self, message: BrokerMessage, reason: str, attempts: int) -> None:
        """Route message to the dead-letter topic/stream."""
        pass

    @abc.abstractmethod
    async def close(self) -> None:
        """Close connections cleanly."""
        pass


# -----------------------------------------------------------------------------
# 4. Redis Streams Broker (Dev / Headless Container)
# -----------------------------------------------------------------------------
class RedisStreamsBroker(BaseBroker):
    """
    Zero-cost transport using local Redis Streams (XADD / XREADGROUP)
    with strict 3-to-5 retry ceiling and DLQ auto-parking.
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        consumer_name: str = "worker-1",
        dlq_stream: str = "pipeline:dlq",
        max_delivery_attempts: int = 3,
    ):
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self.consumer_name = consumer_name
        self.dlq_stream = dlq_stream
        self.max_delivery_attempts = (
            max_delivery_attempts if max_delivery_attempts in ALLOWED_RETRY_CEILINGS else 3
        )
        self.guard = IdempotencyAndRetryGuard(max_delivery_attempts=self.max_delivery_attempts)
        self._redis = None
        self._running = False

    async def connect(self) -> None:
        try:
            import redis.asyncio as aioredis
            self._redis = aioredis.from_url(self.redis_url, decode_responses=False)
            await self._redis.ping()
            self.guard.redis = self._redis
            logger.info(
                f"[RedisBroker] Connected to Redis at {self.redis_url} "
                f"(Max Delivery Attempts Ceiling: {self.max_delivery_attempts})"
            )
        except Exception as e:
            logger.error(f"[RedisBroker] Connection failed: {e}")
            raise

    async def publish(
        self,
        topic: str,
        payload: Union[bytes, str],
        attributes: Optional[Dict[str, str]] = None,
    ) -> str:
        if self._redis is None:
            await self.connect()

        raw_bytes = payload.encode("utf-8") if isinstance(payload, str) else payload
        attrs_json = json.dumps(attributes or {}).encode("utf-8")

        msg_id = await self._redis.xadd(
            topic,
            {
                "payload": raw_bytes,
                "attributes": attrs_json,
                "published_at": str(time.time()).encode("utf-8"),
            },
        )
        return msg_id.decode("utf-8") if isinstance(msg_id, bytes) else str(msg_id)

    async def subscribe(
        self,
        topic_or_stream: str,
        group_or_sub: str,
        handler: Callable[[BrokerMessage], Awaitable[None]],
    ) -> None:
        if self._redis is None:
            await self.connect()

        try:
            await self._redis.xgroup_create(topic_or_stream, group_or_sub, id="0", mkstream=True)
            logger.info(f"[RedisBroker] Created consumer group '{group_or_sub}' on '{topic_or_stream}'")
        except Exception as e:
            if "BUSYGROUP" not in str(e):
                logger.warning(f"[RedisBroker] Consumer group check notice: {e}")

        self._running = True
        logger.info(f"[RedisBroker] Listening on stream '{topic_or_stream}' as '{self.consumer_name}'...")

        while self._running:
            try:
                streams = await self._redis.xreadgroup(
                    group_or_sub,
                    self.consumer_name,
                    {topic_or_stream: ">"},
                    count=10,
                    block=2000,
                )

                if not streams:
                    await asyncio.sleep(0.01)
                    continue

                for _, messages in streams:
                    for raw_id, fields in messages:
                        mid = raw_id.decode("utf-8") if isinstance(raw_id, bytes) else str(raw_id)
                        payload_data = fields.get(b"payload") or b""
                        raw_attrs = fields.get(b"attributes") or b"{}"
                        try:
                            attrs = json.loads(raw_attrs.decode("utf-8"))
                        except Exception:
                            attrs = {}

                        msg = BrokerMessage(
                            message_id=mid,
                            data=payload_data,
                            attributes=attrs,
                            _ack_handle={"stream": topic_or_stream, "group": group_or_sub, "id": raw_id},
                        )

                        # 1. Idempotency Gate (Already successfully processed?)
                        if await self.guard.is_duplicate(msg.payload_hash):
                            logger.info(
                                f"[RedisBroker: DUP-SKIP] Message {mid} (hash {msg.payload_hash[:12]}) "
                                "already completed. Immediate ACK."
                            )
                            await self.ack(msg)
                            continue

                        # 2. Strict Delivery Attempts Ceiling Gate
                        attempts = await self.guard.record_and_get_attempt(msg.payload_hash)
                        msg.delivery_attempt = attempts

                        # If attempt count already exceeds ceiling before execution, park to DLQ immediately
                        if attempts > self.max_delivery_attempts:
                            logger.error(
                                f"[RedisBroker: CEILING-EXCEEDED] Message {mid} reached attempt {attempts} "
                                f"(Hard Ceiling: {self.max_delivery_attempts}). Diverting to DLQ & acking."
                            )
                            await self.dead_letter(
                                msg,
                                reason=f"Max delivery attempts exceeded ({attempts} > {self.max_delivery_attempts})",
                                attempts=attempts,
                            )
                            await self.ack(msg)
                            continue

                        # 3. Execute Handler with Failure Catch
                        try:
                            await handler(msg)
                            await self.guard.mark_success(msg.payload_hash)
                            await self.ack(msg)
                        except Exception as worker_err:
                            logger.warning(
                                f"[RedisBroker: FAIL] Message {mid} failed on attempt {attempts}/{self.max_delivery_attempts}: {worker_err}"
                            )
                            if attempts >= self.max_delivery_attempts:
                                # Reached hard ceiling (3 or 5) - halt retries permanently!
                                logger.critical(
                                    f"[RedisBroker: CEILING-REACHED] Message {mid} exhausted all {attempts} "
                                    f"attempts. Permanently moving to DLQ: {self.dlq_stream}"
                                )
                                await self.dead_letter(
                                    msg,
                                    reason=f"Exhausted {attempts}/{self.max_delivery_attempts} attempts. Last error: {worker_err}",
                                    attempts=attempts,
                                )
                                await self.ack(msg)  # Remove from main queue to stop loop
                            else:
                                # Backoff and release for next attempt
                                backoff_delay = 2 ** attempts
                                logger.info(f"[RedisBroker: RETRY] Backing off {backoff_delay}s before retry.")
                                await asyncio.sleep(backoff_delay)
                                await self.nack(msg)

            except asyncio.CancelledError:
                break
            except Exception as loop_err:
                logger.error(f"[RedisBroker] Stream loop error: {loop_err}")
                await asyncio.sleep(1.0)

    async def ack(self, message: BrokerMessage) -> None:
        if message._ack_handle and self._redis:
            h = message._ack_handle
            await self._redis.xack(h["stream"], h["group"], h["id"])

    async def nack(self, message: BrokerMessage) -> None:
        # Message is left in pending list for subsequent claim
        pass

    async def dead_letter(self, message: BrokerMessage, reason: str, attempts: int) -> None:
        if not self._redis:
            return
        attrs = dict(message.attributes)
        attrs["dlq_reason"] = reason
        attrs["delivery_attempts"] = str(attempts)
        attrs["failed_at"] = str(time.time())
        attrs["original_id"] = message.message_id
        await self.publish(self.dlq_stream, message.data, attrs)
        logger.warning(f"[RedisBroker: DLQ] Message {message.message_id} routed to {self.dlq_stream}: {reason}")

    async def close(self) -> None:
        self._running = False
        if self._redis:
            await self._redis.close()
            logger.info("[RedisBroker] Connection closed.")


# -----------------------------------------------------------------------------
# 5. Google Cloud Pub/Sub Broker (Production / 10 GiB Free Tier)
# -----------------------------------------------------------------------------
class GooglePubSubBroker(BaseBroker):
    """
    Production broker targeting Google Cloud Pub/Sub with strict 3-to-5 retry ceiling.
    """

    def __init__(
        self,
        project_id: str,
        dlq_topic: str = "dead-letter-events",
        default_ack_deadline_sec: int = 60,
        max_delivery_attempts: int = 3,
    ):
        self.project_id = project_id
        self.dlq_topic = dlq_topic
        self.default_ack_deadline_sec = default_ack_deadline_sec
        self.max_delivery_attempts = (
            max_delivery_attempts if max_delivery_attempts in ALLOWED_RETRY_CEILINGS else 3
        )
        self.guard = IdempotencyAndRetryGuard(max_delivery_attempts=self.max_delivery_attempts)
        self._publisher = None
        self._subscriber = None
        self._running = False

    async def connect(self) -> None:
        from google.cloud import pubsub_v1

        self._publisher = pubsub_v1.PublisherClient()
        self._subscriber = pubsub_v1.SubscriberClient()
        logger.info(
            f"[PubSubBroker] Initialized for GCP project {self.project_id} "
            f"(Hard Retry Ceiling: {self.max_delivery_attempts})"
        )

    def _topic_path(self, topic: str) -> str:
        if topic.startswith("projects/"):
            return topic
        return f"projects/{self.project_id}/topics/{topic}"

    def _sub_path(self, subscription: str) -> str:
        if subscription.startswith("projects/"):
            return subscription
        return f"projects/{self.project_id}/subscriptions/{subscription}"

    async def publish(
        self,
        topic: str,
        payload: Union[bytes, str],
        attributes: Optional[Dict[str, str]] = None,
    ) -> str:
        if self._publisher is None:
            await self.connect()

        raw_bytes = payload.encode("utf-8") if isinstance(payload, str) else payload
        attrs = attributes or {}
        topic_path = self._topic_path(topic)

        loop = asyncio.get_running_loop()
        future = self._publisher.publish(topic_path, raw_bytes, **attrs)
        message_id = await loop.run_in_executor(None, future.result)
        return str(message_id)

    async def subscribe(
        self,
        topic_or_stream: str,
        group_or_sub: str,
        handler: Callable[[BrokerMessage], Awaitable[None]],
    ) -> None:
        if self._subscriber is None:
            await self.connect()

        sub_path = self._sub_path(group_or_sub)
        loop = asyncio.get_running_loop()
        self._running = True

        def sync_callback(pubsub_msg):
            mid = pubsub_msg.message_id
            data = pubsub_msg.data
            attrs = dict(pubsub_msg.attributes)
            native_attempt = getattr(pubsub_msg, "delivery_attempt", 1)

            broker_msg = BrokerMessage(
                message_id=mid,
                data=data,
                attributes=attrs,
                delivery_attempt=native_attempt,
                _ack_handle=pubsub_msg,
            )

            asyncio.run_coroutine_threadsafe(
                self._handle_with_guards(broker_msg, handler), loop
            )

        flow_control = {"max_messages": 100}
        streaming_pull_future = self._subscriber.subscribe(
            sub_path, callback=sync_callback, flow_control=flow_control
        )
        logger.info(f"[PubSubBroker] Listening on subscription '{sub_path}'...")

        try:
            while self._running:
                await asyncio.sleep(1.0)
        finally:
            streaming_pull_future.cancel()

    async def _handle_with_guards(
        self,
        msg: BrokerMessage,
        handler: Callable[[BrokerMessage], Awaitable[None]],
    ) -> None:
        """Executes idempotency, retry count enforcement, and guaranteed DLQ routing on failures."""
        # 1. Idempotency Check
        if await self.guard.is_duplicate(msg.payload_hash):
            logger.info(
                f"[PubSubBroker: DUP-SKIP] Message {msg.message_id} (hash {msg.payload_hash[:12]}) "
                "already completed. Immediate ACK."
            )
            await self.ack(msg)
            return

        # 2. Reconcile delivery attempts (Native Pub/Sub attempt + local tracked attempt)
        tracked_attempts = await self.guard.record_and_get_attempt(msg.payload_hash)
        effective_attempts = max(msg.delivery_attempt, tracked_attempts)
        msg.delivery_attempt = effective_attempts

        # 3. Hard Retry Ceiling Check BEFORE Execution
        if effective_attempts > self.max_delivery_attempts:
            logger.error(
                f"[PubSubBroker: CEILING-EXCEEDED] Message {msg.message_id} reached attempt {effective_attempts} "
                f"(Hard Ceiling: {self.max_delivery_attempts}). Diverting to DLQ & acking."
            )
            await self.dead_letter(
                msg,
                reason=f"Max delivery attempts exceeded ({effective_attempts} > {self.max_delivery_attempts})",
                attempts=effective_attempts,
            )
            await self.ack(msg)
            return

        # 4. Execute Handler
        try:
            await handler(msg)
            await self.guard.mark_success(msg.payload_hash)
            await self.ack(msg)
        except Exception as err:
            logger.warning(
                f"[PubSubBroker: FAIL] Message {msg.message_id} failed on attempt {effective_attempts}/{self.max_delivery_attempts}: {err}"
            )
            if effective_attempts >= self.max_delivery_attempts:
                # Reached hard ceiling (3 or 5) - halt retries permanently!
                logger.critical(
                    f"[PubSubBroker: CEILING-REACHED] Message {msg.message_id} exhausted all {effective_attempts} "
                    f"attempts. Permanently moving to DLQ: {self.dlq_topic}"
                )
                await self.dead_letter(
                    msg,
                    reason=f"Exhausted {effective_attempts}/{self.max_delivery_attempts} attempts. Last error: {err}",
                    attempts=effective_attempts,
                )
                await self.ack(msg)  # ACK original so Pub/Sub does not flood with retries!
            else:
                # Release for next redelivery within allowed retry budget
                await self.nack(msg)

    async def ack(self, message: BrokerMessage) -> None:
        if message._ack_handle:
            try:
                message._ack_handle.ack()
            except Exception as e:
                logger.warning(f"[PubSubBroker] ACK failed: {e}")

    async def nack(self, message: BrokerMessage) -> None:
        if message._ack_handle:
            try:
                message._ack_handle.nack()
            except Exception as e:
                logger.warning(f"[PubSubBroker] NACK failed: {e}")

    async def dead_letter(self, message: BrokerMessage, reason: str, attempts: int) -> None:
        attrs = dict(message.attributes)
        attrs["dlq_reason"] = reason
        attrs["delivery_attempts"] = str(attempts)
        attrs["original_message_id"] = message.message_id
        attrs["failed_at"] = str(time.time())
        try:
            await self.publish(self.dlq_topic, message.data, attrs)
            logger.warning(f"[PubSubBroker: DLQ] Message {message.message_id} routed to {self.dlq_topic}")
        except Exception as e:
            logger.critical(f"[PubSubBroker: DLQ FAILURE] Could not route to DLQ: {e}")

    async def close(self) -> None:
        self._running = False
        if self._subscriber:
            self._subscriber.close()
        logger.info("[PubSubBroker] Shutdown complete.")


# -----------------------------------------------------------------------------
# 6. Broker Factory Helper
# -----------------------------------------------------------------------------
def create_broker_from_env() -> BaseBroker:
    """
    Instantiates either RedisStreamsBroker or GooglePubSubBroker based on BROKER_TYPE.
    Enforces that MAX_DELIVERY_ATTEMPTS is strictly 3 or 5.
    """
    broker_type = os.getenv("BROKER_TYPE", "redis").lower().strip()

    raw_attempts = int(os.getenv("MAX_DELIVERY_ATTEMPTS", "3"))
    max_attempts = raw_attempts if raw_attempts in ALLOWED_RETRY_CEILINGS else 3

    if broker_type == "pubsub":
        project_id = os.environ["GCP_PROJECT_ID"]
        dlq_topic = os.getenv("PUBSUB_DLQ_TOPIC", "dead-letter-events")
        return GooglePubSubBroker(
            project_id=project_id,
            dlq_topic=dlq_topic,
            max_delivery_attempts=max_attempts,
        )

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    consumer = os.getenv("WORKER_CONSUMER_ID", f"worker-{os.getpid()}")
    dlq_stream = os.getenv("REDIS_DLQ_STREAM", "pipeline:dlq")
    return RedisStreamsBroker(
        redis_url=redis_url,
        consumer_name=consumer,
        dlq_stream=dlq_stream,
        max_delivery_attempts=max_attempts,
    )
