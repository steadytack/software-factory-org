"""Clean a search term (the `q` query parameter) before it reaches a query.

a NUL byte in `q` crashed the request (500), and a term
with stray spaces matched nothing. The term is cleaned like any other text and
trimmed; a blank term means "no search". A bad character is a 422 that names
the parameter, in the same shape FastAPI uses for its own validation errors.
"""

from fastapi import HTTPException, status

from app.core.text import clean_text


def clean_search(q: str | None) -> str | None:
    if q is None:
        return None
    try:
        return clean_text(q).strip() or None
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            [{"type": "value_error", "loc": ["query", "q"], "msg": str(exc), "input": None}],
        ) from exc
