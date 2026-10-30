"""Schemas for comments and attachments.

Moved out of the endpoints module (which previously defined Pydantic models
inline) so the API layer stays thin and the response shapes are typed and
generated into the OpenAPI client like every other entity.
"""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.enums import EntityValue
from app.schemas.validators import COMMENT_MAX_LENGTH, ClientId, required_text


class CommentCreate(BaseModel):
    id: ClientId = None
    entity: EntityValue
    entity_id: str = Field(max_length=64)
    # `required_text` is the generalisation of the strip-and-reject validator
    # this field used to carry alone, and it now also bounds the
    # length — a 100,000-character comment was accepted and stored in full
    # .
    text: required_text(COMMENT_MAX_LENGTH)  # type: ignore[valid-type]


class CommentRead(BaseModel):
    id: str
    entity: str
    entity_id: str
    author: str
    text: str
    created_at: datetime


class CommentList(BaseModel):
    total: int
    items: list[CommentRead]


class PhotoLocation(BaseModel):
    latitude: float
    longitude: float


class AttachmentRead(BaseModel):
    id: str
    entity: str
    entity_id: str
    name: str
    size_bytes: int
    content_type: str | None
    uploaded_by: str
    created_at: datetime
    # A small JPEG preview exists at /api/attachments/{id}/thumbnail.
    has_thumbnail: bool = False
    # Only on the upload response: where the photo's EXIF said it was taken.
    # The metadata itself is stripped from the stored file; this lets the UI
    # offer the position as the finding's location.
    photo_location: PhotoLocation | None = None


class AttachmentList(BaseModel):
    total: int
    items: list[AttachmentRead]
