"""User model for multi-user auth.

The single-admin model (env-pinned ADMIN_EMAIL) remains as the bootstrap:
the startup seeder creates this account (role "admin") from .env if the
users table is empty. Additional users are created by an admin via
/api/users and authenticate against the DB — bcrypt per user.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPkMixin, vocabulary_check


class User(Base, UUIDPkMixin):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_email", "email", unique=True),
        vocabulary_check("users", "role"),
    )

    email: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(100))
    # viewer | editor | admin (schemas.enums.USER_ROLES, least → most).
    role: Mapped[str] = mapped_column(
        String(20), nullable=False, default="viewer", server_default=text("'viewer'")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    # Carried in every JWT as `ver`; a token whose `ver` differs is dead.
    # Bumped on password change, deactivation and refresh-token reuse, which
    # signs the user out on every device at their next request.
    token_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    # Server-side timestamps; last_login_at is written on successful login so
    # the admin panel can show who has actually signed in.
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    @is_admin.setter
    def is_admin(self, value: bool) -> None:
        # Kept for callers written against the old boolean: True → admin,
        # False demotes an admin to viewer (an editor stays an editor).
        if value:
            self.role = "admin"
        elif self.role == "admin":
            self.role = "viewer"
