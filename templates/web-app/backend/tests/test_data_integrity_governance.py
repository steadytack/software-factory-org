"""Data-integrity tests for audit trail and governance (stage 7).

Covers AUD-2 (comments/attachments/logins brought into the trail), GOV-2 (row
values and bound parameters out of the error logs) and INT-5 (files-to-rows
reconciliation, both directions).
"""

import io

import pytest

from tests.test_data_integrity import _login, _site, _survey

pytestmark = pytest.mark.usefixtures("db_engine")


async def _changelog_for(client, entity: str, entity_id: str) -> list[dict]:
    response = await client.get("/api/changelog", params={"entity": entity, "entity_id": entity_id})
    assert response.status_code == 200, response.text
    return response.json()["items"]


# ── AUD-2: comments and attachments are inside the audit trail ─────────────


async def test_comment_create_and_delete_are_audited(client, admin_auth):
    """AUD-2: `record_change` was called only by the four domain services, so
    creating or deleting a comment left no audit record at all — even though
    deletion is admin-only and destructive."""
    await _login(client, admin_auth)
    site = await _site(client)

    created = await client.post(
        "/api/comments",
        json={"entity": "site", "entity_id": site["id"], "text": "audited comment"},
    )
    assert created.status_code == 201
    summaries = [e["summary"] for e in await _changelog_for(client, "site", site["id"])]
    assert any("comment" in s.lower() for s in summaries), summaries

    assert (await client.delete(f"/api/comments/{created.json()['id']}")).status_code == 204
    entries = await _changelog_for(client, "site", site["id"])
    deletion = [e for e in entries if "Deleted a comment" in e["summary"]]
    assert deletion, [e["summary"] for e in entries]
    # Attribution is recorded, which is the whole point of an audit trail.
    assert deletion[0]["actor"] == admin_auth["email"]


async def test_attachment_upload_and_delete_are_audited(client, admin_auth):
    """AUD-2: attachment deletion removes FILE BYTES irreversibly and left no
    audit record whatsoever."""
    await _login(client, admin_auth)
    site = await _site(client)
    survey = await _survey(client, site["id"])

    uploaded = await client.post(
        "/api/attachments",
        params={"entity": "survey", "entity_id": survey["id"]},
        files={"file": ("audit.txt", io.BytesIO(b"some bytes"), "text/plain")},
    )
    assert uploaded.status_code == 201, uploaded.text
    summaries = [e["summary"] for e in await _changelog_for(client, "survey", survey["id"])]
    assert any("Uploaded attachment" in s for s in summaries), summaries
    # The byte count is recorded — attachment bytes are the one thing here
    # that cannot be reconstructed from anything else.
    assert any("bytes" in s for s in summaries)

    assert (await client.delete(f"/api/attachments/{uploaded.json()['id']}")).status_code == 204
    summaries = [e["summary"] for e in await _changelog_for(client, "survey", survey["id"])]
    assert any("Deleted attachment" in s for s in summaries), summaries


async def test_audit_trail_records_no_before_after_values(client, admin_auth):
    """Q-D6, recorded as a test so it reads as a decision rather than a gap:
    the trail records **which field** changed, by whom and when — and
    deliberately **not** the values (AUD-1 stays open by choice)."""
    await _login(client, admin_auth)
    site = await _site(client, notes="first value")
    await client.patch(f"/api/sites/{site['id']}", json={"notes": "second value"})
    await client.patch(f"/api/sites/{site['id']}", json={"notes": "third value"})

    updates = [
        e["summary"]
        for e in await _changelog_for(client, "site", site["id"])
        if e["action"] == "updated"
    ]
    assert len(updates) == 2
    # Two PATCHes setting different values produce identical entries. That is
    # the documented consequence of Q-D6, not an oversight.
    assert updates[0] == updates[1]
    assert "second value" not in " ".join(updates)
    assert "third value" not in " ".join(updates)


# ── GOV-2: row values and bound parameters stay out of the logs ────────────


def test_redact_db_error_strips_the_failing_row():
    """GOV-2: the IntegrityError handler logged the driver message, which
    embeds Postgres's `DETAIL: Failing row contains (...)` — every column
    value of the failing row."""
    from app.main import redact_db_error

    exc = Exception(
        'duplicate key value violates unique constraint "uq_sites_name_normalized"\n'
        "DETAIL:  Failing row contains (01a0-..., Tower Bridge, bridge, active, "
        "1 Secret Street, private notes, 0101..., 2026-09-17, 2026-09-17)."
    )
    redacted = redact_db_error(exc)
    assert "uq_sites_name_normalized" in redacted
    assert "Failing row" not in redacted
    assert "Secret Street" not in redacted
    assert "private notes" not in redacted


def test_redact_db_error_strips_sql_and_bound_parameters():
    """GOV-2: the 500 handler logged the full SQL **with all bound
    parameters** — in audit probe B8 that included a user's email, a
    notification's title and body, and record ids."""
    from app.main import redact_db_error

    exc = Exception(
        "value too long for type character varying(200)\n"
        "[SQL: INSERT INTO notifications (user_email, title, body) "
        "VALUES ($1::VARCHAR, $2::VARCHAR, $3::VARCHAR)]\n"
        "[parameters: ('admin@example.com', 'Action overdue: A. Surveyor', "
        "'Remedial action for finding at Tower Bridge.')]"
    )
    redacted = redact_db_error(exc)
    assert "character varying(200)" in redacted
    assert "admin@example.com" not in redacted
    assert "INSERT INTO" not in redacted
    assert "parameters" not in redacted


def test_redact_db_error_always_returns_something():
    """A redactor that can return an empty string hides the incident itself."""
    from app.main import redact_db_error

    assert redact_db_error(ValueError("")) == "ValueError"


async def test_duplicate_name_still_returns_409(client, admin_auth):
    """GOV-2 regression guard: redaction must not change the response, only
    what is written to the log."""
    await _login(client, admin_auth)
    await _site(client, name="Redaction Test Site")
    duplicate = await client.post(
        "/api/sites",
        json={
            "name": "Redaction Test Site",
            "site_type": "bridge",
            "status": "active",
            "latitude": 51.5,
            "longitude": -0.12,
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == (
        "Conflict with existing data (duplicate or invalid reference)"
    )


# ── INT-5: files-to-rows reconciliation, both directions ──────────────────


async def test_reconciliation_finds_an_orphan_file(db_session, tmp_path, monkeypatch):
    """INT-5: `DELETE /admin/orphans` works from the ROWS outward, so a file
    whose row is already gone is unreachable by it forever — which is how the
    uploads volume came to hold 46 files with 0 attachment rows."""
    from app import reconcile
    from app.core import storage

    monkeypatch.setattr(storage, "storage_root", lambda: tmp_path)
    monkeypatch.setattr(reconcile, "storage_root", lambda: tmp_path)
    monkeypatch.setattr(
        storage,
        "is_within_root",
        lambda p: bool(p) and str(p).startswith(str(tmp_path)),
    )
    monkeypatch.setattr(reconcile, "is_within_root", storage.is_within_root)

    orphan = tmp_path / "deadbeef.txt"
    orphan.write_bytes(b"orphaned bytes")

    report = await reconcile.build_report(db_session)
    assert report.stored_files == 1
    assert report.orphan_count == 1
    assert report.orphan_files == ["deadbeef.txt"]
    assert report.orphan_bytes == len(b"orphaned bytes")
    # A dry run must change nothing.
    assert orphan.exists()
    assert "deadbeef.txt" in report.render()

    removed, freed = reconcile.delete_orphans(report)
    assert (removed, freed) == (1, len(b"orphaned bytes"))
    assert not orphan.exists()


async def test_reconciliation_reports_rows_whose_bytes_are_gone(client, admin_auth, db_session):
    """INT-5 reports **both** directions: a row whose file has vanished makes
    the download 404 and is equally invisible today.

    The file is removed from the real storage root (not by repointing the
    root, which would instead exercise the `paths_outside_root` branch), so
    this is the genuine "row survived, bytes did not" case.
    """
    from pathlib import Path

    from sqlalchemy import select

    from app import reconcile
    from app.models.comment import Attachment

    await _login(client, admin_auth)
    site = await _site(client)
    uploaded = await client.post(
        "/api/attachments",
        params={"entity": "site", "entity_id": site["id"]},
        files={"file": ("gone.txt", io.BytesIO(b"bytes"), "text/plain")},
    )
    assert uploaded.status_code == 201, uploaded.text

    stored_path = await db_session.scalar(
        select(Attachment.stored_path).where(Attachment.id == uploaded.json()["id"])
    )
    assert stored_path, "the upload should have recorded a stored_path"
    Path(stored_path).unlink()

    report = await reconcile.build_report(db_session)
    assert report.missing_count >= 1
    assert any(str(uploaded.json()["id"]) in entry for entry in report.missing_files)
    assert "download would 404" in report.render()


async def test_reconciliation_does_not_call_a_photo_thumbnail_an_orphan(
    client, admin_auth, db_session
):
    """A photo's `<name>.thumb.jpg` belongs to its attachment row; reporting it
    as an orphan would let `--delete` destroy valid thumbnails."""
    from pathlib import Path

    from sqlalchemy import select

    from app import reconcile
    from app.core.storage import thumbnail_path
    from app.models.comment import Attachment

    await _login(client, admin_auth)
    site = await _site(client)
    uploaded = await client.post(
        "/api/attachments",
        params={"entity": "site", "entity_id": site["id"]},
        files={"file": ("p.txt", io.BytesIO(b"bytes"), "text/plain")},
    )
    assert uploaded.status_code == 201, uploaded.text
    stored_path = await db_session.scalar(
        select(Attachment.stored_path).where(Attachment.id == uploaded.json()["id"])
    )
    thumb = thumbnail_path(stored_path)
    thumb.write_bytes(b"thumb")
    try:
        report = await reconcile.build_report(db_session)
        assert Path(thumb).name not in report.orphan_files
    finally:
        thumb.unlink(missing_ok=True)


async def test_storage_reconciliation_endpoint_is_read_only(
    client, admin_auth, tmp_path, monkeypatch
):
    """The HTTP report exists so the state is observable without shell
    access; deleting bytes deliberately has no HTTP route."""
    from app import reconcile
    from app.core import storage

    monkeypatch.setattr(reconcile, "storage_root", lambda: tmp_path)
    monkeypatch.setattr(storage, "storage_root", lambda: tmp_path)
    (tmp_path / "stray.bin").write_bytes(b"x" * 10)

    await _login(client, admin_auth)
    response = await client.get("/api/admin/storage-reconciliation")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["stored_files"] == 1
    assert body["orphan_files"] == 1
    assert body["orphan_bytes"] == 10
    # Read-only: the file is still there.
    assert (tmp_path / "stray.bin").exists()
    assert (await client.delete("/api/admin/storage-reconciliation")).status_code == 405


async def test_storage_reconciliation_requires_admin(client):
    assert (await client.get("/api/admin/storage-reconciliation")).status_code == 401


# ── AUD-2: a successful login is now an event, not just a timestamp ───────


async def test_successful_login_emits_an_event(client, admin_auth):
    """AUD-2: `users.last_login_at` is OVERWRITTEN each login, so there was no
    login history at all — only "the most recent one", while *failures* got
    their own table. Q-D6 rules out a new table, so the success is emitted to
    the structured log alongside them, carrying the PREVIOUS login time so a
    reader can see the sequence."""
    from structlog.testing import capture_logs

    with capture_logs() as entries:
        await _login(client, admin_auth)
    events = [e for e in entries if e.get("event") == "login_succeeded"]
    assert events, [e.get("event") for e in entries]
    assert events[0]["email"] == admin_auth["email"]
    assert "previous_login_at" in events[0]
