"""Comment + attachment services.

Business rules (who may create/delete, orphan-file cleanup on DB failure,
entity/parent validation) live here; endpoints stay thin HTTP adapters.
"""

import uuid

from app.core.logging import get_logger
from app.core.storage import delete_after_commit, delete_stored, thumbnail_path
from app.models.comment import Comment
from app.models.site import Site
from app.models.survey import Survey
from app.repositories.comment import AttachmentRepository, CommentRepository
from app.schemas.comment import (
    AttachmentList,
    AttachmentRead,
    CommentCreate,
    CommentList,
    CommentRead,
)
from app.schemas.enums import ENTITIES
from app.services.changelog import record_change
from app.services.client_ids import existing_for_client_id

logger = get_logger(__name__)


class InvalidEntityError(Exception):
    """Unknown entity name or nonexistent parent record — endpoints map to 404."""


# entity name → model class for the generic entity/entity_id tables
# (comments, attachments, changelog). The *names* come from the vocabulary
# module (schemas/enums.ENTITIES), which is also what the DB CHECK constraint
# and the API Literal are built from; this maps them to model classes. The
# assertion below makes a divergence a hard import error.
ENTITY_MODELS = {
    "site": Site,
    "survey": Survey,
}
assert tuple(ENTITY_MODELS) == ENTITIES, "ENTITY_MODELS and enums.ENTITIES disagree"


async def _resolve_entity(session, entity: str, entity_id: str) -> uuid.UUID:
    """Validate a generic reference and return the parsed parent id.

    Rejects unknown entity names and nonexistent parent records, and — since
    `entity_id` is now a real `uuid` column rather than VARCHAR text —
    returns the parsed UUID so callers never hand a string to the repository.
    Applied on read as well as write.
    """
    model = ENTITY_MODELS.get(entity)
    if model is None:
        raise InvalidEntityError(f"Unknown entity {entity!r}")
    try:
        parent_id = uuid.UUID(entity_id)
    except ValueError as exc:
        raise InvalidEntityError(f"Invalid entity id {entity_id!r}") from exc
    parent = await session.get(model, parent_id)
    # A record in the recycle bin reads as missing here too.
    if parent is None or getattr(parent, "deleted_at", None) is not None:
        raise InvalidEntityError(f"{entity} {entity_id} not found")
    return parent_id


def _comment_to_read(c) -> CommentRead:
    return CommentRead(
        id=str(c.id),
        entity=c.entity,
        entity_id=str(c.entity_id),
        author=c.author,
        text=c.text,
        created_at=c.created_at,
    )


def _attachment_to_read(a) -> AttachmentRead:
    return AttachmentRead(
        id=str(a.id),
        entity=a.entity,
        entity_id=str(a.entity_id),
        name=a.name,
        size_bytes=a.size_bytes,
        content_type=a.content_type,
        uploaded_by=a.uploaded_by,
        created_at=a.created_at,
        has_thumbnail=bool(a.stored_path) and thumbnail_path(a.stored_path).exists(),
    )


class CommentService:
    """Business logic for comments. Any authenticated user may create; only
    the admin may delete (enforced by the endpoint's auth dependencies)."""

    def __init__(self, repository: CommentRepository, actor: str = "system") -> None:
        self._repo = repository
        self._actor = actor

    async def list(
        self, entity: str, entity_id: str, offset: int = 0, limit: int = 100
    ) -> CommentList:
        # the read side used to validate nothing, so a wrong-case
        # entity ("SITE") or a junk entity_id returned an empty 200 —
        # indistinguishable from "this record has no comments" — while the
        # write side 404'd on exactly the same input. Same validation, both
        # directions.
        parent_id = await _resolve_entity(self._repo._session, entity, entity_id)
        comments, total = await self._repo.list_for_entity(
            entity, parent_id, offset=offset, limit=limit
        )
        return CommentList(total=total, items=[_comment_to_read(c) for c in comments])

    async def create(self, data: CommentCreate, actor: str) -> CommentRead:
        parent_id = await _resolve_entity(self._repo._session, data.entity, data.entity_id)
        # A replayed offline create (same client id) returns what was saved.
        existing = await existing_for_client_id(self._repo._session, Comment, data.id)
        if existing is not None:
            return _comment_to_read(existing)
        comment = await self._repo.create(
            client_id=data.id,
            entity=data.entity,
            entity_id=parent_id,
            author=actor,
            text=data.text,
        )
        # comments, attachments and notifications were entirely outside
        # the audit trail — `record_change` was called only by the four domain
        # services — even though comment and attachment deletion is
        # admin-only and destructive. The entry is written against the PARENT
        # record, so it appears in that record's changelog tab where a reader
        # would look for it.
        #
        # field name + actor + timestamp only. No before/after values —
        # a deliberate decision, not an oversight (see AUD-1).
        await record_change(
            self._repo._session,
            entity=data.entity,
            entity_id=str(parent_id),
            action="updated",
            actor=actor,
            summary="Added a comment",
        )
        logger.info("comment_created", comment_id=str(comment.id), entity=data.entity)
        return _comment_to_read(comment)

    async def delete(self, comment_id: uuid.UUID) -> bool:
        comment = await self._repo.get(comment_id)
        if comment is None:
            return False
        entity, parent_id, author = comment.entity, str(comment.entity_id), comment.author
        await self._repo.delete(comment)
        # an admin-only destructive delete that left no record at all.
        await record_change(
            self._repo._session,
            entity=entity,
            entity_id=parent_id,
            action="updated",
            actor=self._actor,
            summary=f"Deleted a comment by {author}",
        )
        logger.info("comment_deleted", comment_id=str(comment_id))
        return True


class AttachmentService:
    """Business logic for attachments. File bytes are handled by the caller
    (core.storage); this service owns the DB row lifecycle, including
    removing the stored file if the DB write fails."""

    def __init__(self, repository: AttachmentRepository, actor: str = "system") -> None:
        self._repo = repository
        # the attachment service previously had no actor at all, so a
        # destructive delete could not be attributed even if it were recorded.
        self._actor = actor

    async def list(
        self, entity: str, entity_id: str, offset: int = 0, limit: int = 100
    ) -> AttachmentList:
        # FLT-3, as for comments: validate the generic reference on read, not
        # only on write.
        parent_id = await _resolve_entity(self._repo._session, entity, entity_id)
        attachments, total = await self._repo.list_for_entity(
            entity, parent_id, offset=offset, limit=limit
        )
        return AttachmentList(total=total, items=[_attachment_to_read(a) for a in attachments])

    async def create(
        self,
        *,
        entity: str,
        entity_id: str,
        name: str,
        size_bytes: int,
        content_type: str | None,
        uploaded_by: str,
        stored_path: str,
    ) -> AttachmentRead:
        parent_id = await _resolve_entity(self._repo._session, entity, entity_id)
        try:
            attachment = await self._repo.create(
                entity=entity,
                entity_id=parent_id,
                name=name,
                size_bytes=size_bytes,
                content_type=content_type,
                uploaded_by=uploaded_by,
                stored_path=stored_path,
            )
        except Exception:
            # DB write failed — the stored file would otherwise be orphaned
            # on disk (the transaction rolls back, the filesystem does not).
            delete_stored(stored_path)
            raise
        # recorded against the parent, including the byte count —
        # attachment bytes are the one thing in this system that cannot be
        # reconstructed from anything else.
        await record_change(
            self._repo._session,
            entity=entity,
            entity_id=str(parent_id),
            action="updated",
            actor=uploaded_by,
            summary=f"Uploaded attachment {name!r} ({size_bytes} bytes)",
        )
        logger.info("attachment_created", attachment_id=str(attachment.id))
        return _attachment_to_read(attachment)

    async def get(self, attachment_id: uuid.UUID):
        return await self._repo.get(attachment_id)

    async def delete(self, attachment_id: uuid.UUID) -> bool:
        attachment = await self._repo.get(attachment_id)
        if attachment is None:
            return False
        entity, parent_id = attachment.entity, str(attachment.entity_id)
        name, uploader = attachment.name, attachment.uploaded_by
        # After commit: deleting first left a dangling row if the
        # transaction then rolled back.
        delete_after_commit(
            self._repo._session, [attachment.stored_path] if attachment.stored_path else []
        )
        await self._repo.delete(attachment)
        # this removes FILE BYTES from the volume, irreversibly, and it
        # left no audit record whatsoever.
        await record_change(
            self._repo._session,
            entity=entity,
            entity_id=parent_id,
            action="updated",
            actor=self._actor,
            summary=f"Deleted attachment {name!r} (uploaded by {uploader})",
        )
        logger.info("attachment_deleted", attachment_id=str(attachment_id))
        return True
