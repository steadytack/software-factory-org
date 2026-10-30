"""Refresh tokens that must no longer be accepted.

A refresh token is revoked when it is used (rotation: every refresh issues a
new one) or on logout. Presenting a revoked one again means it was copied —
the account's token_version is bumped, ending every session.

Rows are only needed until the token would have expired anyway, so
`expires_at` lets them be pruned.
"""

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    # When it was spent; a second use within a few seconds is another tab
    # refreshing at the same moment, not a stolen copy.
    revoked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
