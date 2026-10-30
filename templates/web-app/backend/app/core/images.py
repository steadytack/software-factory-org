"""Photo processing on upload.

Phone photos carry EXIF metadata: the GPS position they were taken at, the
device make, model and serial, sometimes the owner's name. Stored and served
byte-for-byte, anyone who could download an attachment could read all of it.
Every JPEG/PNG/WebP upload is therefore re-encoded:

* the EXIF orientation is applied to the pixels (so nothing shows sideways)
  and then every metadata block is dropped;
* the long edge is capped at MAX_EDGE, which keeps a 12 MP phone photo well
  under the upload cap without visible loss for survey use;
* a small JPEG thumbnail is written for the photo grid.

The GPS position is read out *before* it is stripped and handed back to the
caller, which can offer it as the finding's location — the user decides
whether it is kept, and it never stays inside the served file.

GIFs are passed through unchanged (they carry no EXIF, and re-encoding would
flatten animation).
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

try:  # iPhone photos are HEIC; Pillow reads them once this is registered.
    from pillow_heif import register_heif_opener

    register_heif_opener()
except (
    ImportError
):  # pragma: no cover - the dependency is declared; this only keeps a bare environment importable
    pass

MAX_EDGE = 3000
THUMB_EDGE = 400
# Decompression-bomb guard: a small file that decodes to a huge bitmap.
Image.MAX_IMAGE_PIXELS = 60_000_000

REENCODED = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
# Formats browsers can't show (an iPhone's HEIC) or that are needlessly large (TIFF, BMP): stored as
# JPEG instead.
CONVERTED_TO_JPEG = {
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence",
    "image/tiff",
    "image/bmp",
}
GPS_IFD = 0x8825


class ImageError(Exception):
    """The bytes are not a decodable image of the declared type."""


@dataclass
class ProcessedImage:
    data: bytes
    thumbnail: bytes
    # (latitude, longitude) from EXIF, or None.
    gps: tuple[float, float] | None


def _to_degrees(value) -> float:
    d, m, s = (float(x) for x in value)
    return d + m / 60 + s / 3600


def _gps(img: Image.Image) -> tuple[float, float] | None:
    try:
        gps = img.getexif().get_ifd(GPS_IFD)
        if not gps or 2 not in gps or 4 not in gps:
            return None
        lat = _to_degrees(gps[2]) * (-1 if gps.get(1) == "S" else 1)
        lng = _to_degrees(gps[4]) * (-1 if gps.get(3) == "W" else 1)
    except (ValueError, TypeError, ZeroDivisionError, KeyError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180) or (lat == 0 and lng == 0):
        return None
    return round(lat, 6), round(lng, 6)


def is_processable(content_type: str | None) -> bool:
    return content_type in REENCODED or content_type in CONVERTED_TO_JPEG


def is_converted(content_type: str | None) -> bool:
    """True when the stored file will be a JPEG made from this type."""
    return content_type in CONVERTED_TO_JPEG


def process_image(data: bytes, content_type: str) -> ProcessedImage:
    fmt = REENCODED.get(content_type, "JPEG")
    try:
        with Image.open(BytesIO(data)) as source:
            source.load()
            gps = _gps(source)
            img = ImageOps.exif_transpose(source)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ImageError("The file could not be read as an image") from exc

    img.thumbnail((MAX_EDGE, MAX_EDGE))
    if fmt == "JPEG" and img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    out = BytesIO()
    # Empty `info` and no exif=/pnginfo=: some encoders fall back to the
    # source's info["exif"], so nothing of the original metadata is left for
    # them to write back.
    clean = img.copy()
    clean.info = {}
    save_kwargs = {"JPEG": {"quality": 85, "optimize": True}, "WEBP": {"quality": 85}}.get(fmt, {})
    clean.save(out, format=fmt, **save_kwargs)

    thumb = img.convert("RGB") if img.mode != "RGB" else img.copy()
    thumb.thumbnail((THUMB_EDGE, THUMB_EDGE))
    thumb_out = BytesIO()
    thumb.save(thumb_out, format="JPEG", quality=80, optimize=True)

    return ProcessedImage(data=out.getvalue(), thumbnail=thumb_out.getvalue(), gps=gps)
