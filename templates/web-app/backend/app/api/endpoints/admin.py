"""Admin-only maintenance endpoints: DB stats, health, demo-data reseed.

All routes require the admin (single-admin model). The reseed endpoint runs
the same idempotent seeder as `python -m app.seed`.
"""

import uuid
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask

from app.core.auth import get_current_subject, require_admin
from app.core.config import get_settings
from app.core.database import SessionDep
from app.core.logging import get_logger
from app.core.storage import delete_stored
from app.core.time import app_zone
from app.models.comment import Attachment, Comment
from app.models.notification import Notification
from app.models.site import Site
from app.models.survey import Survey

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

logger = get_logger(__name__)


class StorageUsage(BaseModel):
    used_bytes: int
    quota_bytes: int
    # Top uploaders, largest first: {email: bytes}.
    by_user: dict[str, int]
    per_user_quota_bytes: int


class AdminStats(BaseModel):
    """Row counts per table, and upload storage against its quotas."""

    counts: dict[str, int]
    storage: StorageUsage


class DbHealth(BaseModel):
    status: str
    postgis_version: str | None


class ReseedResult(BaseModel):
    seeded: bool
    detail: str


class OrphanCleanupResult(BaseModel):
    removed: dict[str, int]


class StorageReconciliation(BaseModel):
    """Files-to-rows reconciliation counts, both directions.

    `DELETE /admin/orphans` works from the rows outward, so a file whose row
    is already gone is unreachable by it — the uploads volume held 46 such
    files with 0 attachment rows. This is the read-only report for the other
    direction. Deleting file bytes stays a reviewed shell operation
    (`python -m app.reconcile --delete`), never an HTTP call.
    """

    stored_files: int
    stored_bytes: int
    attachment_rows: int
    orphan_files: int
    orphan_bytes: int
    rows_missing_files: int
    paths_outside_root: int


@router.get("/stats", response_model=AdminStats)
async def stats(session: AsyncSession = SessionDep) -> AdminStats:
    """Row counts per table — one statement instead of one round-trip per table."""
    models = [
        ("sites", Site),
        ("surveys", Survey),
        ("comments", Comment),
        ("attachments", Attachment),
        ("notifications", Notification),
    ]
    parts = [select(func.count().label("n")).select_from(m).label(label) for label, m in models]
    row = await session.execute(select(*parts))
    values = row.one()
    settings = get_settings()
    by_user = (
        await session.execute(
            select(Attachment.uploaded_by, func.sum(Attachment.size_bytes))
            .group_by(Attachment.uploaded_by)
            .order_by(func.sum(Attachment.size_bytes).desc())
            .limit(10)
        )
    ).all()
    used = await session.scalar(select(func.coalesce(func.sum(Attachment.size_bytes), 0)))
    return AdminStats(
        counts={label: int(v) for (label, _m), v in zip(models, values, strict=True)},
        storage=StorageUsage(
            used_bytes=int(used or 0),
            quota_bytes=settings.upload_quota_mb_total * 1024 * 1024,
            by_user={email: int(n) for email, n in by_user},
            per_user_quota_bytes=settings.upload_quota_mb_per_user * 1024 * 1024,
        ),
    )


@router.get("/db-health", response_model=DbHealth)
async def db_health(session: AsyncSession = SessionDep) -> DbHealth:
    """Database connectivity + PostGIS version check. A failing check is a
    503 (not a 200-shaped error body) so monitoring can alert on it; the
    exception detail goes to logs only, never to the response."""
    try:
        version = await session.scalar(text("SELECT PostGIS_Version()"))
    except SQLAlchemyError:
        logger.warning("db_health_failed", exc_info=True)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Database health check failed",
        ) from None
    return DbHealth(status="ok", postgis_version=str(version))


@router.post("/reseed", status_code=status.HTTP_200_OK, response_model=ReseedResult)
async def reseed(session: AsyncSession = SessionDep) -> ReseedResult:
    """Run the idempotent demo seeder.

    this shipped **enabled** in any deployment with admin
    credentials. It is now gated behind `SEED_ENABLED`, which defaults to
    false, and returns 403 when disabled.

    The old "any site exists" no-op guard is gone: it meant a
    database holding one real site could never be seeded and a half-seeded
    database could never be repaired. The seeder itself is now idempotent
    per site.
    """
    # Import here to avoid a circular import at module load.
    from app.seed import SeedDisabledError
    from app.seed import seed as run_seed

    try:
        counts = await run_seed(session)
    except SeedDisabledError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    return ReseedResult(seeded=counts.sites > 0, detail=counts.summary())


@router.delete("/orphans", status_code=status.HTTP_200_OK, response_model=OrphanCleanupResult)
async def delete_orphans(session: AsyncSession = SessionDep) -> OrphanCleanupResult:
    """Remove comments/attachments whose entity record no longer exists.

    Since migration 0017 the generic tables carry real per-entity foreign keys
    with `ON DELETE CASCADE`, so new orphans are no longer
    created by any delete path. This endpoint remains as a **repair** tool for
    rows that predate that migration, and as a belt-and-braces check.

    Bulk `DELETE ... WHERE entity_id NOT IN (SELECT id ...)` statements — no
    rows are loaded into Python. Changelog rows are intentionally kept (audit
    trail).
    """
    removed = {"comments": 0, "attachments": 0}
    # `entity_id` is a real `uuid` column, so the comparison is same-type (no
    # cast to string — a VARCHAR-vs-uuid comparison raises on Postgres).
    live: dict[str, Any] = {
        "site": select(Site.id).scalar_subquery(),
        "survey": select(Survey.id).scalar_subquery(),
    }
    for model, bucket in ((Comment, "comments"), (Attachment, "attachments")):
        for entity_name, id_select in live.items():
            orphan_predicate = [
                model.entity == entity_name,
                model.entity_id.not_in(id_select),
            ]
            if model is Attachment:
                # Collect the stored paths *before* deleting the rows so the
                # bytes can be removed from the volume too — otherwise DB rows
                # go away and the files leak on disk forever.
                paths = (
                    (await session.execute(select(Attachment.stored_path).where(*orphan_predicate)))
                    .scalars()
                    .all()
                )
                for path in paths:
                    delete_stored(path)
            result = await session.execute(delete(model).where(*orphan_predicate))
            removed[bucket] += result.rowcount or 0
    return OrphanCleanupResult(removed=removed)


@router.get("/storage-reconciliation", response_model=StorageReconciliation)
async def storage_reconciliation(
    session: AsyncSession = SessionDep,
) -> StorageReconciliation:
    """Report the attachments volume against the `attachments` table.

    Read-only and both directions: orphan files on the volume
    with no row referencing them, and rows whose bytes are gone. There is
    deliberately no HTTP delete — removing file bytes is irreversible, so it
    stays `python -m app.reconcile --delete` after the inventory has been
    reviewed (Q-D10's dry-run-first requirement).
    """
    from app.reconcile import build_report

    report = await build_report(session)
    return StorageReconciliation(
        stored_files=report.stored_files,
        stored_bytes=report.stored_bytes,
        attachment_rows=report.attachment_rows,
        orphan_files=report.orphan_count,
        orphan_bytes=report.orphan_bytes,
        rows_missing_files=report.missing_count,
        paths_outside_root=len(report.escaping_paths),
    )


# ── Recycle bin ──────────────────────────────────────────────────────────────


class BinItemRead(BaseModel):
    entity: str
    id: str
    label: str
    site_id: str | None
    site_name: str | None
    deleted_at: datetime
    deleted_by: str | None
    with_count: int


class BinList(BaseModel):
    retention_days: int
    items: list[BinItemRead]


BinEntity = Literal["survey"]


@router.get("/recycle-bin", response_model=BinList)
async def recycle_bin(session: AsyncSession = SessionDep) -> BinList:
    from app.services import recycle_bin as bin_service

    items = await bin_service.list_bin(session)
    return BinList(
        retention_days=get_settings().trash_retention_days,
        items=[BinItemRead(**vars(i)) for i in items],
    )


@router.post("/recycle-bin/{entity}/{record_id}/restore", status_code=status.HTTP_204_NO_CONTENT)
async def restore_from_bin(
    entity: BinEntity,
    record_id: uuid.UUID,
    session: AsyncSession = SessionDep,
    actor: str = Depends(get_current_subject),
) -> None:
    from app.services import recycle_bin as bin_service

    try:
        restored = await bin_service.restore(session, entity, record_id, actor)
    except bin_service.RestoreBlocked as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    if not restored:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not in the recycle bin")


@router.delete("/recycle-bin/{entity}/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def purge_from_bin(
    entity: BinEntity,
    record_id: uuid.UUID,
    session: AsyncSession = SessionDep,
    actor: str = Depends(get_current_subject),
) -> None:
    from app.services import recycle_bin as bin_service

    if not await bin_service.purge(session, entity, record_id, actor):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not in the recycle bin")


# ── Export everything ────────────────────────────────────────────────────────


@router.get("/export")
async def export_everything(
    *,
    files: bool = Query(default=False, description="Include the uploaded files"),
    session: AsyncSession = SessionDep,
    actor: str = Depends(get_current_subject),
) -> FileResponse:
    """A ZIP with one CSV per table (and optionally the uploaded files)."""
    from app.export_all import build_export

    path = await build_export(session, include_files=files)
    logger.info("data_exported", by=actor, files=files)
    stamp = datetime.now(app_zone()).strftime("%Y%m%d-%H%M")
    return FileResponse(
        path,
        media_type="application/zip",
        filename=f"fieldline-export-{stamp}.zip",
        background=BackgroundTask(path.unlink, missing_ok=True),
    )
