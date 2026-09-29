"""
Rules-First Routing Engine (Agent Zero Classifier).

Design Principles:
1. Pure Deterministic Parsing: Inspects headers, metadata, source channels, and regex
   patterns BEFORE any LLM is touched.
2. Zero-Cost Fast Paths: Known telemetry, pings, CRM updates, and structured equipment
   nameplates route directly to handlers with $0.00 inference cost.
3. Ambiguity Gate: Returns status `DIRECT_ROUTE`, `AMBIGUOUS`, or `DROP`.
   Only `AMBIGUOUS` payloads are permitted to reach the Model Router.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("pipeline.classifier")


# -----------------------------------------------------------------------------
# 1. Classification Enums & Data Structures
# -----------------------------------------------------------------------------
class ClassificationStatus(str, Enum):
    """Routing directive emitted by the deterministic engine."""
    DIRECT_ROUTE = "DIRECT_ROUTE"  # Known deterministic rule matched; bypass LLM
    AMBIGUOUS = "AMBIGUOUS"        # No deterministic rule matched; trigger single-call model router
    DROP = "DROP"                  # Noise, duplicate, health probe, or malformed junk; discard


class RouteDestination(str, Enum):
    """Downstream workflow destinations."""
    HEALTH_MONITOR = "health_monitor"
    TELEMETRY_INGEST = "telemetry_ingest"
    CRM_DISPATCHER = "crm_dispatcher"
    EQUIPMENT_SURVEY = "equipment_survey"
    ROOF_INSPECTION = "roof_inspection"
    TASK_EXECUTOR = "task_executor"
    DEAD_LETTER = "dead_letter"


@dataclass
class ClassificationResult:
    """Standardized decision returned to consumer workers."""
    status: ClassificationStatus
    destination: Optional[RouteDestination] = None
    matched_rule: Optional[str] = None
    extracted_metadata: Dict[str, Any] = field(default_factory=dict)
    confidence: float = 1.0
    reason: str = ""


# -----------------------------------------------------------------------------
# 2. Rules-First Classifier Engine
# -----------------------------------------------------------------------------
class RulesFirstClassifier:
    """
    High-performance pattern matcher inspecting:
    1. Exact metadata & header keys.
    2. Known JSON structural schemas.
    3. Anchored regular expressions across payload content.
    """

    def __init__(self):
        # Pre-compile regex rules for maximum throughput
        self._regex_rules: List[Tuple[RouteDestination, str, re.Pattern[str]]] = [
            # 1. Equipment Nameplate Tag Catcher (HVAC / Commercial refrigeration)
            (
                RouteDestination.EQUIPMENT_SURVEY,
                "regex_hvac_manufacturer_model",
                re.compile(
                    r"\b(carrier|trane|lennox|york|daikin|goodman|rheem|ruud|aaon|mcquay|mitsubishi)\b"
                    r".*?\b(model|serial|volts|tonnage|mfg|seer|btu)\b",
                    re.IGNORECASE | re.DOTALL,
                ),
            ),
            # 2. Commercial Roof Inspection Surveys
            (
                RouteDestination.ROOF_INSPECTION,
                "regex_roof_inspection_survey",
                re.compile(
                    r"\b(roof|membrane|tpo|epdm|bur|flashing|scupper|parapet)\b"
                    r".*?\b(inspection|survey|audit|ponding|core cut|curb)\b",
                    re.IGNORECASE | re.DOTALL,
                ),
            ),
            # 3. CRM Deal / Stage Updates
            (
                RouteDestination.CRM_DISPATCHER,
                "regex_crm_stage_pipeline",
                re.compile(
                    r"\b(stage_change|deal_updated|lead_created|new_lead)\b"
                    r"|\bstage\s*[:=]\s*['\"]?(site survey|discovery|blueprint|pilot|project|client engagement)['\"]?",
                    re.IGNORECASE,
                ),
            ),
            # 4. Directive / Actionable Tasks (Voice transcripts, reminders)
            (
                RouteDestination.TASK_EXECUTOR,
                "regex_actionable_task_directive",
                re.compile(
                    r"\b(remind me to|schedule meeting|calendar invite|draft email to|create task|todo:)\b",
                    re.IGNORECASE,
                ),
            ),
            # 5. Raw Machine Metrics / Telemetry
            (
                RouteDestination.TELEMETRY_INGEST,
                "regex_metric_stream",
                re.compile(
                    r"\b(cpu_usage|mem_free|disk_io|voltage_rms|kw_demand|flow_rate_gpm|supply_air_temp)\b",
                    re.IGNORECASE,
                ),
            ),
        ]

    def classify(
        self,
        payload_bytes: bytes,
        attributes: Optional[Dict[str, str]] = None,
    ) -> ClassificationResult:
        """
        Main entrypoint. Evaluates raw payload and metadata against deterministic hierarchy:
        Rule Hierarchy:
          1. Empty / Whitespace -> DROP
          2. Explicit Header / Event Type Match -> DIRECT_ROUTE
          3. Structural JSON Schema Inspection -> DIRECT_ROUTE
          4. Content Regex Matching -> DIRECT_ROUTE
          5. Fallthrough -> AMBIGUOUS
        """
        # Guard: Empty or zero-byte payloads
        if not payload_bytes or not payload_bytes.strip():
            return ClassificationResult(
                status=ClassificationStatus.DROP,
                reason="Payload is empty or whitespace only",
            )

        attrs = attributes or {}
        event_type = attrs.get("event_type", "").strip().lower()
        source = attrs.get("source", "").strip().lower()
        action = attrs.get("action", "").strip().lower()

        # ---------------------------------------------------------------------
        # Rule Set 1: Fast Header / Attribute Matching
        # ---------------------------------------------------------------------
        # Health & Heartbeats -> DROP (acknowledged and absorbed without action)
        if event_type in ("ping", "heartbeat", "keepalive") or action in ("ping", "health"):
            return ClassificationResult(
                status=ClassificationStatus.DROP,
                destination=RouteDestination.HEALTH_MONITOR,
                matched_rule="header_health_ping",
                reason="Heartbeat ping absorbed at transport boundary",
            )

        # Telemetry / Sensor Stream
        if "telemetry" in source or event_type in ("metric", "telemetry", "sensor_stream"):
            return ClassificationResult(
                status=ClassificationStatus.DIRECT_ROUTE,
                destination=RouteDestination.TELEMETRY_INGEST,
                matched_rule="header_telemetry_source",
                extracted_metadata={"source": source, "event_type": event_type},
            )

        # CRM Event Bus
        if "crm" in source or event_type in ("crm_lead", "deal_updated", "contact_sync"):
            return ClassificationResult(
                status=ClassificationStatus.DIRECT_ROUTE,
                destination=RouteDestination.CRM_DISPATCHER,
                matched_rule="header_crm_source",
                extracted_metadata={"source": source, "event_type": event_type},
            )

        # Roof Inspection Pipeline
        if event_type in ("roof_inspection", "commercial_roof_inspection", "roof_audit"):
            return ClassificationResult(
                status=ClassificationStatus.DIRECT_ROUTE,
                destination=RouteDestination.ROOF_INSPECTION,
                matched_rule="header_roof_inspection",
                extracted_metadata={"event_type": event_type},
            )

        # Equipment Nameplate Scanner
        if event_type in ("equipment_scan", "nameplate_scan") or source == "site-hunter":
            return ClassificationResult(
                status=ClassificationStatus.DIRECT_ROUTE,
                destination=RouteDestination.EQUIPMENT_SURVEY,
                matched_rule="header_equipment_scan",
                extracted_metadata={"event_type": event_type, "source": source},
            )

        # ---------------------------------------------------------------------
        # Rule Set 2: Structural JSON Schema Detection (Zero AI)
        # ---------------------------------------------------------------------
        raw_text = payload_bytes.decode("utf-8", errors="replace").strip()
        parsed_json = None
        if raw_text.startswith("{") and raw_text.endswith("}"):
            try:
                parsed_json = json.loads(raw_text)
            except Exception:
                parsed_json = None

        if isinstance(parsed_json, dict):
            # Check for Telemetry / BMS Payload
            telemetry_keys = {"sensor_id", "reading", "kw", "voltage", "temperature_f", "metrics"}
            if len(telemetry_keys.intersection(parsed_json.keys())) >= 2:
                return ClassificationResult(
                    status=ClassificationStatus.DIRECT_ROUTE,
                    destination=RouteDestination.TELEMETRY_INGEST,
                    matched_rule="schema_telemetry_keys",
                    extracted_metadata={"sensor_id": parsed_json.get("sensor_id")},
                )

            # Check for CRM Deal Payload
            crm_keys = {"deal_id", "company_name", "pipeline_stage", "lead_email", "deal_value"}
            if len(crm_keys.intersection(parsed_json.keys())) >= 2:
                return ClassificationResult(
                    status=ClassificationStatus.DIRECT_ROUTE,
                    destination=RouteDestination.CRM_DISPATCHER,
                    matched_rule="schema_crm_keys",
                    extracted_metadata={"deal_id": parsed_json.get("deal_id")},
                )

            # Check for Roof Inspection Payload
            roof_keys = {"roof_sq_ft", "membrane_type", "condition_rating", "building_sq_ft"}
            if len(roof_keys.intersection(parsed_json.keys())) >= 2:
                return ClassificationResult(
                    status=ClassificationStatus.DIRECT_ROUTE,
                    destination=RouteDestination.ROOF_INSPECTION,
                    matched_rule="schema_roof_keys",
                    extracted_metadata=parsed_json.get("job_context", {}),
                )

            # Check for HVAC Nameplate Specs
            hvac_keys = {"model_number", "serial_number", "tonnage", "refrigerant", "manufacturer"}
            if len(hvac_keys.intersection(parsed_json.keys())) >= 2:
                return ClassificationResult(
                    status=ClassificationStatus.DIRECT_ROUTE,
                    destination=RouteDestination.EQUIPMENT_SURVEY,
                    matched_rule="schema_hvac_nameplate_keys",
                    extracted_metadata=parsed_json,
                )

        # ---------------------------------------------------------------------
        # Rule Set 3: Regex Pattern Matching on Text Payload
        # ---------------------------------------------------------------------
        for destination, rule_name, pattern in self._regex_rules:
            match = pattern.search(raw_text)
            if match:
                matched_snippet = match.group(0)[:80]
                return ClassificationResult(
                    status=ClassificationStatus.DIRECT_ROUTE,
                    destination=destination,
                    matched_rule=rule_name,
                    extracted_metadata={"matched_pattern": matched_snippet},
                    confidence=0.95,
                    reason=f"Matched deterministic regex rule '{rule_name}'",
                )

        # ---------------------------------------------------------------------
        # Rule Set 4: Ambiguous Gate (Allowed to reach Model Router)
        # ---------------------------------------------------------------------
        logger.info("[Classifier] No deterministic rule satisfied. Flagging as AMBIGUOUS for Model Router.")
        return ClassificationResult(
            status=ClassificationStatus.AMBIGUOUS,
            destination=None,
            matched_rule="none_ambiguous_fallthrough",
            confidence=0.0,
            reason="Unstructured content requires cheap model router extraction",
        )
