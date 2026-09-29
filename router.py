"""
Multi-Tier Model Router & Budget Circuit Breaker (`router.py`).

Design Principles:
1. Unified Interface: Exposes `generate(prompt, task_type)` returning a standard OpenAI
   chat completion dictionary schema.
2. Config-Driven: Dynamic model slugs, temperatures, and token ceilings per task type
   and environment variables (zero hardcoded values).
3. 3-Tier Fallback Cascade:
   - Tier 0 / Primary (Public & Free): Google AI Studio Gemini Flash (~10-15 RPM, 250K TPM free tier).
   - Tier 1 / Secondary (Confidential / Production): Vertex AI Gemini Flash (in GCP project context)
     with Claude 3.5 Haiku as instant fallback.
   - Tier 2 / Local Fail-safe: Local Ollama container instance for zero-cost offline fallback.
4. Per-Provider Circuit Breakers: Tracks cumulative requests and consecutive rate limits (429/5xx).
   Trips to OPEN state to immediately bypass degraded providers without worker delays.
"""

from __future__ import annotations

import asyncio
import functools
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

import httpx

logger = logging.getLogger("pipeline.router")


# -----------------------------------------------------------------------------
# 1. Custom Exceptions
# -----------------------------------------------------------------------------
class ModelRouterError(Exception):
    """Base exception for all router failures."""
    pass


class SpendCeilingExceededError(ModelRouterError):
    """Raised when daily spend or token limit is reached, routing to DLQ."""
    pass


class CircuitBreakerTrippedError(ModelRouterError):
    """Raised when an individual provider deployment circuit is OPEN."""
    pass


class AllProvidersExhaustedError(ModelRouterError):
    """Raised when every tier in the fallback cascade has failed."""
    pass


# -----------------------------------------------------------------------------
# 2. Circuit Breaker State & Deployment Tracking
# -----------------------------------------------------------------------------
class CircuitState(str, Enum):
    CLOSED = "CLOSED"      # Healthy: Requests pass through
    OPEN = "OPEN"          # Tripped: Bypassed immediately to preserve worker latency
    HALF_OPEN = "HALF_OPEN"  # Testing: Allowing trial request after cooldown


@dataclass
class ProviderStats:
    """Cumulative diagnostic metrics and state tracking per provider."""
    state: CircuitState = CircuitState.CLOSED
    consecutive_rate_limits: int = 0
    total_requests: int = 0
    total_successes: int = 0
    total_errors: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    last_tripped_at: float = 0.0
    last_error_message: str = ""


@dataclass
class ProviderDeployment:
    """Configured provider deployment target."""
    name: str
    tier: int  # 0 = Free/Dev, 1 = Confidential/GCP, 2 = Local Fail-safe
    provider_type: str  # "openai_compatible", "vertex_ai", "anthropic"
    model_slug: str
    base_url: str
    api_key: Optional[str] = None
    input_cost_per_million: float = 0.0
    output_cost_per_million: float = 0.0
    timeout_sec: float = 15.0
    is_active: bool = True
    stats: ProviderStats = field(default_factory=ProviderStats)

    def is_available(self, cooldown_duration_sec: float = 60.0) -> bool:
        """Determines if provider is available to take traffic."""
        if not self.is_active:
            return False

        if self.stats.state == CircuitState.OPEN:
            elapsed = time.time() - self.stats.last_tripped_at
            if elapsed >= cooldown_duration_sec:
                logger.info(
                    f"[CircuitBreaker] Provider '{self.name}' cooldown elapsed ({elapsed:.1f}s). "
                    "Shifting state to HALF_OPEN to test recovery."
                )
                self.stats.state = CircuitState.HALF_OPEN
                return True
            return False

        return True

    def record_success(self, tokens: int, cost_usd: float) -> None:
        """Resets consecutive failure counters on clean response."""
        self.stats.state = CircuitState.CLOSED
        self.stats.consecutive_rate_limits = 0
        self.stats.total_requests += 1
        self.stats.total_successes += 1
        self.stats.total_tokens += tokens
        self.stats.total_cost_usd += cost_usd

    def record_failure(self, error: Exception, failure_threshold: int = 3) -> None:
        """Increments error counts and trips circuit if threshold reached."""
        self.stats.total_requests += 1
        self.stats.total_errors += 1
        self.stats.last_error_message = str(error)

        status_code = getattr(getattr(error, "response", None), "status_code", None)
        # Check if rate-limited (429) or overloaded (503/504)
        if status_code in (429, 502, 503, 504) or isinstance(error, (httpx.TimeoutException, asyncio.TimeoutError)):
            self.stats.consecutive_rate_limits += 1
            if self.stats.consecutive_rate_limits >= failure_threshold:
                self.stats.state = CircuitState.OPEN
                self.stats.last_tripped_at = time.time()
                logger.warning(
                    f"[CircuitBreaker: TRIPPED] Provider '{self.name}' reached "
                    f"{self.stats.consecutive_rate_limits} consecutive rate-limit errors. "
                    f"Circuit set to OPEN for cooldown."
                )


# -----------------------------------------------------------------------------
# 3. Task Type Configuration Mapping
# -----------------------------------------------------------------------------
@dataclass
class TaskProfile:
    """Dynamic model execution settings per task type."""
    default_tier: int = 0
    temperature: float = 0.1
    max_tokens: int = 1024
    system_prompt: Optional[str] = None


DEFAULT_TASK_PROFILES: Dict[str, TaskProfile] = {
    # Fast deterministic-adjacent classification
    "classification": TaskProfile(
        default_tier=0,
        temperature=0.0,
        max_tokens=150,
        system_prompt="You are a strict, zero-agent event classifier. Output valid JSON only with keys: category, confidence.",
    ),
    # Structured field extraction (dates, assignees, equipment)
    "extraction": TaskProfile(
        default_tier=0,
        temperature=0.0,
        max_tokens=600,
        system_prompt="You are a precise data extraction worker. Extract all requested entities into a clean JSON object.",
    ),
    # Sensitive or internal company records (forced to Tier 1 Vertex/Claude)
    "confidential": TaskProfile(
        default_tier=1,
        temperature=0.1,
        max_tokens=1200,
        system_prompt="You are a secure executive enterprise assistant operating inside a confidential GCP project context.",
    ),
    # Offline or air-gapped operations (forced to Tier 2 local Ollama)
    "offline": TaskProfile(
        default_tier=2,
        temperature=0.1,
        max_tokens=500,
        system_prompt="You are a local fail-safe assistant running on open-weights.",
    ),
    # Default general worker fallback
    "default": TaskProfile(
        default_tier=0,
        temperature=0.1,
        max_tokens=1024,
    ),
}


# -----------------------------------------------------------------------------
# 4. Exponential Backoff Decorator
# -----------------------------------------------------------------------------
def with_exponential_backoff(
    max_retries: int = 2,
    base_delay_sec: float = 0.5,
    max_delay_sec: float = 4.0,
):
    """
    Decorator providing micro-backoff retries for transient socket resets
    before failing over to the next tier in the cascade.
    """
    def decorator(func: Callable):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            delay = base_delay_sec
            for attempt in range(1, max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except (httpx.ConnectTimeout, httpx.ConnectError, httpx.ReadTimeout) as net_err:
                    if attempt == max_retries:
                        raise net_err
                    logger.info(
                        f"[Router: Backoff] Transient network error on attempt {attempt}/{max_retries}: "
                        f"{net_err}. Backing off {delay:.2f}s..."
                    )
                    await asyncio.sleep(delay)
                    delay = min(delay * 2.0, max_delay_sec)
                except httpx.HTTPStatusError as http_err:
                    # Do not retry 400 or 401; fail immediately
                    if http_err.response.status_code in (400, 401, 403, 404):
                        raise http_err
                    if attempt == max_retries:
                        raise http_err
                    logger.info(
                        f"[Router: Backoff] HTTP {http_err.response.status_code} on attempt {attempt}/{max_retries}. "
                        f"Backing off {delay:.2f}s..."
                    )
                    await asyncio.sleep(delay)
                    delay = min(delay * 2.0, max_delay_sec)

        return wrapper
    return decorator


# -----------------------------------------------------------------------------
# 5. Budget Circuit Breaker
# -----------------------------------------------------------------------------
class BudgetCircuitBreaker:
    """Enforces daily token and spend limits across all providers."""

    def __init__(
        self,
        max_daily_spend_usd: float = 5.0,
        max_daily_tokens: int = 1_000_000,
    ):
        self.max_daily_spend_usd = float(os.getenv("DAILY_SPEND_LIMIT_USD", str(max_daily_spend_usd)))
        self.max_daily_tokens = int(os.getenv("DAILY_TOKEN_LIMIT", str(max_daily_tokens)))
        self._daily_spend = 0.0
        self._daily_tokens = 0
        self._current_date = date.today()
        self._lock = asyncio.Lock()

    async def check_budget(self) -> None:
        async with self._lock:
            today = date.today()
            if today != self._current_date:
                self._current_date = today
                self._daily_spend = 0.0
                self._daily_tokens = 0

            if self._daily_spend >= self.max_daily_spend_usd:
                raise SpendCeilingExceededError(
                    f"Daily spend ceiling exceeded: ${self._daily_spend:.4f} >= ${self.max_daily_spend_usd:.2f}"
                )
            if self._daily_tokens >= self.max_daily_tokens:
                raise SpendCeilingExceededError(
                    f"Daily token ceiling exceeded: {self._daily_tokens} >= {self.max_daily_tokens}"
                )

    async def record_usage(self, tokens: int, cost_usd: float) -> None:
        async with self._lock:
            self._daily_tokens += tokens
            self._daily_spend += cost_usd


# -----------------------------------------------------------------------------
# 6. Core ModelRouter Class
# -----------------------------------------------------------------------------
class ModelRouter:
    """
    Fault-tolerant multi-tier model router proxy exposing OpenAI-compatible completion.
    """

    def __init__(
        self,
        deployments: Optional[List[ProviderDeployment]] = None,
        task_profiles: Optional[Dict[str, TaskProfile]] = None,
        budget_circuit_breaker: Optional[BudgetCircuitBreaker] = None,
        cooldown_sec: float = 60.0,
        failure_threshold: int = 3,
    ):
        self.cooldown_sec = float(os.getenv("PROVIDER_COOLDOWN_SEC", str(cooldown_sec)))
        self.failure_threshold = failure_threshold
        self.deployments = deployments or self._load_deployments_from_env()
        self.task_profiles = task_profiles or dict(DEFAULT_TASK_PROFILES)
        self.budget_breaker = budget_circuit_breaker or BudgetCircuitBreaker()
        self._http_client: Optional[httpx.AsyncClient] = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            limits = httpx.Limits(max_keepalive_connections=15, max_connections=50)
            self._http_client = httpx.AsyncClient(limits=limits, timeout=25.0)
        return self._http_client

    async def _check_global_budget(self) -> None:
        if self.budget_breaker:
            await self.budget_breaker.check_budget()

    async def _record_global_usage(self, tokens: int, cost_usd: float) -> None:
        if self.budget_breaker:
            await self.budget_breaker.record_usage(tokens=tokens, cost_usd=cost_usd)

    # -------------------------------------------------------------------------
    # Unified Public Generation Interface
    # -------------------------------------------------------------------------
    async def generate(
        self,
        prompt: str,
        task_type: str = "default",
        messages: Optional[List[Dict[str, str]]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        preferred_tier: Optional[int] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Standardized OpenAI-compatible generation method.

        Args:
            prompt: User prompt text.
            task_type: Task profile key ('classification', 'extraction', 'confidential', 'offline', 'default').
            messages: Optional explicit list of OpenAI message dicts (takes precedence over prompt if passed).
            temperature: Override temperature.
            max_tokens: Override max output tokens.
            preferred_tier: Force priority starting tier (0, 1, or 2).

        Returns:
            Dict conforming strictly to the OpenAI chat completion schema.
        """
        # 1. Budget Gate
        await self._check_global_budget()

        # 2. Resolve Task Profile & Parameters
        profile = self.task_profiles.get(task_type.lower(), self.task_profiles["default"])
        temp = temperature if temperature is not None else profile.temperature
        max_tok = max_tokens if max_tokens is not None else profile.max_tokens
        target_tier = preferred_tier if preferred_tier is not None else profile.default_tier

        # Assemble messages payload
        if messages:
            chat_messages = list(messages)
        else:
            chat_messages = []
            if profile.system_prompt:
                chat_messages.append({"role": "system", "content": profile.system_prompt})
            chat_messages.append({"role": "user", "content": prompt})

        # 3. Sort Deployments by Tier Priority
        eligible = [d for d in self.deployments if d.is_active]
        # Sort so that target_tier is tried first, followed by remaining tiers in ascending order
        eligible.sort(key=lambda d: (abs(d.tier - target_tier), d.tier))

        last_error = None
        t0 = time.time()

        for deployment in eligible:
            # Check Circuit Breaker
            if not deployment.is_available(cooldown_duration_sec=self.cooldown_sec):
                logger.info(
                    f"[Router: BYPASS] Provider '{deployment.name}' is OPEN (in cooldown). Skipping."
                )
                continue

            logger.info(
                f"[Router: DISPATCH] Trying Tier {deployment.tier} -> '{deployment.name}' "
                f"({deployment.model_slug}) for task='{task_type}'"
            )

            try:
                # Dispatch through exponential backoff wrapper
                content, usage_data, raw_res = await self._dispatch_with_backoff(
                    deployment, chat_messages, temp, max_tok
                )

                latency_ms = (time.time() - t0) * 1000.0
                prompt_tokens = usage_data.get("prompt_tokens", len(str(chat_messages)) // 4)
                comp_tokens = usage_data.get("completion_tokens", len(content) // 4)
                total_tokens = usage_data.get("total_tokens", prompt_tokens + comp_tokens)

                # Cost Calculation
                cost_usd = (
                    (prompt_tokens * deployment.input_cost_per_million / 1_000_000)
                    + (comp_tokens * deployment.output_cost_per_million / 1_000_000)
                )

                # Update Stats & Global Circuit
                deployment.record_success(tokens=total_tokens, cost_usd=cost_usd)
                await self._record_global_usage(tokens=total_tokens, cost_usd=cost_usd)

                logger.info(
                    f"[Router: SUCCESS] '{deployment.name}' responded in {latency_ms:.1f}ms "
                    f"({total_tokens} tokens, ${cost_usd:.5f})"
                )

                # 4. Standardized OpenAI Output Envelope
                return {
                    "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "model": deployment.model_slug,
                    "provider": deployment.name,
                    "tier": deployment.tier,
                    "task_type": task_type,
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": content,
                            },
                            "finish_reason": "stop",
                        }
                    ],
                    "usage": {
                        "prompt_tokens": prompt_tokens,
                        "completion_tokens": comp_tokens,
                        "total_tokens": total_tokens,
                    },
                    "system_fingerprint": f"router-{deployment.name}",
                    "cost_usd": cost_usd,
                    "latency_ms": latency_ms,
                    "raw_response": raw_res,
                }

            except Exception as err:
                last_error = err
                status_code = getattr(getattr(err, "response", None), "status_code", None)
                logger.warning(
                    f"[Router: TIER-FAIL] Tier {deployment.tier} ('{deployment.name}') failed "
                    f"(HTTP {status_code or 'ERR'}): {err}. Tripping/tracking and cascading..."
                )
                deployment.record_failure(err, failure_threshold=self.failure_threshold)

        raise AllProvidersExhaustedError(
            f"All model router tiers failed for task_type '{task_type}'. Last error: {last_error}"
        )

    # -------------------------------------------------------------------------
    # Convenience Wrapper for Backward Compatibility
    # -------------------------------------------------------------------------
    async def complete(
        self,
        messages: List[Dict[str, str]],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        tier_preference: Optional[int] = None,
    ) -> CompletionResponse:
        """Backward-compatible wrapper returning typed CompletionResponse."""
        raw_dict = await self.generate(
            prompt="",
            task_type="default",
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            preferred_tier=tier_preference,
        )
        choice = raw_dict["choices"][0]
        usage = raw_dict["usage"]
        return CompletionResponse(
            content=choice["message"]["content"],
            model_used=raw_dict["model"],
            tier_used=raw_dict["tier"],
            provider_used=raw_dict["provider"],
            prompt_tokens=usage["prompt_tokens"],
            completion_tokens=usage["completion_tokens"],
            total_tokens=usage["total_tokens"],
            estimated_cost_usd=raw_dict["cost_usd"],
            latency_ms=raw_dict["latency_ms"],
            raw_response=raw_dict.get("raw_response", {}),
        )

    # -------------------------------------------------------------------------
    # Dispatch With Exponential Backoff
    # -------------------------------------------------------------------------
    @with_exponential_backoff(max_retries=2, base_delay_sec=0.5, max_delay_sec=3.0)
    async def _dispatch_with_backoff(
        self,
        deployment: ProviderDeployment,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> Tuple[str, Dict[str, int], Dict[str, Any]]:
        """Invokes provider implementation with backoff."""
        if deployment.provider_type == "vertex_ai":
            return await self._call_vertex_gemini(deployment, messages, temperature, max_tokens)
        elif deployment.provider_type == "anthropic":
            return await self._call_anthropic(deployment, messages, temperature, max_tokens)
        else:
            return await self._call_openai_compatible(deployment, messages, temperature, max_tokens)

    # -------------------------------------------------------------------------
    # Provider Protocol Handlers
    # -------------------------------------------------------------------------
    async def _call_openai_compatible(
        self,
        deployment: ProviderDeployment,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> Tuple[str, Dict[str, int], Dict[str, Any]]:
        """Handles Google AI Studio, Groq, OpenRouter, and local Ollama."""
        client = self._get_client()
        url = f"{deployment.base_url.rstrip('/')}/chat/completions"

        headers = {"Content-Type": "application/json"}
        if deployment.api_key:
            headers["Authorization"] = f"Bearer {deployment.api_key}"

        payload = {
            "model": deployment.model_slug,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        resp = await client.post(url, headers=headers, json=payload, timeout=deployment.timeout_sec)
        resp.raise_for_status()
        data = resp.json()

        choice = data["choices"][0]
        content = choice["message"]["content"] or ""
        usage = data.get("usage", {})
        return content, usage, data

    async def _call_vertex_gemini(
        self,
        deployment: ProviderDeployment,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> Tuple[str, Dict[str, int], Dict[str, Any]]:
        """Invokes Vertex AI Gemini Flash using local Google ADC context."""
        import google.auth
        import google.auth.transport.requests

        credentials, project = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        auth_req = google.auth.transport.requests.Request()
        credentials.refresh(auth_req)

        location = os.getenv("GCP_REGION", "us-central1")
        project_id = os.getenv("GCP_PROJECT_ID", project)

        url = (
            f"https://{location}-aiplatform.googleapis.com/v1beta1/"
            f"projects/{project_id}/locations/{location}/publishers/google/models/"
            f"{deployment.model_slug}:generateContent"
        )

        headers = {
            "Authorization": f"Bearer {credentials.token}",
            "Content-Type": "application/json",
        }

        contents = []
        system_instruction = None

        for m in messages:
            role = m["role"]
            if role == "system":
                system_instruction = {"parts": [{"text": m["content"]}]}
            else:
                gemini_role = "user" if role == "user" else "model"
                contents.append({"role": gemini_role, "parts": [{"text": m["content"]}]})

        body: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        if system_instruction:
            body["systemInstruction"] = system_instruction

        client = self._get_client()
        resp = await client.post(url, headers=headers, json=body, timeout=deployment.timeout_sec)
        resp.raise_for_status()
        data = resp.json()

        candidates = data.get("candidates", [])
        if not candidates:
            raise ModelRouterError("Vertex Gemini returned no candidates")

        parts = candidates[0].get("content", {}).get("parts", [])
        content = "".join([p.get("text", "") for p in parts])

        usage_meta = data.get("usageMetadata", {})
        prompt_tokens = usage_meta.get("promptTokenCount", 0)
        comp_tokens = usage_meta.get("candidatesTokenCount", 0)
        total_tokens = usage_meta.get("totalTokenCount", prompt_tokens + comp_tokens)

        usage = {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": comp_tokens,
            "total_tokens": total_tokens,
        }
        return content, usage, data

    async def _call_anthropic(
        self,
        deployment: ProviderDeployment,
        messages: List[Dict[str, str]],
        temperature: float,
        max_tokens: int,
    ) -> Tuple[str, Dict[str, int], Dict[str, Any]]:
        """Handles Claude 3.5 Haiku as instant secondary fallback."""
        client = self._get_client()
        url = f"{deployment.base_url.rstrip('/')}/v1/messages"

        headers = {
            "Content-Type": "application/json",
            "x-api-key": deployment.api_key or "",
            "anthropic-version": "2023-06-01",
        }

        system_prompt = ""
        user_assistant_messages = []
        for m in messages:
            if m["role"] == "system":
                system_prompt = m["content"]
            else:
                user_assistant_messages.append({"role": m["role"], "content": m["content"]})

        payload: Dict[str, Any] = {
            "model": deployment.model_slug,
            "messages": user_assistant_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system_prompt:
            payload["system"] = system_prompt

        resp = await client.post(url, headers=headers, json=payload, timeout=deployment.timeout_sec)
        resp.raise_for_status()
        data = resp.json()

        text_blocks = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
        content = "\n".join(text_blocks)

        usage_meta = data.get("usage", {})
        prompt_tokens = usage_meta.get("input_tokens", 0)
        comp_tokens = usage_meta.get("output_tokens", 0)
        total_tokens = prompt_tokens + comp_tokens

        usage = {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": comp_tokens,
            "total_tokens": total_tokens,
        }
        return content, usage, data

    # -------------------------------------------------------------------------
    # Dynamic Environment Loaders
    # -------------------------------------------------------------------------
    def _load_deployments_from_env(self) -> List[ProviderDeployment]:
        deployments = []

        # --- Tier 0: Primary (Public & Free Data) ---
        # Google AI Studio Gemini Flash Free Tier (~10-15 RPM, 250K TPM)
        gemini_key = os.getenv("GEMINI_API_KEY")
        if gemini_key:
            deployments.append(
                ProviderDeployment(
                    name="google_ai_studio_flash_free",
                    tier=0,
                    provider_type="openai_compatible",
                    model_slug=os.getenv("TIER0_GEMINI_MODEL", "gemini-2.5-flash"),
                    base_url="https://generativelanguage.googleapis.com/v1beta/openai",
                    api_key=gemini_key,
                    input_cost_per_million=0.0,
                    output_cost_per_million=0.0,
                    timeout_sec=15.0,
                )
            )

        # Groq (Ultra-Fast Free Tier)
        groq_key = os.getenv("GROQ_API_KEY")
        if groq_key:
            deployments.append(
                ProviderDeployment(
                    name="groq_free",
                    tier=0,
                    provider_type="openai_compatible",
                    model_slug=os.getenv("TIER0_GROQ_MODEL", "llama-3.3-70b-versatile"),
                    base_url=os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
                    api_key=groq_key,
                    input_cost_per_million=0.0,
                    output_cost_per_million=0.0,
                    timeout_sec=10.0,
                )
            )

        # OpenRouter (OpenAI-compatible Free Tier / Gateway)
        openrouter_key = os.getenv("OPENROUTER_API_KEY")
        if openrouter_key:
            deployments.append(
                ProviderDeployment(
                    name="openrouter_free",
                    tier=0,
                    provider_type="openai_compatible",
                    model_slug=os.getenv("TIER0_OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free"),
                    base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
                    api_key=openrouter_key,
                    input_cost_per_million=0.0,
                    output_cost_per_million=0.0,
                    timeout_sec=15.0,
                )
            )

        # Generic OpenAI-compatible Free Gateway Fallback
        compat_url = os.getenv("OPENAI_COMPATIBLE_BASE_URL")
        if compat_url:
            deployments.append(
                ProviderDeployment(
                    name="openai_compatible_router",
                    tier=0,
                    provider_type="openai_compatible",
                    model_slug=os.getenv("OPENAI_COMPATIBLE_MODEL", "meta-llama/llama-3.3-70b-instruct:free"),
                    base_url=compat_url,
                    api_key=os.getenv("OPENAI_COMPATIBLE_API_KEY", "free"),
                    input_cost_per_million=0.0,
                    output_cost_per_million=0.0,
                    timeout_sec=15.0,
                )
            )

        # --- Tier 1: Secondary (Confidential Data / Production) ---
        # Vertex AI Gemini Flash (GCP Project Context)
        if os.getenv("GCP_PROJECT_ID"):
            deployments.append(
                ProviderDeployment(
                    name="vertex_gemini_flash",
                    tier=1,
                    provider_type="vertex_ai",
                    model_slug=os.getenv("TIER1_VERTEX_MODEL", "gemini-2.5-flash"),
                    base_url="https://aiplatform.googleapis.com",
                    input_cost_per_million=0.075,
                    output_cost_per_million=0.30,
                    timeout_sec=20.0,
                )
            )

        # Claude Haiku Fallback
        anthropic_key = os.getenv("ANTHROPIC_API_KEY")
        if anthropic_key:
            deployments.append(
                ProviderDeployment(
                    name="anthropic_haiku",
                    tier=1,
                    provider_type="anthropic",
                    model_slug=os.getenv("TIER1_ANTHROPIC_MODEL", "claude-3-5-haiku-20241022"),
                    base_url="https://api.anthropic.com",
                    api_key=anthropic_key,
                    input_cost_per_million=0.80,
                    output_cost_per_million=4.00,
                    timeout_sec=15.0,
                )
            )

        # --- Tier 2: Local Fail-safe (Air-Gapped / Zero Cost) ---
        # Local Ollama Container Instance
        ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
        deployments.append(
            ProviderDeployment(
                name="ollama_local",
                tier=2,
                provider_type="openai_compatible",
                model_slug=os.getenv("TIER2_OLLAMA_MODEL", "llama3.2:3b"),
                base_url=ollama_url,
                api_key="ollama",
                input_cost_per_million=0.0,
                output_cost_per_million=0.0,
                timeout_sec=30.0,
            )
        )

        return deployments

    async def close(self) -> None:
        """Closes internal HTTP client cleanly."""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()


# Backward-compatible CompletionResponse dataclass
@dataclass
class CompletionResponse:
    content: str
    model_used: str
    tier_used: int
    provider_used: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    latency_ms: float
    raw_response: Dict[str, Any] = field(default_factory=dict)
