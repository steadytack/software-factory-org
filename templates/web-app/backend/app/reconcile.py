"""Files-to-rows reconciliation for the attachments volume.

Audit **INT-5 / Q-D10**: the uploads volume held **46 files (188 KB)** while
the `attachments` table had **0 rows** — every stored file was orphaned — and
nothing in the system could find them. `DELETE /api/admin/orphans` works from
the *rows* outward: it deletes rows whose parent entity is gone and removes
their files. A file whose row has already been deleted by some other path is
therefore **unreachable forever**. There was no files→rows check, no checksum,
and no size accounting anywhere.

This module closes that direction. It reports **both ways**:

* **orphan files** — on the volume, with no `stored_path` referencing them
  (the gap INT-5 found), and
* **missing files** — referenced by a row whose bytes are gone, which makes
  the download 404 and is equally invisible today.

## Usage

Dry run (the default — it prints an inventory and changes nothing):

    docker compose exec backend python -m app.reconcile

Delete the orphan files, after reviewing that inventory:

    docker compose exec backend python -m app.reconcile --delete

A read-only version of the same report is available to an admin over HTTP at
`GET /api/admin/storage-reconciliation`, so the state is observable without
shell access. There is deliberately **no HTTP delete**: removing file bytes is
irreversible, so it stays a reviewed, explicit operation.

## Scheduling

This repo has no scheduler — no APScheduler, no Celery, no background-task
runner — and the established pattern for an operational task is a module run
with `python -m` (`app.seed` is the precedent). Rather than introduce a
scheduler dependency for one sweep, this is a script suitable for cron or a
Kubernetes CronJob, e.g.:

    # Weekly reconciliation report, Sundays at 03:00.
    0 3 * * 0 docker compose exec -T backend python -m app.reconcile

Deliberately **report-only on a schedule**: an automated job that deletes file
bytes unattended is exactly the kind of thing Q-D10 required a dry run and an
explicit approval for. Run it with `--delete` by hand once the report has been
read.
"""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import SessionFactory
from app.core.logging import get_logger
from app.core.storage import is_within_root, storage_root, thumbnail_path
from app.models.comment import Attachment

logger = get_logger(__name__)


@dataclass
class ReconciliationReport:
    """Counts both ways, plus the paths, so a dry run is reviewable."""

    stored_files: int = 0
    stored_bytes: int = 0
    attachment_rows: int = 0
    orphan_files: list[str] = field(default_factory=list)
    orphan_bytes: int = 0
    missing_files: list[str] = field(default_factory=list)
    # stored_path values that resolve outside the storage root — a crafted or
    # corrupted row. Never touched, only reported.
    escaping_paths: list[str] = field(default_factory=list)

    @property
    def orphan_count(self) -> int:
        return len(self.orphan_files)

    @property
    def missing_count(self) -> int:
        return len(self.missing_files)

    def render(self) -> str:
        lines = [
            "Attachment storage reconciliation",
            f"  files on volume:       {self.stored_files} ({self.stored_bytes} bytes)",
            f"  attachment rows:       {self.attachment_rows}",
            f"  orphan files:          {self.orphan_count} ({self.orphan_bytes} bytes)",
            f"  rows missing bytes:    {self.missing_count}",
            f"  paths outside root:    {len(self.escaping_paths)}",
        ]
        if self.orphan_files:
            lines.append("  orphan file inventory (no DB row references these):")
            lines += [f"    {name}" for name in sorted(self.orphan_files)]
        if self.missing_files:
            lines.append("  rows whose stored file is gone (download would 404):")
            lines += [f"    {name}" for name in sorted(self.missing_files)]
        if self.escaping_paths:
            lines.append("  stored_path values outside the storage root (NOT touched):")
            lines += [f"    {name}" for name in sorted(self.escaping_paths)]
        return "\n".join(lines)


async def build_report(session: AsyncSession | None = None) -> ReconciliationReport:
    """Read-only inventory of the volume against the `attachments` table.

    `session` lets an HTTP caller reuse the request's session (and therefore
    its transaction); the CLI passes nothing and opens its own.
    """
    report = ReconciliationReport()
    root = storage_root()

    on_disk: dict[Path, int] = {}
    for path in sorted(root.iterdir()):
        if not path.is_file():
            continue
        on_disk[path.resolve()] = path.stat().st_size
    report.stored_files = len(on_disk)
    report.stored_bytes = sum(on_disk.values())

    query = select(Attachment.id, Attachment.stored_path)
    if session is not None:
        rows = (await session.execute(query)).all()
    else:
        async with SessionFactory() as own_session:
            rows = (await own_session.execute(query)).all()

    report.attachment_rows = len(rows)
    referenced: set[Path] = set()
    for attachment_id, stored_path in rows:
        if not stored_path:
            # "No bytes on disk" is a legitimate state for the row (the
            # download 404s), but it is worth surfacing.
            report.missing_files.append(f"{attachment_id} (no stored_path)")
            continue
        if not is_within_root(stored_path):
            report.escaping_paths.append(f"{attachment_id} -> {stored_path}")
            continue
        resolved = Path(stored_path).resolve()
        referenced.add(resolved)
        referenced.add(thumbnail_path(str(resolved)).resolve())
        if resolved not in on_disk:
            report.missing_files.append(f"{attachment_id} -> {stored_path}")

    for path, size in on_disk.items():
        if path not in referenced:
            report.orphan_files.append(path.name)
            report.orphan_bytes += size
    return report


def delete_orphans(report: ReconciliationReport) -> tuple[int, int]:
    """Delete the orphan files the report listed. Returns (files, bytes).

    Only files the report *already listed* are removed, and each is re-checked
    against the storage root before unlinking — the report is the approval
    record, so nothing outside it is ever touched.
    """
    root = storage_root()
    removed = 0
    freed = 0
    for name in sorted(report.orphan_files):
        path = root / name
        if not is_within_root(str(path)) or not path.is_file():
            logger.warning("reconcile_skipped", path=str(path))
            continue
        size = path.stat().st_size
        path.unlink()
        removed += 1
        freed += size
        logger.info("reconcile_orphan_removed", path=str(path), size=size)
    return removed, freed


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__ and __doc__.splitlines()[0])
    parser.add_argument(
        "--delete",
        action="store_true",
        help="delete the orphan files listed in the report (irreversible; "
        "the default is a dry run that changes nothing)",
    )
    args = parser.parse_args(argv)

    report = await build_report()
    print(report.render())

    if not args.delete:
        if report.orphan_count:
            print(
                f"\nDry run — nothing deleted. Re-run with --delete to remove "
                f"{report.orphan_count} orphan file(s), {report.orphan_bytes} bytes."
            )
        return 0

    if not report.orphan_count:
        print("\nNothing to delete.")
        return 0
    removed, freed = delete_orphans(report)
    print(f"\nDeleted {removed} orphan file(s), freeing {freed} bytes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
