"""File storage for attachments: local filesystem under a configurable root.

Files are written to ATTACHMENTS_DIR (mounted as a Docker volume in compose)
with a UUID filename; the original name is kept in the attachments row.
"""

import uuid
from pathlib import Path

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.text import scrub_text

logger = get_logger(__name__)

# 10 MB default cap — generous for survey photos/documents, small enough to
# keep uploads fast and the volume bounded.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# Chunk size for streaming reads: we never buffer more than the cap plus one
# chunk, so a client streaming a multi-GB body is cut off early instead of
# being fully read into memory before the size check.
READ_CHUNK_BYTES = 1024 * 1024

# Allowlist: survey-domain file types (photos, documents, data). The 415
# branch in the upload endpoint is live now that this is non-empty.
ALLOWED_CONTENT_TYPES: set[str] = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/json",
    "application/geo+json",
    # Photos from an iPhone (HEIC/HEIF) and a few others; converted to JPEG on upload
    # (core/images.py).
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence",
    "image/tiff",
    "image/bmp",
}


# Browsers send a generic type when the operating system has no name for the extension (.geojson and
# .csv on many
# Windows machines, files from some phones). Only the extensions of allowlisted types are
# recognised, so this can
# widen nothing: the result still has to be in ALLOWED_CONTENT_TYPES, and the magic-byte check still
# runs.
_GENERIC_TYPES = {"", "application/octet-stream", "binary/octet-stream"}
_TYPE_BY_EXTENSION = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".bmp": "image/bmp",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".json": "application/json",
    ".geojson": "application/geo+json",
}


def resolve_content_type(declared: str | None, filename: str | None) -> str:
    """The type to check and store: what the client declared, or, when it only said
    "some bytes", what the file's extension says (still subject to the allowlist)."""
    declared = (declared or "").split(";")[0].strip().lower()
    if declared not in _GENERIC_TYPES:
        return declared
    return _TYPE_BY_EXTENSION.get(Path(filename or "").suffix.lower(), declared)


class UploadError(Exception):
    """Raised when an upload cannot be accepted (too large, unwritable)."""


class EmptyUploadError(UploadError):
    """Raised for a 0-byte upload.

    `size_bytes = 0` must never mean "a real empty file": it is
    indistinguishable from a failed or truncated upload, and a stored
    zero-byte attachment is not something a user can ever open. A distinct
    type so the endpoint can answer 422 (unprocessable content) rather than
    413 (too large), which is what the shared UploadError mapped to and is
    plainly the wrong reason.
    """


# Magic-byte signatures for allowlisted types that have a well-known one, so a
# client can't get arbitrary bytes stored/served under a false content type
# just by lying in the multipart header. Text-based allowed types (csv/json/
# plain/geo+json) have no reliable signature and are left unchecked — they
# carry no XSS risk since HTML/SVG/JS are not in the allowlist.
_MAGIC_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/gif": (b"GIF87a", b"GIF89a"),
    "application/pdf": (b"%PDF-",),
}


def sniff_content_type_matches(declared: str, data: bytes) -> bool:
    """True when `data` starts with the magic bytes expected for `declared`,
    or when `declared` has no known signature (nothing to check)."""
    if declared == "image/webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if declared in ("image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"):
        return data[4:8] == b"ftyp"
    if declared == "image/tiff":
        return data[:4] in (b"II*\x00", b"MM\x00*")
    if declared == "image/bmp":
        return data[:2] == b"BM"
    sigs = _MAGIC_SIGNATURES.get(declared)
    if sigs is None:
        return True
    return any(data.startswith(sig) for sig in sigs)


def converted_name(filename: str | None) -> str:
    """A converted photo's name: the same name, now ending .jpg."""
    stem = Path(filename or "photo").stem or "photo"
    return f"{stem}.jpg"


def is_within_root(stored_path: str | None) -> bool:
    """True when stored_path resolves inside the storage root. Used before any
    read or delete of a DB-sourced path so a crafted row cannot escape the
    volume (path traversal)."""
    if not stored_path:
        return False
    try:
        return Path(stored_path).resolve().is_relative_to(storage_root().resolve())
    except (OSError, ValueError):
        return False


def storage_root() -> Path:
    root = Path(get_settings().attachments_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def sanitize_name(name: str) -> str:
    """Strip path components, control characters and invisible characters
    (direction overrides, zero-width space) from a client filename."""
    base = scrub_text(Path(name).name)
    return base.strip() or "unnamed"


def save_upload(data: bytes, original_name: str) -> Path:
    """Persist upload bytes under a UUID filename; returns the stored path."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise UploadError(f"File exceeds {MAX_UPLOAD_BYTES} byte limit")
    if not data:
        raise EmptyUploadError("File is empty (0 bytes)")
    suffix = Path(sanitize_name(original_name)).suffix[:20]
    dest = storage_root() / f"{uuid.uuid4().hex}{suffix}"
    try:
        dest.write_bytes(data)
    except OSError as exc:
        # Disk full, permissions, volume gone — clean up any partial write and
        # surface a typed error the endpoint can translate to a 5xx.
        logger.warning("attachment_write_failed", path=str(dest), error=str(exc))
        try:
            dest.unlink(missing_ok=True)
        except OSError:
            pass
        raise UploadError("Could not store uploaded file") from exc
    logger.info("attachment_stored", path=str(dest), size=len(data))
    return dest


async def read_upload_limited(file) -> bytes:
    """Read an upload in chunks, enforcing MAX_UPLOAD_BYTES *before* the whole
    body is buffered. Raises UploadError when the cap is exceeded so a client
    streaming a huge body is cut off early instead of exhausting memory."""
    declared = getattr(file, "size", None)
    if declared is not None and declared > MAX_UPLOAD_BYTES:
        raise UploadError(f"File exceeds {MAX_UPLOAD_BYTES} byte limit")
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(READ_CHUNK_BYTES):
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise UploadError(f"File exceeds {MAX_UPLOAD_BYTES} byte limit")
        chunks.append(chunk)
    data = b"".join(chunks)
    # Rejected here as well as in save_upload so a multipart part that carries
    # a filename but no bytes is refused before the magic-byte sniff (which a
    # 0-byte body trivially "passes" for any text type) and before anything
    # touches the volume.
    if not data:
        raise EmptyUploadError("File is empty (0 bytes)")
    return data


def thumbnail_path(stored_path: str) -> Path:
    """Where a photo's thumbnail lives: beside it, same name + .thumb.jpg."""
    return Path(f"{stored_path}.thumb.jpg")


def save_thumbnail(stored_path: Path, data: bytes) -> None:
    try:
        thumbnail_path(str(stored_path)).write_bytes(data)
    except OSError as exc:  # a missing thumbnail only costs the grid a preview
        logger.warning("thumbnail_write_failed", path=str(stored_path), error=str(exc))


def delete_stored(stored_path: str | None) -> None:
    """Best-effort removal of the stored file and its thumbnail (a missing
    file is not an error)."""
    if not is_within_root(stored_path):
        return
    for path in (Path(stored_path), thumbnail_path(stored_path)):
        try:
            if path.exists():
                path.unlink()
                logger.info("attachment_removed", path=str(path))
        except OSError as exc:
            logger.warning("attachment_remove_failed", path=str(path), error=str(exc))


def delete_after_commit(session, paths: list[str]) -> None:
    """Remove stored files once `session` commits — never before.

    Deleting the bytes first (as attachment delete used to) meant a
    transaction that then rolled back left a row pointing at a missing file;
    and a cascaded delete of a site/survey/finding/action removed attachment
    ROWS in the database while leaving their files on the volume for ever.
    """
    if not paths:
        return
    from sqlalchemy import event

    sync_session = getattr(session, "sync_session", session)

    def _remove(_session) -> None:
        for path in paths:
            delete_stored(path)

    event.listen(sync_session, "after_commit", _remove, once=True)
