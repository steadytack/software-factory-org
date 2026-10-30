"""Stored file paths of every attachment on a record and its descendants.

The database cascades attachment rows when a record is deleted; the files on
the volume have to be removed by us, after commit (core.storage.delete_after_commit).
A site's attachments and those of its surveys are all under it.
"""

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.comment import Attachment
from app.models.survey import Survey


async def paths_under(session: AsyncSession, entity: str, record_id: uuid.UUID) -> list[str]:
    site_ids: list = []
    survey_ids: list = []
    if entity == "site":
        site_ids = [record_id]
        survey_ids = list(
            (await session.scalars(select(Survey.id).where(Survey.site_id == record_id))).all()
        )
    elif entity == "survey":
        survey_ids = [record_id]
    rows = await session.scalars(
        select(Attachment.stored_path).where(
            or_(Attachment.site_id.in_(site_ids), Attachment.survey_id.in_(survey_ids)),
            Attachment.stored_path.is_not(None),
        )
    )
    return [path for path in rows.all() if path]
