import re
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.schemas.enums import SiteStatusValue, SiteTypeValue
from app.schemas.validators import (
    ClientId,
    optional_text,
    required,
    required_number,
    required_text,
    required_text_update,
)

# Coordinate bounds, stated once so create and update cannot drift;
# the update variants come from required_number() with the same numbers.
# strict: a JSON number, not `true` or `"51.5"`.
LATITUDE = Field(ge=-90, le=90, strict=True)
LONGITUDE = Field(ge=-180, le=180, strict=True)


# UK postcode grammar (the GOV.UK / Royal Mail pattern), on the compact upper-case
# form: outward code (area + district) then a one-digit sector and two unit
# letters. The letters that never occur in real postcodes are excluded, so
# `QQ1 1AA` and `ABCDEFGHIJ` are refused. `GIR 0AA` is the one special case.
_UK_POSTCODE = re.compile(
    r"^(GIR0AA|[A-PR-UWYZ]([0-9]{1,2}|([A-HK-Y][0-9]([0-9ABEHMNPRV-Y])?)|[0-9][A-HJKPSTUW])"
    r"[0-9][ABD-HJLNP-UW-Z]{2})$"
)


def _normalise_postcode(value: str | None) -> str | None:
    """Upper-case, one space before the 3-character inward code:
    " se1  2up " becomes "SE1 2UP". Anything that is not a UK postcode is a 422
    (-8; before, the field was length-only and a 10-letter
    value grew past the column when the space was added and crashed)."""
    if value is None:
        return None
    compact = re.sub(r"\s+", "", value).upper()
    if not _UK_POSTCODE.match(compact):
        raise ValueError("Enter a UK postcode, like SW1A 1AA")
    return f"{compact[:-3]} {compact[-3:]}"


Postcode = Annotated[optional_text(10), AfterValidator(_normalise_postcode)]  # type: ignore[valid-type]


class SiteCreate(BaseModel):
    id: ClientId = None
    name: required_text(200)  # type: ignore[valid-type]
    site_type: SiteTypeValue = Field(default="other")
    status: SiteStatusValue = Field(default="active")
    address: optional_text(500) = None  # type: ignore[valid-type]
    postcode: Postcode = None
    notes: optional_text(2000) = None  # type: ignore[valid-type]
    latitude: float = LATITUDE
    longitude: float = LONGITUDE


class SiteUpdate(BaseModel):
    """PATCH: every field is optional, but the *required* ones reject an
    explicit `null` with a 422 instead of falling through to the NOT NULL
    constraint's misleading 409. `address`/`notes` are genuinely
    nullable, so an explicit null still clears them."""

    name: required_text_update(200) = None  # type: ignore[valid-type,name-defined]
    site_type: required(SiteTypeValue) = None  # type: ignore[valid-type]
    status: required(SiteStatusValue) = None  # type: ignore[valid-type]
    address: optional_text(500) = None  # type: ignore[valid-type]
    postcode: Postcode = None
    notes: optional_text(2000) = None  # type: ignore[valid-type]
    latitude: required_number(-90, 90) = None  # type: ignore[valid-type]
    longitude: required_number(-180, 180) = None  # type: ignore[valid-type]


class SiteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    site_type: str
    status: str
    address: str | None
    postcode: str | None = None
    notes: str | None
    # Coordinates are WGS84 / EPSG:4326 decimal degrees. Recorded in the
    # schema description so an API consumer can tell which datum the bare
    # numbers are in — the SRID was only ever implicit.
    latitude: float = Field(description="Latitude in decimal degrees, WGS84 (EPSG:4326)")
    longitude: float = Field(description="Longitude in decimal degrees, WGS84 (EPSG:4326)")
    created_at: datetime
    updated_at: datetime


class SiteList(BaseModel):
    total: int
    items: list[SiteRead]


class SiteLocation(BaseModel):
    """A site as a point: just enough for the map, search and pickers, so
    every site can be sent in one response rather than 200 at a time."""

    id: str
    name: str
    site_type: str
    status: str
    address: str | None
    postcode: str | None
    latitude: float
    longitude: float


class SiteLocationList(BaseModel):
    total: int
    # False when the response hit GEO_LIMIT and more sites match.
    complete: bool
    items: list[SiteLocation]
