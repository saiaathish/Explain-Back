"""Server-side Supabase access-token verification."""

from __future__ import annotations

import asyncio
import os
import threading
import time
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import urlsplit
from uuid import UUID

import jwt
from fastapi import HTTPException, Request
from jwt import PyJWK, PyJWKClient
from jwt.exceptions import (
    InvalidTokenError,
    PyJWKClientConnectionError,
    PyJWKClientError,
    PyJWKError,
    PyJWKSetError,
)

JWT_ALGORITHMS = ("ES256", "RS256")
JWT_AUDIENCE = "authenticated"
REQUIRED_CLAIMS = (
    "exp",
    "iat",
    "sub",
    "iss",
    "aud",
    "role",
    "session_id",
    "is_anonymous",
)
JWKS_CACHE_SECONDS = 300
JWKS_TIMEOUT_SECONDS = 5
JWKS_FORCED_REFRESH_COOLDOWN_SECONDS = 5.0


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: UUID
    session_id: UUID
    is_anonymous: bool


@dataclass(frozen=True)
class _AuthSettings:
    issuer: str
    jwks_url: str


class _AuthConfigurationError(RuntimeError):
    pass


class _InvalidAuthenticationToken(RuntimeError):
    pass


class _JWKSUnavailable(RuntimeError):
    pass


@dataclass
class _JWKSRefreshState:
    lock: threading.Lock
    last_cached_load_failure_at: float | None = None
    last_forced_refresh_at: float | None = None
    last_forced_refresh_failed: bool = False


_jwks_refresh_states: dict[str, _JWKSRefreshState] = {}
_jwks_refresh_states_guard = threading.Lock()


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Invalid or missing authentication credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _unavailable() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail="Authentication service is unavailable.",
    )


def _bearer_token(request: Request) -> str:
    values = request.headers.getlist("authorization")
    if len(values) != 1:
        raise _unauthorized()
    parts = values[0].strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
        raise _unauthorized()
    return parts[1]


def _settings() -> _AuthSettings:
    raw_url = os.getenv("SUPABASE_URL", "").strip()
    if not raw_url:
        raise _AuthConfigurationError("SUPABASE_URL is not configured.")

    base_url = raw_url.rstrip("/")
    try:
        parsed = urlsplit(base_url)
        parsed.port
    except ValueError as exc:
        raise _AuthConfigurationError("SUPABASE_URL is invalid.") from exc

    local_hosts = {"localhost", "127.0.0.1", "::1"}
    if (
        not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path
        or parsed.query
        or parsed.fragment
        or (
            parsed.scheme != "https"
            and not (parsed.scheme == "http" and parsed.hostname in local_hosts)
        )
    ):
        raise _AuthConfigurationError("SUPABASE_URL is invalid.")

    issuer = f"{base_url}/auth/v1"
    return _AuthSettings(
        issuer=issuer,
        jwks_url=f"{issuer}/.well-known/jwks.json",
    )


@lru_cache(maxsize=4)
def _jwks_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(
        jwks_url,
        cache_keys=False,
        cache_jwk_set=True,
        lifespan=JWKS_CACHE_SECONDS,
        timeout=JWKS_TIMEOUT_SECONDS,
    )


def _load_signing_keys(
    client: PyJWKClient,
    *,
    refresh: bool,
) -> list[PyJWK]:
    try:
        signing_keys = client.get_signing_keys(refresh=refresh)
    except (PyJWKClientConnectionError, TimeoutError, OSError) as exc:
        raise _JWKSUnavailable from exc
    except (
        PyJWKClientError,
        PyJWKError,
        PyJWKSetError,
        KeyError,
        TypeError,
        ValueError,
    ) as exc:
        raise _JWKSUnavailable from exc

    if not signing_keys or not all(isinstance(key, PyJWK) for key in signing_keys):
        raise _JWKSUnavailable
    return signing_keys


def _refresh_state(jwks_url: str) -> _JWKSRefreshState:
    with _jwks_refresh_states_guard:
        state = _jwks_refresh_states.get(jwks_url)
        if state is None:
            state = _JWKSRefreshState(lock=threading.Lock())
            _jwks_refresh_states[jwks_url] = state
        return state


def _matching_key(signing_keys: list[PyJWK], key_id: str) -> PyJWK | None:
    return next(
        (key for key in signing_keys if key.key_id == key_id),
        None,
    )


def _get_signing_key(jwks_url: str, token: str) -> PyJWK:
    try:
        header = jwt.get_unverified_header(token)
    except InvalidTokenError as exc:
        raise _InvalidAuthenticationToken from exc
    if header.get("alg") not in JWT_ALGORITHMS:
        raise _InvalidAuthenticationToken

    key_id = header.get("kid")
    if not isinstance(key_id, str) or not key_id:
        raise _InvalidAuthenticationToken

    client = _jwks_client(jwks_url)
    state = _refresh_state(jwks_url)
    with state.lock:
        now = time.monotonic()
        if (
            state.last_cached_load_failure_at is not None
            and now - state.last_cached_load_failure_at
            < JWKS_FORCED_REFRESH_COOLDOWN_SECONDS
        ):
            raise _JWKSUnavailable

        try:
            signing_keys = _load_signing_keys(client, refresh=False)
        except _JWKSUnavailable:
            state.last_cached_load_failure_at = time.monotonic()
            raise
        state.last_cached_load_failure_at = None

        matching_key = _matching_key(signing_keys, key_id)
        if matching_key is not None:
            return matching_key

        now = time.monotonic()
        if (
            state.last_forced_refresh_at is not None
            and now - state.last_forced_refresh_at
            < JWKS_FORCED_REFRESH_COOLDOWN_SECONDS
        ):
            if state.last_forced_refresh_failed:
                raise _JWKSUnavailable
            raise _InvalidAuthenticationToken

        try:
            signing_keys = _load_signing_keys(client, refresh=True)
        except _JWKSUnavailable:
            state.last_forced_refresh_at = time.monotonic()
            state.last_forced_refresh_failed = True
            raise
        state.last_forced_refresh_at = time.monotonic()
        state.last_forced_refresh_failed = False

        matching_key = _matching_key(signing_keys, key_id)
        if matching_key is None:
            raise _InvalidAuthenticationToken
        return matching_key


def _validated_identity(claims: dict[str, object]) -> AuthenticatedUser:
    if claims.get("role") != JWT_AUDIENCE:
        raise InvalidTokenError("Unexpected token role.")
    if not isinstance(claims.get("is_anonymous"), bool):
        raise InvalidTokenError("Invalid anonymous-user claim.")

    try:
        user_id = UUID(str(claims["sub"]))
        session_id = UUID(str(claims["session_id"]))
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        raise InvalidTokenError("Invalid token identity.") from exc

    return AuthenticatedUser(
        user_id=user_id,
        session_id=session_id,
        is_anonymous=claims["is_anonymous"],
    )


async def require_authenticated_user(request: Request) -> AuthenticatedUser:
    token = _bearer_token(request)
    try:
        settings = _settings()
    except _AuthConfigurationError as exc:
        raise _unavailable() from exc

    try:
        signing_key = await asyncio.to_thread(
            _get_signing_key,
            settings.jwks_url,
            token,
        )
    except _JWKSUnavailable as exc:
        raise _unavailable() from exc
    except _InvalidAuthenticationToken as exc:
        raise _unauthorized() from exc

    try:
        claims = jwt.decode(
            token,
            signing_key,
            algorithms=JWT_ALGORITHMS,
            audience=JWT_AUDIENCE,
            issuer=settings.issuer,
            options={"require": REQUIRED_CLAIMS},
        )
        return _validated_identity(claims)
    except InvalidTokenError as exc:
        raise _unauthorized() from exc
