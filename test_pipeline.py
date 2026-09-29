"""
Unit tests for the zero-agent cost-optimized event pipeline components.
"""

import asyncio
import os
import time
import unittest

from broker import BrokerMessage, IdempotencyAndRetryGuard
from classifier import (
    ClassificationResult,
    ClassificationStatus,
    RouteDestination,
    RulesFirstClassifier,
)
from router import BudgetCircuitBreaker, SpendCeilingExceededError
from workers import WorkerConfig


class TestPipelineComponents(unittest.IsolatedAsyncioTestCase):

    async def test_idempotency_guard(self):
        guard = IdempotencyAndRetryGuard(default_ttl_sec=60, max_delivery_attempts=3)
        key = "test_payload_sha256_abc123"

        # Initially not completed
        is_dup_1 = await guard.is_duplicate(key)
        self.assertFalse(is_dup_1, "Unprocessed payload should not be marked duplicate")

        # Mark as successfully processed
        await guard.mark_success(key)

        # Subsequent redelivery must be blocked by idempotency guard
        is_dup_2 = await guard.is_duplicate(key)
        self.assertTrue(is_dup_2, "Completed payload must be flagged as duplicate on redelivery")

    async def test_strict_retry_ceiling_limit(self):
        """Rule Verification: Failed payload retries must be strictly capped at 3 (or 5)."""
        # Test default ceiling of 3
        guard_3 = IdempotencyAndRetryGuard(max_delivery_attempts=3)
        key_3 = "failing_payload_hash_3"

        # Attempt 1: First try
        att_1 = await guard_3.record_and_get_attempt(key_3)
        self.assertEqual(att_1, 1)
        self.assertFalse(guard_3.is_exceeded(att_1))

        # Attempt 2: Second try
        att_2 = await guard_3.record_and_get_attempt(key_3)
        self.assertEqual(att_2, 2)
        self.assertFalse(guard_3.is_exceeded(att_2))

        # Attempt 3: Final allowable attempt (ceiling hit)
        att_3 = await guard_3.record_and_get_attempt(key_3)
        self.assertEqual(att_3, 3)
        self.assertTrue(guard_3.is_exceeded(att_3), "Attempt 3 must reach the hard ceiling")

        # Test ceiling of 5
        guard_5 = IdempotencyAndRetryGuard(max_delivery_attempts=5)
        key_5 = "failing_payload_hash_5"

        for i in range(1, 5):
            count = await guard_5.record_and_get_attempt(key_5)
            self.assertEqual(count, i)
            self.assertFalse(guard_5.is_exceeded(count))

        # 5th attempt must reach ceiling
        count_5 = await guard_5.record_and_get_attempt(key_5)
        self.assertEqual(count_5, 5)
        self.assertTrue(guard_5.is_exceeded(count_5), "Attempt 5 must reach the 5-attempt ceiling")

    async def test_rules_first_classifier_direct_routes(self):
        """Test classifier.py deterministic rules (DIRECT_ROUTE, DROP, AMBIGUOUS)."""
        classifier = RulesFirstClassifier()

        # 1. Health check / ping -> DROP
        res_ping = classifier.classify(b"ping", {"action": "health"})
        self.assertEqual(res_ping.status, ClassificationStatus.DROP)
        self.assertEqual(res_ping.destination, RouteDestination.HEALTH_MONITOR)

        # 2. Empty payload -> DROP
        res_empty = classifier.classify(b"   ", {})
        self.assertEqual(res_empty.status, ClassificationStatus.DROP)

        # 3. Telemetry header -> DIRECT_ROUTE to TELEMETRY_INGEST
        res_telem = classifier.classify(b'{"sensor_id": "SN-10", "kw": 45.2}', {"source": "telemetry_gateway"})
        self.assertEqual(res_telem.status, ClassificationStatus.DIRECT_ROUTE)
        self.assertEqual(res_telem.destination, RouteDestination.TELEMETRY_INGEST)

        # 4. JSON schema match for CRM -> DIRECT_ROUTE to CRM_DISPATCHER
        res_crm = classifier.classify(
            b'{"deal_id": "D-9981", "pipeline_stage": "Blueprint", "company_name": "Target"}',
            {},
        )
        self.assertEqual(res_crm.status, ClassificationStatus.DIRECT_ROUTE)
        self.assertEqual(res_crm.destination, RouteDestination.CRM_DISPATCHER)

        # 5. Regex match for HVAC nameplate -> DIRECT_ROUTE to EQUIPMENT_SURVEY
        res_hvac = classifier.classify(
            b"Nameplate inspection: Carrier RTU Model 48TCED06A2A5 Serial 1819E04360 Volts 208-230V Tonnage 5.0",
            {},
        )
        self.assertEqual(res_hvac.status, ClassificationStatus.DIRECT_ROUTE)
        self.assertEqual(res_hvac.destination, RouteDestination.EQUIPMENT_SURVEY)

        # 6. Roof inspection survey -> DIRECT_ROUTE to ROOF_INSPECTION
        res_roof = classifier.classify(
            b"Commercial roof inspection survey for 125,000 sq ft TPO membrane with ponding near scupper",
            {},
        )
        self.assertEqual(res_roof.status, ClassificationStatus.DIRECT_ROUTE)
        self.assertEqual(res_roof.destination, RouteDestination.ROOF_INSPECTION)

        # 7. Unstructured ambiguous text -> AMBIGUOUS (allowed to trigger cheap LLM call)
        res_ambiguous = classifier.classify(
            b"Can someone please look into this note that was left on the desk about the facility?",
            {},
        )
        self.assertEqual(res_ambiguous.status, ClassificationStatus.AMBIGUOUS)
        self.assertIsNone(res_ambiguous.destination)

    async def test_circuit_breaker_spend_ceiling(self):
        breaker = BudgetCircuitBreaker(max_daily_spend_usd=1.00, max_daily_tokens=10000)

        # Budget ok initially
        await breaker.check_budget()

        # Record spend under ceiling
        await breaker.record_usage(tokens=1000, cost_usd=0.25)
        await breaker.check_budget()

        # Record spend that breaches ceiling
        await breaker.record_usage(tokens=2000, cost_usd=0.85)

        # Budget check must now trip and raise SpendCeilingExceededError
        with self.assertRaises(SpendCeilingExceededError):
            await breaker.check_budget()

    def test_worker_config_retry_boundary(self):
        """WorkerConfig must bound max_delivery_attempts strictly to 3 or 5."""
        os.environ["MAX_DELIVERY_ATTEMPTS"] = "5"
        cfg_5 = WorkerConfig()
        self.assertEqual(cfg_5.max_delivery_attempts, 5)

        os.environ["MAX_DELIVERY_ATTEMPTS"] = "99"  # invalid value
        cfg_fallback = WorkerConfig()
        self.assertEqual(cfg_fallback.max_delivery_attempts, 3)

    def test_provider_circuit_breaker_transitions(self):
        """Verify ProviderDeployment trips to OPEN on consecutive 429s and recovers to HALF_OPEN."""
        from router import CircuitState, ProviderDeployment
        import httpx

        deployment = ProviderDeployment(
            name="test_provider",
            tier=0,
            provider_type="openai_compatible",
            model_slug="test-model",
            base_url="https://api.test.com",
        )

        self.assertEqual(deployment.stats.state, CircuitState.CLOSED)
        self.assertTrue(deployment.is_available())

        # Simulate 2 rate limit errors (threshold is 3)
        mock_429 = httpx.HTTPStatusError("Rate limited", request=None, response=httpx.Response(429))
        deployment.record_failure(mock_429, failure_threshold=3)
        deployment.record_failure(mock_429, failure_threshold=3)
        self.assertEqual(deployment.stats.state, CircuitState.CLOSED)
        self.assertEqual(deployment.stats.consecutive_rate_limits, 2)

        # 3rd rate limit trips the circuit to OPEN
        deployment.record_failure(mock_429, failure_threshold=3)
        self.assertEqual(deployment.stats.state, CircuitState.OPEN)
        self.assertFalse(deployment.is_available(cooldown_duration_sec=60.0))

        # After cooldown duration, shifts to HALF_OPEN
        deployment.stats.last_tripped_at = time.time() - 65.0
        self.assertTrue(deployment.is_available(cooldown_duration_sec=60.0))
        self.assertEqual(deployment.stats.state, CircuitState.HALF_OPEN)

        # On success in HALF_OPEN, resets back to CLOSED
        deployment.record_success(tokens=100, cost_usd=0.0001)
        self.assertEqual(deployment.stats.state, CircuitState.CLOSED)
        self.assertEqual(deployment.stats.consecutive_rate_limits, 0)

    async def test_router_generate_mock(self):
        """Verify ModelRouter.generate() output conforms to standard OpenAI completion envelope."""
        from router import ModelRouter, ProviderDeployment
        from unittest.mock import AsyncMock, patch

        mock_deployment = ProviderDeployment(
            name="mock_gemini_studio",
            tier=0,
            provider_type="openai_compatible",
            model_slug="gemini-2.5-flash",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai",
        )

        router = ModelRouter(deployments=[mock_deployment])

        with patch.object(
            router,
            "_dispatch_with_backoff",
            new_callable=AsyncMock,
            return_value=("Extracted intent successfully", {"prompt_tokens": 50, "completion_tokens": 15, "total_tokens": 65}, {}),
        ):
            res = await router.generate(
                prompt="Extract the customer address from this memo",
                task_type="extraction",
            )

            # Assert OpenAI schema structure
            self.assertEqual(res["object"], "chat.completion")
            self.assertEqual(res["model"], "gemini-2.5-flash")
            self.assertEqual(res["provider"], "mock_gemini_studio")
            self.assertEqual(res["tier"], 0)
            self.assertEqual(res["task_type"], "extraction")
            self.assertIn("choices", res)
            self.assertEqual(len(res["choices"]), 1)
            self.assertEqual(res["choices"][0]["message"]["content"], "Extracted intent successfully")
            self.assertEqual(res["choices"][0]["finish_reason"], "stop")
            self.assertIn("usage", res)
            self.assertEqual(res["usage"]["total_tokens"], 65)
            self.assertIn("latency_ms", res)



if __name__ == "__main__":
    unittest.main()
