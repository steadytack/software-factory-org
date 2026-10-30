"""Comments and attachments endpoints — thin HTTP adapters over the service
layer (schemas in schemas/comment.py, queries in repositories/comment.py,
rules in services/comment.py)."""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse

from app.core.auth import get_current_subject, require_admin
from app.core.config import get_settings
from app.core.database import SessionDep
from app.core.images import ImageError, is_converted, is_processable, process_image
from app.core.logging import get_logger
from app.core.storage import (
    ALLOWED_CONTENT_TYPES,
    EmptyUploadError,
    UploadError,
    converted_name,
    delete_stored,
    is_within_root,
    read_upload_limited,
    resolve_content_type,
    sanitize_name,
    save_thumbnail,
    save_upload,
    sniff_content_type_matches,
    thumbnail_path,
)
from app.repositories.comment import AttachmentRepository, CommentRepository
from app.schemas.comment import (
    AttachmentList,
    AttachmentRead,
    CommentCreate,
    CommentList,
    CommentRead,
    PhotoLocation,
)
from app.schemas.enums import EntityValue
from app.services.comment import (
    AttachmentService,
    CommentService,
    InvalidEntityError,
)

logger = get_logger(__name__)

MB = 1024 * 1024


async def _check_quota(service: "AttachmentService", actor: str, incoming: int) -> None:
    """413 before anything is written when the upload would take this user
    or the whole volume past its quota."""
    settings = get_settings()
    repo = service._repo
    if await repo.bytes_used(actor) + incoming > settings.upload_quota_mb_per_user * MB:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE,
            f"You've reached your {settings.upload_quota_mb_per_user} MB upload limit. "
            "Ask an admin to free space or raise the limit.",
        )
    if await repo.bytes_used() + incoming > settings.upload_quota_mb_total * MB:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE,
            "Storage is full. Ask an admin to free space or raise the limit.",
        )


# Types the download route may serve inline for in-browser preview. All are
# passive (no script), and the upload allowlist + content sniffing already
# guarantee a stored file is what its content_type claims.
INLINE_PREVIEW_TYPES: frozenset[str] = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "application/pdf",
        "text/plain",
        "text/csv",
        "application/json",
        "application/geo+json",
    }
)

router = APIRouter(tags=["comments"], dependencies=[Depends(get_current_subject)])


def get_comment_service(
    session=SessionDep,
    actor: str = Depends(get_current_subject),
) -> CommentService:
    # The actor is needed for the audit-trail entry on DELETE —
    # `create_comment` still passes it explicitly for attribution. Reads are
    # already behind the router-level `get_current_subject`, which is
    # dependency-cached per request, so this costs no extra lookup.
    return CommentService(CommentRepository(session), actor=actor)


def get_attachment_service(
    session=SessionDep,
    actor: str = Depends(get_current_subject),
) -> AttachmentService:
    return AttachmentService(AttachmentRepository(session), actor=actor)


# ── Comments ─────────────────────────────────────────────────────────────────


@router.get("/comments", response_model=CommentList)
async def list_comments(
    # `EntityValue` instead of a bare bounded string, so a wrong-case
    # or unknown entity is a 422 rather than an empty 200.
    entity: EntityValue = Query(),
    entity_id: str = Query(max_length=64),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
    service: CommentService = Depends(get_comment_service),
) -> CommentList:
    try:
        return await service.list(entity, entity_id, offset=offset, limit=limit)
    except InvalidEntityError as exc:
        # An unknown *parent* is a 404 — "no comments" and "no such record"
        # were previously the same empty 200.
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.post("/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
async def create_comment(
    data: CommentCreate,
    service: CommentService = Depends(get_comment_service),
    actor: str = Depends(get_current_subject),
) -> CommentRead:
    try:
        return await service.create(data, actor=actor)
    except InvalidEntityError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: uuid.UUID,
    service: CommentService = Depends(get_comment_service),
    _admin: str = Depends(require_admin),
) -> None:
    if not await service.delete(comment_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")


# ── Attachments ──────────────────────────────────────────────────────────────


@router.get("/attachments", response_model=AttachmentList)
async def list_attachments(
    entity: EntityValue = Query(),
    entity_id: str = Query(max_length=64),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
    service: AttachmentService = Depends(get_attachment_service),
) -> AttachmentList:
    try:
        return await service.list(entity, entity_id, offset=offset, limit=limit)
    except InvalidEntityError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.post(
    "/attachments",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    entity: EntityValue = Query(),
    entity_id: str = Query(max_length=64),
    file: UploadFile = File(...),
    actor: str = Depends(get_current_subject),
    service: AttachmentService = Depends(get_attachment_service),
) -> AttachmentRead:
    """Upload a real file: bytes go to the storage volume, metadata to the DB."""
    content_type = resolve_content_type(file.content_type, file.filename)
    if ALLOWED_CONTENT_TYPES and content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Content type {content_type!r} not allowed",
        )
    # Stream-read with the size cap enforced up front — a multi-GB body is
    # cut off before it is fully buffered.
    thumbnail: bytes | None = None
    gps: tuple[float, float] | None = None
    stored_name = file.filename or "unnamed"
    try:
        data = await read_upload_limited(file)
        if not sniff_content_type_matches(content_type, data):
            raise HTTPException(
                status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                f"File contents don't match declared type {content_type!r}",
            )
        if is_processable(content_type):
            # Strip EXIF (GPS, device, owner), fix rotation, cap the size,
            # and make a thumbnail — see core/images.py.
            try:
                processed = process_image(data, content_type)
            except ImageError as exc:
                raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, str(exc)) from exc
            data, thumbnail, gps = processed.data, processed.thumbnail, processed.gps
            if is_converted(content_type):
                # A HEIC (or TIFF, BMP) photo is stored, named and served as the JPEG it was
                # converted to.
                content_type = "image/jpeg"
                stored_name = converted_name(file.filename)
        await _check_quota(service, actor, len(data))
        dest = save_upload(data, stored_name)
        if thumbnail:
            save_thumbnail(dest, thumbnail)
    except EmptyUploadError as exc:
        # 422, not 413: a 0-byte file is unprocessable, not too large.
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except UploadError as exc:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, str(exc)) from exc
    try:
        created = await service.create(
            entity=entity,
            entity_id=entity_id,
            name=sanitize_name(stored_name)[:200],
            size_bytes=len(data),
            content_type=content_type,
            uploaded_by=actor,
            stored_path=str(dest),
        )
        if gps:
            created.photo_location = PhotoLocation(latitude=gps[0], longitude=gps[1])
        return created
    except InvalidEntityError as exc:
        # Parent doesn't exist — remove the just-stored file so it doesn't
        # orphan on disk, then 404.
        delete_stored(str(dest))
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.get("/attachments/{attachment_id}/download")
async def download_attachment(
    attachment_id: uuid.UUID,
    inline: bool = Query(False, description="Serve for in-browser preview where the type allows"),
    session=SessionDep,
    _actor: str = Depends(get_current_subject),
) -> FileResponse:
    a = await AttachmentRepository(session).get(attachment_id)
    if a is None or not a.stored_path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    # stored_path comes from the DB — confine reads to the storage root so a
    # crafted row can never serve a file from outside the volume.
    if not is_within_root(a.stored_path):
        logger.warning("attachment_path_escape_blocked", path=a.stored_path)
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    path = Path(a.stored_path)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stored file missing")
    media_type = a.content_type or "application/octet-stream"
    # `?inline=1` lets the UI preview a file in the browser instead of
    # downloading it — only for passive types the browser renders safely
    # (never anything that could run script in our origin).
    disposition = "inline" if inline and media_type in INLINE_PREVIEW_TYPES else "attachment"
    return FileResponse(
        path,
        media_type=media_type,
        filename=a.name,
        content_disposition_type=disposition,
    )


@router.get("/attachments/{attachment_id}/thumbnail")
async def attachment_thumbnail(
    attachment_id: uuid.UUID,
    session=SessionDep,
    _actor: str = Depends(get_current_subject),
) -> FileResponse:
    """The 400 px JPEG preview written at upload, for the photo grid."""
    a = await AttachmentRepository(session).get(attachment_id)
    if a is None or not a.stored_path or not is_within_root(a.stored_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    path = thumbnail_path(a.stored_path)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No thumbnail for this attachment")
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.delete("/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    attachment_id: uuid.UUID,
    service: AttachmentService = Depends(get_attachment_service),
    _admin: str = Depends(require_admin),
) -> None:
    if not await service.delete(attachment_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
