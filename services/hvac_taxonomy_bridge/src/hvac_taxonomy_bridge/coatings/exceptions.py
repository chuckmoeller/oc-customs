"""
Shared exception types for the coating mapper.

Mirrors equipment/exceptions.py's pattern, kept as a separate hierarchy
since coatings and equipment are conceptually independent domains that
happen to share only the top-level package.
"""


class CoatingMappingError(Exception):
    """Base class for all coating-mapping failures."""


class UnknownProductError(CoatingMappingError):
    """product_id doesn't match any registered coating baseline."""


class MissingFieldError(CoatingMappingError):
    """A field required to build a standardized representation is absent.

    Raised when a product's known_products.py baseline has no
    thickness value and the caller didn't supply a thickness_override
    to fill the gap.
    """
