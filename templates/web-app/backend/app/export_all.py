"""Whole-database export: one CSV per table in a ZIP, optionally with the
uploaded files, for handovers, audits and data-subject requests.

Every column is exported except secrets (password hashes) and raw geometry,
which is written as latitude/longitude instead. Recycle-bin rows are
included with their deleted_at, so nothing is silently missing.
"""

from __future__ import annotations

import csv
import io
import tempfile
import zipfile
from datetime import date, datetime
from pathlib import Path

from geoalchemy2 import Geometry
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.csvsafe import BOM, safe_csv_text
from app.core.storage import storage_root
from app.models.changelog import ChangelogEntry
from app.models.comment import Attachment, Comment
from app.models.site import Site
from app.models.survey import Survey
from app.models.user import User

TABLES = [
    ("sites", Site),
    ("surveys", Survey),
    ("comments", Comment),
    ("attachments", Attachment),
    ("changelog", ChangelogEntry),
    ("users", User),
]
NEVER_EXPORTED = {"password_hash", "token_version", "stored_path"}


def _cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, dict):
        import json

        return json.dumps(value)
    if isinstance(value, str):
        return safe_csv_text(value)
    return str(value)


async def _table_csv(session: AsyncSession, model) -> str:
    columns = [
        c
        for c in model.__table__.columns
        if c.name not in NEVER_EXPORTED and not isinstance(c.type, Geometry)
    ]
    geometry = [c for c in model.__table__.columns if isinstance(c.type, Geometry)]
    selected = [*columns]
    header = [c.name for c in columns]
    for g in geometry:
        selected += [func.ST_Y(g), func.ST_X(g)]
        header += [f"{g.name}_latitude", f"{g.name}_longitude"]
    rows = (await session.execute(select(*selected))).all()
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(header)
    for row in rows:
        writer.writerow([_cell(v) for v in row])
    return BOM + out.getvalue()


async def build_export(session: AsyncSession, *, include_files: bool) -> Path:
    """Write the ZIP to a temp file and return its path (caller deletes)."""
    handle = tempfile.NamedTemporaryFile(prefix="fieldline-export-", suffix=".zip", delete=False)
    handle.close()
    path = Path(handle.name)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, model in TABLES:
            zf.writestr(f"{name}.csv", await _table_csv(session, model))
        if include_files:
            # Named by attachment id so the CSV row and the file line up.
            rows = (
                await session.execute(
                    select(Attachment.id, Attachment.name, Attachment.stored_path)
                )
            ).all()
            root = storage_root().resolve()
            for attachment_id, filename, stored in rows:
                if not stored:
                    continue
                source = Path(stored)
                if source.exists() and source.resolve().is_relative_to(root):
                    zf.write(source, f"files/{attachment_id}/{Path(filename).name}")
        zf.writestr(
            "README.txt",
            "Fieldline export. One CSV per table; site locations as "
            "latitude/longitude. Rows with deleted_at set were in the recycle bin. "
            "Text starting with = + - or @ is prefixed with an apostrophe so a "
            "spreadsheet shows it instead of running it. "
            "Password hashes are never exported."
            + ("\nfiles/<attachment id>/<name> holds each uploaded file." if include_files else ""),
        )
    return path
