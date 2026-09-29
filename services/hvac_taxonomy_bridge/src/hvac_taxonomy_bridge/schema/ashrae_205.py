"""
Thin wrapper around the open205/schema-205 package.

Keep this file minimal: it exists to isolate this project's dependency
on schema-205's specific API surface, so upstream changes are absorbed
here rather than throughout the codebase.

schema-205 ships the *tooling* to compile ASHRAE 205's JSON Schema
files from its own YAML sources, but not the compiled schemas
themselves (there's no PyPI package and no build artifact in its
releases). This project vendors a pre-compiled copy under
vendored/ashrae_205_schema/ — see PROVENANCE.md there for exactly how
and from what commit — and this module is what points schema205's
validator at those vendored files.

This module deliberately does not know how to build an equipment- or
coating-specific 205 representation dict; that shaping lives with each
equipment/types/*.py mapper, which knows which Representation
Specification (RS) it targets. This module only knows how to load a
given RS's schema and validate an already-shaped instance against it.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from schema205 import A205Schema

_VENDORED_SCHEMA_DIR = Path(__file__).resolve().parents[3] / "vendored" / "ashrae_205_schema"


class Ashrae205ValidationError(Exception):
    """Raised when a representation instance fails ASHRAE 205 validation.

    Wraps whatever schema205/jsonschema raised, so callers only need to
    know about this package's exception types, not schema205's.
    """


class UnknownRepresentationSpecificationError(Exception):
    """Raised when asked for an RS id with no vendored schema file."""


@lru_cache(maxsize=None)
def get_schema(rs_id: str) -> A205Schema:
    """Load (and cache) the compiled schema for a Representation Specification.

    ``rs_id`` is a schema-205 RS identifier, e.g. "RS0002" (Unitary
    Cooling Air-Conditioning Equipment) or "RS0001" (Chiller) — matched
    against the vendored file names.
    """
    schema_path = _VENDORED_SCHEMA_DIR / f"{rs_id}.schema.json"
    if not schema_path.is_file():
        raise UnknownRepresentationSpecificationError(
            f"No vendored ASHRAE 205 schema for '{rs_id}' at {schema_path}. "
            f"See vendored/ashrae_205_schema/PROVENANCE.md to add or "
            f"regenerate vendored schemas."
        )
    return A205Schema(str(schema_path))


def validate(instance: dict, rs_id: str) -> None:
    """Validate an ASHRAE 205 representation instance against its RS schema.

    ``instance`` should already be a plain dict shaped like the target
    RS (an equipment/types/*.py mapper's job to produce, not this
    module's). Raises Ashrae205ValidationError with the underlying
    schema205 error details if the instance doesn't conform.
    """
    schema = get_schema(rs_id)
    try:
        schema.validate(instance)
    except UnknownRepresentationSpecificationError:
        raise
    except Exception as exc:
        raise Ashrae205ValidationError(str(exc)) from exc
