from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LoginFailure(Base):
    """One recorded failed login attempt.

    DB-backed (not in-memory) so the brute-force window survives process
    restarts and is shared across workers. Rows are pruned opportunistically
    by `prune_old_failures` — anything older than the window is dead weight.
    """

    __tablename__ = "login_failures"
    __table_args__ = (Index("ix_login_failures_key_created", "client_key", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # "ip:email" — same key shape the in-memory limiter used.
    client_key: Mapped[str] = mapped_column(String(300), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
