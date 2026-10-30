from enum import Enum

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPkMixin, vocabulary_check


class SiteStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class Site(Base, UUIDPkMixin, TimestampMixin):
    """A physical location that gets surveyed (bridge, building, etc.)."""

    __tablename__ = "sites"
    # Declared here as well as in the migration so metadata.create_all (the
    # test schema) matches the migrated schema — drift between the two is
    # invisible until production. The (created_at, id) index
    # serves the list endpoint's stable sort + OFFSET/LIMIT.
    __table_args__ = (
        Index(
            "uq_sites_name_normalized",
            text("lower(btrim(name))"),
            unique=True,
        ),
        Index("ix_sites_created_at_id", "created_at", "id"),
        vocabulary_check("sites", "site_type"),
        vocabulary_check("sites", "status"),
    )

    # Unique on the NORMALISED name (, migration 0017):
    # `uq_sites_name` was byte-exact, so `Name`, `name` and `Name ` all
    # coexisted — exactly the variants a user actually types. The functional
    # index lives in __table_args__ below; the column itself is no longer
    # declared unique, because a plain UNIQUE would be the byte-exact rule
    # again. The API also trims on write, so the stored value and the
    # uniqueness key agree.
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # server_default as well as the Python-side default ((d)): a
    # raw SQL insert should not have to name every categorical column.
    site_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="other", server_default="other"
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SiteStatus.ACTIVE, server_default="active"
    )
    address: Mapped[str | None] = mapped_column(String(500))
    # UK postcode, normalised upper-case with one space ("SE1 2UP"). Split
    # out of `address` (migration 0019) so it can be its own column/filter.
    postcode: Mapped[str | None] = mapped_column(String(10))
    notes: Mapped[str | None] = mapped_column(String(2000))
    location: Mapped[object] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=False
    )
    # demo and real rows were indistinguishable in the
    # deployment database. Set by the seeder, false for anything the API
    # creates, so demo data can be identified and removed without guessing
    # from names.
    is_demo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false"), index=True
    )
