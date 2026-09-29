# Project Brief: HVAC Taxonomy Bridge

## Purpose

Translate raw, field-captured HVAC equipment data and coating product
data into a standardized, ASHRAE Standard 205-aligned representation
that multiple downstream tools can consume.

## Hard Scope Boundary (read this first)

This package stops at the standardized representation. It has **zero
knowledge of EnergyPlus, IDF files, or building energy simulation**.
Any code that translates a standardized representation into an
EnergyPlus-specific object belongs in a downstream consumer (The
Calibrator), not here. If you find yourself writing EnergyPlus-specific
logic in this package, stop — that's scope creep and it belongs
elsewhere.

## Consumers (why this needs to be generic, not tool-specific)

1. **Site Hunter / Spec-Hunter** — supplies raw nameplate extraction
   output (manufacturer, model, tonnage, EER/SEER, equipment type) as
   input.
2. **ASHRAE Schema Validator** (separate micro-SaaS) — validates and
   converts data against ASHRAE 223P/205 schemas; may import this
   package's standardized models directly.
3. **The Calibrator** — imports this package, consumes its standardized
   equipment and coating models, and performs its own separate
   translation into EnergyPlus IDF objects.

Because there are three independent consumers, avoid designing any
interface around what only one of them needs.

## License Requirements

- This project is licensed Apache 2.0 (see `LICENSE.txt`).
- It incorporates schema definitions from ASHRAE Standard 205
  (`open205/schema-205`, Apache 2.0, Copyright 2016 ASHRAE).
- Any file that adapts or wraps schema-205 source must carry a notice
  indicating it was changed, per Apache 2.0 Section 4(b).
- The `NOTICE` file must be kept intact and updated if additional
  ASHRAE-derived sources are incorporated later.

## Architecture

```
hvac-taxonomy-bridge/
├── LICENSE.txt
├── NOTICE
├── README.md
├── PROJECT.md
├── pyproject.toml
├── src/hvac_taxonomy_bridge/
│   ├── __init__.py
│   ├── models.py               # Pydantic models — the standardized output contract
│   ├── equipment/
│   │   ├── __init__.py
│   │   ├── mapper.py            # entry point: raw nameplate dict -> standardized model
│   │   └── types/                 # one file per equipment category
│   │       ├── __init__.py
│   │       └── dx_cooling.py       # start here: DX cooling coil mapping
│   ├── coatings/
│   │   ├── __init__.py
│   │   └── mapper.py            # product identifier -> thermal properties model
│   └── schema/
│       ├── __init__.py
│       └── ashrae_205.py        # thin wrapper around the schema-205 package
└── tests/
    ├── test_equipment_mapper.py
    └── test_coating_mapper.py
```

## Interface Contract

### Equipment mapper

- **Input:** raw dict from Site Hunter's extraction output. Expected
  keys (extend as needed, but do not assume all are always present):
  `manufacturer`, `model_number`, `equipment_type`, `tonnage`,
  `eer_or_seer`, `capacity_btu`.
- **Output:** a Pydantic model instance representing an ASHRAE
  205-aligned standardized equipment representation.
- **Behavior on missing/ambiguous fields:** Raise a typed exception
  only when `capacity_btu` is missing or cannot be parsed — this is the
  one field The Calibrator cannot function without. For any other
  missing/ambiguous field (`manufacturer`, `model_number`,
  `efficiency`), do not raise: construct the record with those fields
  as None/absent and set `extraction_confidence` to `PARTIAL`. Only set
  `extraction_confidence` to `CONFIRMED` when `manufacturer`,
  `model_number`, and `efficiency` are all present and unambiguous. Use
  `UNVERIFIED` for records you're uncertain qualify as `PARTIAL` vs
  `CONFIRMED` — don't guess between the two silently.

### Coating mapper

- **Input:** a product identifier (e.g., `"nanotech_icp"`, `"pureti"`)
  plus optional site-specific overrides (e.g., measured application
  thickness).
- **Output:** a standardized material-properties model: emissivity,
  thermal conductivity, thickness, and product source reference.

## Testing Approach

- Every equipment-type mapper needs fixture-based tests: known nameplate
  input paired with expected standardized output.
- Start with a single equipment type (DX cooling coil) end-to-end —
  scaffold, mapper, model, and test — before adding others. Get one
  path fully correct and reviewed before expanding.
- This package is shared IP across three consumers; a silent wrong
  assumption here propagates to all of them. Prefer explicit failures
  over lenient guessing.

## Build Order

1. Repo scaffold (folders, `__init__.py` files, `pyproject.toml`).
2. `models.py` — define the standardized Pydantic models first, since
   everything else is built against this contract.
3. `schema/ashrae_205.py` — thin wrapper importing the `schema-205`
   package as a dependency.
4. `equipment/types/dx_cooling.py` + `equipment/mapper.py` for the
   single DX cooling coil case, with tests.
5. Stop and review before adding additional equipment types or the
   coatings mapper.
