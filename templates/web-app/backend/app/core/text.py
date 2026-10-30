"""Text hygiene shared by every write path and every search box.

Audit run 2026-09-30-3 (Prompt 3) found three things the per-field rules in
`schemas/validators.py` did not cover:

* **R3-01** — a NUL byte (`U+0000`) cannot be stored in PostgreSQL text, so
  any free-text field (13 of 13 tried) and the `q` search parameter answered
  500. It is now a 422 that names the field.
* **R3-05** — `Café` typed as one code point and as `e` + a combining accent
  looked identical and were stored as different names; so did a name with a
  zero-width space in it. Text is stored in Unicode composed form (NFC) with
  the invisible characters removed, so the existing uniqueness rule sees them
  as the same name.
* **R3-12** — direction-override characters let a name or filename display as
  something it is not (`report<RLO>txt.exe`).

What is removed is deliberately narrow. Kept on purpose: the zero-width
joiner and non-joiner (needed for emoji sequences and Persian text) and the
left-to-right / right-to-left marks (needed for mixed-direction text).
"""

import re
import unicodedata

# C0 and C1 control characters except tab, line feed and carriage return; DEL.
# Nothing legitimate is written with these, and NUL cannot be stored at all.
_FORBIDDEN = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]")

# Invisible characters that change how text looks or sorts without being seen:
# zero-width space (200B), word joiner (2060), byte-order mark (FEFF), and the
# bidirectional embeddings / overrides (202A-202E) and isolates (2066-2069).
_INVISIBLE = re.compile("[​⁠﻿‪-‮⁦-⁩]")

FORBIDDEN_MESSAGE = "This field contains a character that can't be stored"


def clean_text(value: str) -> str:
    """Validate and normalise user-entered text.

    Raises `ValueError` (a 422 at the API) for control characters; removes the
    invisible characters; returns the result in NFC. Ordinary whitespace,
    emoji and non-Latin scripts are untouched.
    """
    if _FORBIDDEN.search(value):
        raise ValueError(FORBIDDEN_MESSAGE)
    return unicodedata.normalize("NFC", _INVISIBLE.sub("", value))


def scrub_text(value: str) -> str:
    """Like `clean_text` but never raises: control characters are dropped.
    For values that must be accepted whatever they contain, such as the name
    of an uploaded file."""
    return unicodedata.normalize("NFC", _INVISIBLE.sub("", _FORBIDDEN.sub("", value)))
