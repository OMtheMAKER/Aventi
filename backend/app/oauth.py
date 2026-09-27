"""OAuth handshakes (Google / Discord / GitHub) — opt-in via environment.

Design contract:
  • Default dogfood mode = fully self-hosted/offline → social buttons run a
    LOCAL demo flow (`/api/auth/social`) and the UI labels them as demo.
  • Set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (and the DISCORD_/GITHUB_
    equivalents) → `GET /api/auth/oauth/{provider}/start` switches to
    `mode=redirect` and hands the REAL provider authorize URL, so the actual
    Google/Discord/GitHub account chooser opens.
  • Callback verifies an HMAC-signed `state`, exchanges the code via stdlib
    urllib, fetches the profile, upserts the user, and bounces back to the SPA
    with `#tk=<jwt>` in the URL fragment (never sent to servers; the SPA saves
    it to localStorage exactly like a normal login).

This keeps the "no external services required" spec promise while letting a
real deployment do a correct OAuth2 dance — no magic SDK, all auditable here.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import time
import urllib.parse
import urllib.request
from typing import Optional

# signed state: short-lived, tamper-proof, replayable only within TTL
STATE_TTL_S = 10 * 60
_pending_states: dict[str, float] = {}  # sig → exp (process-local; OK for demo)

BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
FRONT_URL = os.getenv("FRONT_URL", "/")  # callback redirect target (SPA)
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-key")

def _key(name: str, *parts: str) -> str:
    env = os.getenv(name)
    if env:
        return env
    return f"PROVIDERS_{'_'.join(parts)}"  # fallback error string (never printed)


PROVIDERS = {
    "google": {
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "userinfo_url": "https://openidconnect.googleapis.com/v1/userinfo",
        "client_id_env": "GOOGLE_CLIENT_ID",
        "client_secret_env": "GOOGLE_CLIENT_SECRET",
        "scope": "openid email profile",
        "email_field": "email",
        "name_field": "name",
    },
    "discord": {
        "auth_url": "https://discord.com/oauth2/authorize",
        "token_url": "https://discord.com/api/oauth2/token",
        "userinfo_url": "https://discord.com/api/users/@me",
        "client_id_env": "DISCORD_CLIENT_ID",
        "client_secret_env": "DISCORD_CLIENT_SECRET",
        "scope": "identify email",
        "email_field": "email",
        "name_field": "global_name",   # fallback → username
    },
    "github": {
        "auth_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "userinfo_url": "https://api.github.com/user",
        "client_id_env": "GITHUB_CLIENT_ID",
        "client_secret_env": "GITHUB_CLIENT_SECRET",
        "scope": "read:user user:email",
        "email_field": "email",
        "name_field": "name",          # fallback → login
    },
}


def configured(provider: str) -> bool:
    cfg = PROVIDERS.get(provider)
    if not cfg:
        return False
    return bool(os.getenv(cfg["client_id_env"]) and os.getenv(cfg["client_secret_env"]))


def state_make(provider: str) -> str:
    nonce = secrets.token_urlsafe(16)
    payload = f"{provider}.{nonce}.{int(time.time())}"
    sig = hmac.new(JWT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    _pending_states[sig] = time.time() + STATE_TTL_S
    # garbage-collect expired
    now = time.time()
    for s, exp in list(_pending_states.items()):
        if exp < now:
            _pending_states.pop(s, None)
    return f"{payload}.{sig}"


def state_verify(provider: str, state: str) -> bool:
    try:
        p, nonce, ts, sig = state.split(".")
    except ValueError:
        return False
    if p != provider:
        return False
    payload = f"{p}.{nonce}.{ts}"
    expect = hmac.new(JWT_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(expect, sig):
        return False
    exp = _pending_states.pop(sig, None)
    if exp is None or exp < time.time():
        return False
    return True


def authorize_url(provider: str, state: str) -> str:
    cfg = PROVIDERS[provider]
    redirect = f"{BASE_URL}/api/auth/oauth/{provider}/callback"
    q = {
        "client_id": os.environ[cfg["client_id_env"]],
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": cfg["scope"],
        "state": state,
    }
    return f"{cfg['auth_url']}?{urllib.parse.urlencode(q)}"


def _http_form(url: str, data: dict, headers: Optional[dict] = None) -> dict:
    req = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(data).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded",
                 "Accept": "application/json",
                 **(headers or {})},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def _http_json(url: str, headers: Optional[dict] = None) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def exchange_and_profile(provider: str, code: str) -> dict:
    """code → access_token → userinfo → normalized {email, name, provider}."""
    cfg = PROVIDERS[provider]
    redirect = f"{BASE_URL}/api/auth/oauth/{provider}/callback"
    tok = _http_form(cfg["token_url"], {
        "client_id": os.environ[cfg["client_id_env"]],
        "client_secret": os.environ[cfg["client_secret_env"]],
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect,
    }, headers={"Accept": "application/json"})
    access = tok.get("access_token")
    if not access:
        raise ValueError(f"token exchange failed: {tok}")
    prof = _http_json(cfg["userinfo_url"], {"Authorization": f"Bearer {access}"})

    email = prof.get(cfg["email_field"])
    if provider == "github" and not email:
        try:
            emails = _http_json("https://api.github.com/user/emails",
                                {"Authorization": f"Bearer {access}"})
            primary = [e for e in emails if e.get("primary") and e.get("verified")]
            email = (primary or emails)[0]["email"] if emails else None
        except Exception:
            pass
    name = prof.get(cfg["name_field"]) or prof.get("username") or prof.get("login") \
        or (email or "").split("@")[0] or f"{provider} user"
    if not email:
        raise ValueError("provider returned no email — enable email scope/verify on your account")
    return {"email": email.lower(), "name": name, "provider": provider}


def guard_expand(code: str) -> str:
    """Spawn a short link fragment for callback."""
    return f"#tk={urllib.parse.quote(code)}"
