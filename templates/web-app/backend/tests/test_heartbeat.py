"""The outbound heartbeat pings only while healthy, only over HTTPS, and never raises."""

from types import SimpleNamespace
from urllib.error import HTTPError, URLError

import pytest

from app import heartbeat

URL = "https://hc-ping.com/secret-check-key"
HEALTH = "http://backend:8000/api/health"


class _Response:
    def __init__(self, status: int = 200):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _settings(url: str = URL):
    return SimpleNamespace(
        heartbeat_url=url, heartbeat_health_url=HEALTH, heartbeat_every_seconds=300
    )


@pytest.fixture
def logs(monkeypatch):
    """Every log call the heartbeat makes, as (level, event, fields)."""
    seen: list = []

    class _Logger:
        def __getattr__(self, level):
            return lambda event, **fields: seen.append((level, event, fields))

    monkeypatch.setattr(heartbeat, "logger", _Logger())
    return seen


@pytest.fixture
def calls(monkeypatch):
    """Record every request; the health URL answers `health`, the ping answers 200."""
    seen: list = []
    state = {"health": 200, "ping_error": None}

    def fake_urlopen(request, timeout):
        url = request if isinstance(request, str) else request.full_url
        seen.append((request, timeout))
        if url == HEALTH:
            if state["health"] != 200:
                raise HTTPError(url, state["health"], "unavailable", {}, None)
            return _Response(200)
        if state["ping_error"]:
            raise state["ping_error"]
        return _Response(200)

    monkeypatch.setattr(heartbeat, "urlopen", fake_urlopen)
    return SimpleNamespace(requests=seen, state=state)


def _pings(calls):
    return [r for r, _ in calls.requests if not isinstance(r, str)]


def test_a_healthy_app_sends_one_plain_get(calls):
    assert heartbeat.beat(_settings()) is True
    (request,) = _pings(calls)
    assert request.full_url == URL
    assert request.get_method() == "GET" and request.data is None
    assert request.get_header("User-agent") == heartbeat.USER_AGENT
    assert all(timeout == 10 for _, timeout in calls.requests)


def test_an_unhealthy_app_sends_nothing(calls):
    calls.state["health"] = 503
    assert heartbeat.beat(_settings()) is False
    assert _pings(calls) == []


def test_an_empty_url_is_off_and_checks_nothing(calls):
    assert heartbeat.beat(_settings("")) is False
    assert calls.requests == []


def test_plain_http_is_refused(calls):
    assert heartbeat.ping("http://hc-ping.com/key") is False
    assert calls.requests == []


@pytest.mark.parametrize(
    "error", [URLError("down"), TimeoutError(), HTTPError(URL, 500, "x", {}, None)]
)
def test_a_failed_ping_is_logged_with_the_host_only_and_swallowed(calls, logs, error):
    calls.state["ping_error"] = error
    assert heartbeat.ping(URL) is False
    out = repr(logs)
    assert "hc-ping.com" in out and "secret-check-key" not in out


def test_a_sent_ping_logs_the_host_only(calls, logs):
    assert heartbeat.ping(URL) is True
    out = repr(logs)
    assert "hc-ping.com" in out and "secret-check-key" not in out


async def test_run_forever_returns_at_once_when_off(calls):
    await heartbeat.run_forever(_settings(""))
    assert calls.requests == []
