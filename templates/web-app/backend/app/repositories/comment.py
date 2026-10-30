"""Comment + attachment repositories.

Extracted from the endpoints module in the hardening pass — endpoints were
doing raw session queries, inconsistent with the rest of the API's
endpoint → service → repository layering.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.comment import Attachment, Comment, arc_fields


class CommentRepository:
    """All storage access for Comment lives here."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_entity(
        self, entity: str, entity_id: uuid.UUID, offset: int = 0, limit: int = 100
    ) -> tuple[list[Comment], int]:
        where = (Comment.entity == entity, Comment.entity_id == entity_id)
        total = (
            await self._session.scalar(select(func.count()).select_from(Comment).where(*where)) or 0
        )
        result = await self._session.execute(
            select(Comment)
            .where(Comment.entity == entity, Comment.entity_id == entity_id)
            # `id DESC` tiebreaker: created_at alone is not unique.
            .order_by(Comment.created_at.desc(), Comment.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all()), int(total)

    async def create(
        self,
        entity: str,
        entity_id: uuid.UUID,
        author: str,
        text: str,
        client_id: uuid.UUID | None = None,
    ) -> Comment:
        comment = Comment(
            # An offline create's id, chosen by the app (services/client_ids.py).
            **({"id": client_id} if client_id else {}),
            entity=entity,
            entity_id=entity_id,
            author=author,
            text=text,
            # also populate the real FK arc, so a parent delete
            # cascades in the database instead of waiting for an admin.
            **arc_fields(entity, entity_id),
        )
        self._session.add(comment)
        await self._session.flush()
        await self._session.refresh(comment)
        return comment

    async def get(self, comment_id: uuid.UUID) -> Comment | None:
        return await self._session.get(Comment, comment_id)

    async def delete(self, comment: Comment) -> None:
        await self._session.delete(comment)
        await self._session.flush()


class AttachmentRepository:
    """All storage access for Attachment lives here."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_entity(
        self, entity: str, entity_id: uuid.UUID, offset: int = 0, limit: int = 100
    ) -> tuple[list[Attachment], int]:
        where = (Attachment.entity == entity, Attachment.entity_id == entity_id)
        total = (
            await self._session.scalar(select(func.count()).select_from(Attachment).where(*where))
            or 0
        )
        result = await self._session.execute(
            select(Attachment)
            .where(*where)
            # `id DESC` tiebreaker: created_at alone is not unique.
            .order_by(Attachment.created_at.desc(), Attachment.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all()), int(total)

    async def create(
        self,
        entity: str,
        entity_id: uuid.UUID,
        name: str,
        size_bytes: int,
        content_type: str | None,
        uploaded_by: str,
        stored_path: str,
    ) -> Attachment:
        attachment = Attachment(
            entity=entity,
            entity_id=entity_id,
            name=name,
            # see CommentRepository.create.
            **arc_fields(entity, entity_id),
            size_bytes=size_bytes,
            content_type=content_type,
            uploaded_by=uploaded_by,
            stored_path=stored_path,
        )
        self._session.add(attachment)
        await self._session.flush()
        await self._session.refresh(attachment)
        return attachment

    async def get(self, attachment_id: uuid.UUID) -> Attachment | None:
        return await self._session.get(Attachment, attachment_id)

    async def bytes_used(self, uploaded_by: str | None = None) -> int:
        """Stored bytes, for one uploader or for everyone."""
        stmt = select(func.coalesce(func.sum(Attachment.size_bytes), 0))
        if uploaded_by is not None:
            stmt = stmt.where(Attachment.uploaded_by == uploaded_by)
        return int(await self._session.scalar(stmt) or 0)

    async def delete(self, attachment: Attachment) -> None:
        await self._session.delete(attachment)
        await self._session.flush()
