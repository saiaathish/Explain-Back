import inspect
import json
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from uuid import UUID

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from fastapi import HTTPException, Request
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from jwt import PyJWK
from jwt.exceptions import (
    PyJWKClientConnectionError,
    PyJWKClientError,
    PyJWKSetError,
)

from backend import auth, main


SUPABASE_URL = "https://project-ref.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
USER_ID = UUID("c115b779-4e0d-4e1c-92a0-6834e3c08df1")
SESSION_ID = UUID("9516ba59-ab7f-4c55-b1a1-18f901eced1c")


def _request(headers: list[tuple[str, str]] | None = None) -> Request:
    return Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "https",
            "path": "/",
            "raw_path": b"/",
            "root_path": "",
            "query_string": b"",
            "headers": [
                (name.lower().encode("ascii"), value.encode("ascii"))
                for name, value in (headers or [])
            ],
            "client": ("testclient", 50000),
            "server": ("testserver", 443),
        }
    )


def _claims(**overrides: object) -> dict[str, object]:
    now = int(time.time())
    claims: dict[str, object] = {
        "exp": now + 300,
        "iat": now,
        "sub": str(USER_ID),
        "iss": ISSUER,
        "aud": "authenticated",
        "role": "authenticated",
        "session_id": str(SESSION_ID),
        "is_anonymous": False,
    }
    claims.update(overrides)
    return claims


def _signing_material(
    algorithm: str,
    *,
    key_id: str = "test-key",
) -> tuple[Any, PyJWK]:
    if algorithm == "RS256":
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        jwk_data = jwt.algorithms.RSAAlgorithm.to_jwk(
            private_key.public_key(), as_dict=True
        )
    else:
        private_key = ec.generate_private_key(ec.SECP256R1())
        jwk_data = jwt.algorithms.ECAlgorithm.to_jwk(
            private_key.public_key(), as_dict=True
        )
    jwk_data.update({"kid": key_id, "alg": algorithm, "use": "sig"})
    return private_key, PyJWK.from_dict(jwk_data)


def _token(
    private_key: Any,
    algorithm: str,
    claims: dict[str, object] | None = None,
    *,
    key_id: str = "test-key",
) -> str:
    return jwt.encode(
        claims or _claims(),
        private_key,
        algorithm=algorithm,
        headers={"kid": key_id},
    )


async def _authenticate(
    monkeypatch: pytest.MonkeyPatch,
    token: str,
    signing_key: object,
):
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(
        auth,
        "_get_signing_key",
        lambda jwks_url, received_token: signing_key,
    )
    return await auth.require_authenticated_user(
        _request([("Authorization", f"Bearer {token}")])
    )


async def _authenticate_with_client(
    monkeypatch: pytest.MonkeyPatch,
    token: str,
    client: object,
):
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(auth, "_jwks_client", lambda _jwks_url: client)
    return await auth.require_authenticated_user(
        _request([("Authorization", f"Bearer {token}")])
    )


def _clear_refresh_states() -> None:
    with auth._jwks_refresh_states_guard:
        auth._jwks_refresh_states.clear()


@pytest.mark.parametrize(
    "headers",
    [
        [],
        [("Authorization", "")],
        [("Authorization", "Basic abc")],
        [("Authorization", "Bearer")],
        [("Authorization", "Bearer one two")],
        [("Authorization", "Bearer one"), ("Authorization", "Bearer two")],
    ],
    ids=[
        "missing",
        "empty",
        "basic",
        "empty-bearer",
        "extra-part",
        "duplicate",
    ],
)
def test_bearer_header_is_strict(headers: list[tuple[str, str]]) -> None:
    with pytest.raises(HTTPException) as caught:
        auth._bearer_token(_request(headers))

    assert caught.value.status_code == 401
    assert caught.value.headers == {"WWW-Authenticate": "Bearer"}


@pytest.mark.asyncio
@pytest.mark.parametrize("algorithm", ["RS256", "ES256"])
async def test_valid_asymmetric_tokens_use_to_thread_and_return_identity(
    monkeypatch: pytest.MonkeyPatch,
    algorithm: str,
) -> None:
    private_key, signing_key = _signing_material(algorithm)
    token = _token(private_key, algorithm)
    calls: list[tuple[Callable[..., object], tuple[object, ...]]] = []

    async def run_in_thread(function, *args):
        calls.append((function, args))
        return function(*args)

    monkeypatch.setattr(auth.asyncio, "to_thread", run_in_thread)
    identity = await _authenticate(monkeypatch, token, signing_key)

    assert identity == auth.AuthenticatedUser(
        user_id=USER_ID,
        session_id=SESSION_ID,
        is_anonymous=False,
    )
    assert calls == [
        (
            auth._get_signing_key,
            (f"{ISSUER}/.well-known/jwks.json", token),
        )
    ]


@pytest.mark.asyncio
async def test_wrong_signature_is_unauthorized(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private_key, _ = _signing_material("RS256")
    _, other_signing_key = _signing_material("RS256")

    with pytest.raises(HTTPException) as caught:
        await _authenticate(
            monkeypatch,
            _token(private_key, "RS256"),
            other_signing_key,
        )

    assert caught.value.status_code == 401
    assert caught.value.headers == {"WWW-Authenticate": "Bearer"}


@pytest.mark.asyncio
async def test_non_asymmetric_algorithm_is_unauthorized(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    symmetric_key = "symmetric-test-secret-that-is-long-enough"
    token = jwt.encode(
        _claims(),
        symmetric_key,
        algorithm="HS256",
        headers={"kid": "test-key"},
    )

    def unexpected_client(_jwks_url: str):
        raise AssertionError("Unsupported algorithms must not trigger a JWKS lookup.")

    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(auth, "_jwks_client", unexpected_client)
    with pytest.raises(HTTPException) as caught:
        await auth.require_authenticated_user(
            _request([("Authorization", f"Bearer {token}")])
        )

    assert caught.value.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("claim", "value"),
    [
        ("iss", "https://other.example/auth/v1"),
        ("aud", "anon"),
        ("role", "service_role"),
        ("exp", lambda: int(time.time()) - 60),
        ("iat", lambda: int(time.time()) + 60),
        ("sub", "not-a-uuid"),
        ("session_id", "not-a-uuid"),
        ("is_anonymous", "false"),
    ],
    ids=[
        "issuer",
        "audience",
        "role",
        "expired",
        "future-issued-at",
        "subject-uuid",
        "session-uuid",
        "anonymous-boolean",
    ],
)
async def test_invalid_claim_is_unauthorized(
    monkeypatch: pytest.MonkeyPatch,
    claim: str,
    value: object,
) -> None:
    private_key, signing_key = _signing_material("RS256")
    resolved_value = value() if callable(value) else value

    with pytest.raises(HTTPException) as caught:
        await _authenticate(
            monkeypatch,
            _token(private_key, "RS256", _claims(**{claim: resolved_value})),
            signing_key,
        )

    assert caught.value.status_code == 401
    assert caught.value.headers == {"WWW-Authenticate": "Bearer"}


@pytest.mark.asyncio
@pytest.mark.parametrize("missing_claim", auth.REQUIRED_CLAIMS)
async def test_every_required_claim_is_enforced(
    monkeypatch: pytest.MonkeyPatch,
    missing_claim: str,
) -> None:
    private_key, signing_key = _signing_material("RS256")
    claims = _claims()
    del claims[missing_claim]

    with pytest.raises(HTTPException) as caught:
        await _authenticate(
            monkeypatch,
            _token(private_key, "RS256", claims),
            signing_key,
        )

    assert caught.value.status_code == 401


def test_jwks_client_disables_unbounded_per_key_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}
    sentinel = object()

    def build_client(url: str, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return sentinel

    auth._jwks_client.cache_clear()
    monkeypatch.setattr(auth, "PyJWKClient", build_client)
    try:
        client = auth._jwks_client("https://example.test/jwks.json")
    finally:
        auth._jwks_client.cache_clear()

    assert client is sentinel
    assert captured["cache_keys"] is False
    assert captured["cache_jwk_set"] is True
    assert captured["lifespan"] == 300


@pytest.mark.asyncio
async def test_jwks_rotation_and_key_removal_do_not_reuse_old_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    old_private_key, old_signing_key = _signing_material("RS256")
    new_private_key, new_signing_key = _signing_material("RS256")

    class MutableClient:
        signing_keys = [old_signing_key]
        calls: list[bool] = []

        def get_signing_keys(self, refresh: bool = False):
            self.calls.append(refresh)
            return self.signing_keys

    client = MutableClient()
    old_token = _token(old_private_key, "RS256")
    new_token = _token(new_private_key, "RS256")

    old_identity = await _authenticate_with_client(monkeypatch, old_token, client)
    client.signing_keys = [new_signing_key]
    new_identity = await _authenticate_with_client(monkeypatch, new_token, client)

    with pytest.raises(HTTPException) as caught:
        await _authenticate_with_client(monkeypatch, old_token, client)

    assert old_identity.user_id == USER_ID
    assert new_identity.user_id == USER_ID
    assert caught.value.status_code == 401
    assert caught.value.headers == {"WWW-Authenticate": "Bearer"}
    assert client.calls == [False, False, False]


@pytest.mark.asyncio
async def test_no_matching_key_id_is_unauthorized(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private_key, _ = _signing_material("RS256")
    _, other_signing_key = _signing_material("RS256", key_id="other-key")

    class NoMatchClient:
        calls: list[bool] = []

        def get_signing_keys(self, refresh: bool = False):
            self.calls.append(refresh)
            return [other_signing_key]

    _clear_refresh_states()
    try:
        client = NoMatchClient()
        with pytest.raises(HTTPException) as caught:
            await _authenticate_with_client(
                monkeypatch,
                _token(private_key, "RS256"),
                client,
            )

        assert caught.value.status_code == 401
        assert caught.value.headers == {"WWW-Authenticate": "Bearer"}
        assert client.calls == [False, True]
    finally:
        _clear_refresh_states()


def test_sequential_unknown_kid_refresh_is_cooled_down_but_rotation_recovers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, known_signing_key = _signing_material("RS256", key_id="known-key")
    unknown_private_key, rotated_signing_key = _signing_material(
        "RS256",
        key_id="rotated-key",
    )
    unknown_token = _token(
        unknown_private_key,
        "RS256",
        key_id="rotated-key",
    )

    class RotatingClient:
        cached_keys = [known_signing_key]
        remote_keys = [known_signing_key]
        calls: list[bool] = []

        def get_signing_keys(self, refresh: bool = False):
            self.calls.append(refresh)
            if refresh:
                self.cached_keys = list(self.remote_keys)
            return list(self.cached_keys)

    client = RotatingClient()
    monkeypatch.setattr(auth, "_jwks_client", lambda _jwks_url: client)
    _clear_refresh_states()
    try:
        for _ in range(2):
            with pytest.raises(auth._InvalidAuthenticationToken):
                auth._get_signing_key(
                    f"{ISSUER}/.well-known/jwks.json",
                    unknown_token,
                )

        assert client.calls.count(True) == 1

        client.remote_keys = [known_signing_key, rotated_signing_key]
        state = auth._refresh_state(f"{ISSUER}/.well-known/jwks.json")
        assert state.last_forced_refresh_at is not None
        state.last_forced_refresh_at -= (
            auth.JWKS_FORCED_REFRESH_COOLDOWN_SECONDS + 1
        )

        assert (
            auth._get_signing_key(
                f"{ISSUER}/.well-known/jwks.json",
                unknown_token,
            )
            is rotated_signing_key
        )
        assert client.calls.count(True) == 2
    finally:
        _clear_refresh_states()


def test_concurrent_unknown_kids_share_one_forced_refresh(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workers = 8
    _, known_signing_key = _signing_material("RS256", key_id="known-key")
    unknown_private_key, _ = _signing_material("RS256", key_id="unknown-key")
    unknown_token = _token(
        unknown_private_key,
        "RS256",
        key_id="unknown-key",
    )
    initial_lookup_barrier = threading.Barrier(workers)

    class ConcurrentClient:
        calls: list[bool] = []
        calls_lock = threading.Lock()

        def get_signing_keys(self, refresh: bool = False):
            with self.calls_lock:
                self.calls.append(refresh)
            if refresh:
                time.sleep(0.05)
            return [known_signing_key]

    client = ConcurrentClient()
    monkeypatch.setattr(auth, "_jwks_client", lambda _jwks_url: client)
    _clear_refresh_states()

    def resolve_unknown(_index: int) -> str:
        initial_lookup_barrier.wait(timeout=5)
        try:
            auth._get_signing_key(
                f"{ISSUER}/.well-known/jwks.json",
                unknown_token,
            )
        except auth._InvalidAuthenticationToken:
            return "invalid"
        return "unexpected"

    try:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            results = list(executor.map(resolve_unknown, range(workers)))

        assert results == ["invalid"] * workers
        assert client.calls.count(True) == 1
    finally:
        _clear_refresh_states()


def test_concurrent_cold_cache_outage_shares_one_ordinary_fetch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workers = 8
    private_key, _ = _signing_material("RS256")
    token = _token(private_key, "RS256")
    start_barrier = threading.Barrier(workers)

    class ColdOutageClient:
        calls: list[bool] = []
        calls_lock = threading.Lock()

        def get_signing_keys(self, refresh: bool = False):
            with self.calls_lock:
                self.calls.append(refresh)
            time.sleep(0.05)
            raise PyJWKClientConnectionError("JWKS unavailable")

    client = ColdOutageClient()
    monkeypatch.setattr(auth, "_jwks_client", lambda _jwks_url: client)
    _clear_refresh_states()

    def resolve_during_outage(_index: int) -> str:
        start_barrier.wait(timeout=5)
        try:
            auth._get_signing_key(
                f"{ISSUER}/.well-known/jwks.json",
                token,
            )
        except auth._JWKSUnavailable:
            return "unavailable"
        return "unexpected"

    try:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            results = list(executor.map(resolve_during_outage, range(workers)))

        assert results == ["unavailable"] * workers
        assert client.calls == [False]
    finally:
        _clear_refresh_states()


@pytest.mark.asyncio
async def test_malformed_token_is_unauthorized_without_jwks_lookup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)

    def unexpected_client(_jwks_url: str):
        raise AssertionError("Malformed tokens must not trigger a JWKS request.")

    monkeypatch.setattr(auth, "_jwks_client", unexpected_client)
    with pytest.raises(HTTPException) as caught:
        await auth.require_authenticated_user(
            _request([("Authorization", "Bearer invalid.token.value")])
        )

    assert caught.value.status_code == 401
    assert caught.value.headers == {"WWW-Authenticate": "Bearer"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure",
    [
        json.JSONDecodeError("malformed JWKS JSON", "", 0),
        PyJWKClientError("The JWKS endpoint did not return a JSON object"),
        PyJWKClientError("The JWKS endpoint did not contain any signing keys"),
        PyJWKSetError("Invalid JWK Set value"),
        [],
    ],
    ids=[
        "malformed-json",
        "non-object",
        "empty-keyset-error",
        "key-parse-error",
        "empty-key-list",
    ],
)
async def test_invalid_jwks_document_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
    failure: Exception | list[object],
) -> None:
    private_key, _ = _signing_material("RS256")

    class BrokenClient:
        def get_signing_keys(self, refresh: bool = False):
            if isinstance(failure, Exception):
                raise failure
            return failure

    _clear_refresh_states()
    try:
        with pytest.raises(HTTPException) as caught:
            await _authenticate_with_client(
                monkeypatch,
                _token(private_key, "RS256"),
                BrokenClient(),
            )

        assert caught.value.status_code == 503
        assert caught.value.detail == "Authentication service is unavailable."
        assert caught.value.headers is None
    finally:
        _clear_refresh_states()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "error_type",
    [PyJWKClientConnectionError, TimeoutError, OSError],
)
async def test_jwks_transport_failure_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
    error_type: type[Exception],
) -> None:
    private_key, _ = _signing_material("RS256")

    class UnavailableClient:
        def get_signing_keys(self, refresh: bool = False):
            raise error_type("JWKS unavailable")

    _clear_refresh_states()
    try:
        with pytest.raises(HTTPException) as caught:
            await _authenticate_with_client(
                monkeypatch,
                _token(private_key, "RS256"),
                UnavailableClient(),
            )

        assert caught.value.status_code == 503
        assert caught.value.detail == "Authentication service is unavailable."
        assert caught.value.headers is None
    finally:
        _clear_refresh_states()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "supabase_url",
    [
        None,
        "",
        "ftp://project-ref.supabase.co",
        "http://project-ref.supabase.co",
        "https://user@project-ref.supabase.co",
        "https://project-ref.supabase.co?key=value",
        "https://[",
        "https://project-ref.supabase.co:not-a-port",
        "https://project-ref.supabase.co/path",
    ],
    ids=[
        "missing",
        "empty",
        "unsupported-scheme",
        "insecure-remote",
        "userinfo",
        "query-string",
        "invalid-ipv6",
        "invalid-port",
        "non-root-path",
    ],
)
async def test_missing_or_invalid_supabase_url_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
    supabase_url: str | None,
) -> None:
    if supabase_url is None:
        monkeypatch.delenv("SUPABASE_URL", raising=False)
    else:
        monkeypatch.setenv("SUPABASE_URL", supabase_url)

    with pytest.raises(HTTPException) as caught:
        await auth.require_authenticated_user(
            _request([("Authorization", "Bearer invalid.token.value")])
        )

    assert caught.value.status_code == 503


def test_supabase_url_derives_exact_issuer_and_jwks_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SUPABASE_URL", f"{SUPABASE_URL}/")

    settings = auth._settings()

    assert settings.issuer == ISSUER
    assert settings.jwks_url == f"{ISSUER}/.well-known/jwks.json"


def test_health_is_public_without_supabase_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)

    with TestClient(main.app) as client:
        response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        ("/api/analyze", {}),
        ("/api/transcribe", {}),
        ("/api/normalize-image", {}),
    ],
)
def test_all_model_backed_routes_reject_missing_auth(
    path: str,
    payload: dict[str, object],
) -> None:
    with TestClient(main.app) as client:
        response = client.post(path, json=payload)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_auth_failures_do_not_consume_shared_ip_quota(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    shared_ip = "203.0.113.42"
    monkeypatch.delenv("SUPABASE_URL", raising=False)

    async def authenticated_user() -> auth.AuthenticatedUser:
        return auth.AuthenticatedUser(
            user_id=USER_ID,
            session_id=SESSION_ID,
            is_anonymous=False,
        )

    main._rate_limit_events.clear()
    main._rate_limit_last_cleanup = 0.0
    try:
        with TestClient(main.app) as client:
            unauthorized = [
                client.post(
                    "/api/analyze",
                    json={},
                    headers={"X-Forwarded-For": shared_ip},
                )
                for _ in range(main.RATE_LIMIT_MAX_REQUESTS + 1)
            ]
            assert all(response.status_code == 401 for response in unauthorized)
            assert shared_ip not in main._rate_limit_events

            unavailable = client.post(
                "/api/analyze",
                json={},
                headers={
                    "Authorization": "Bearer invalid.token.value",
                    "X-Forwarded-For": shared_ip,
                },
            )
            assert unavailable.status_code == 503
            assert shared_ip not in main._rate_limit_events

            main.app.dependency_overrides[
                main.require_authenticated_user
            ] = authenticated_user
            authenticated = client.post(
                "/api/analyze",
                json={"source": "short", "explanation": "too short"},
                headers={"X-Forwarded-For": shared_ip},
            )

        assert authenticated.status_code == 400
        assert len(main._rate_limit_events[shared_ip]) == 1
    finally:
        main.app.dependency_overrides.pop(main.require_authenticated_user, None)
        main._rate_limit_events.clear()
        main._rate_limit_last_cleanup = 0.0


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        (
            "/api/analyze",
            {"source": "short", "explanation": "too short"},
        ),
        (
            "/api/transcribe",
            {"audio_data_url": "https://example.com/audio.webm"},
        ),
        (
            "/api/normalize-image",
            {"image_data_url": "https://example.com/image.png"},
        ),
    ],
)
def test_valid_auth_reaches_endpoint_validation(
    monkeypatch: pytest.MonkeyPatch,
    path: str,
    payload: dict[str, object],
) -> None:
    private_key, signing_key = _signing_material("RS256")
    token = _token(private_key, "RS256")
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setattr(
        auth,
        "_get_signing_key",
        lambda _jwks_url, _token_value: signing_key,
    )

    with TestClient(main.app) as client:
        response = client.post(
            path,
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )

    assert response.status_code == 400


def test_cors_preflight_permits_authorization_header() -> None:
    origin = main.os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",")[0]

    with TestClient(main.app) as client:
        response = client.options(
            "/api/analyze",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Authorization, Content-Type",
            },
        )

    assert response.status_code == 200
    allowed_headers = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed_headers
    assert "content-type" in allowed_headers


def test_only_model_backed_routes_have_auth_dependency() -> None:
    expected = {
        "/api/analyze",
        "/api/transcribe",
        "/api/normalize-image",
    }
    protected: set[str] = set()

    for route in main.app.routes:
        if not isinstance(route, APIRoute):
            continue
        dependencies = {dependency.call for dependency in route.dependant.dependencies}
        if main.require_authenticated_user in dependencies:
            protected.add(route.path)
        if route.path == "/api/health":
            assert main.require_authenticated_user not in dependencies

    assert protected == expected
    assert list(inspect.signature(main.analyze).parameters) == ["request_body"]
