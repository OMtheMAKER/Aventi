"""T3 anti-abuse toolkit: rate limiting, identity normalisation, audit log.

Self-hosted/offline first — everything is in-process (no Redis required at
this scale; one organiser box runs one API process). Documented in JUDGING.md.
"""
import hashlib
import re
import secrets
import threading
import time
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app import models

# ---------------------------------------------------------------------------
# Rate limiting — sliding-window counter, per key.
# ---------------------------------------------------------------------------
_windows: dict = {}
_lock = threading.Lock()

# generous ceilings: (requests, window_seconds)
LIMITS = {
    "vote": (30, 60),          # 30 ballot writes / minute / identity
    "comment": (6, 60),        # 6 comments / minute / user
    "verify": (6, 300),        # 6 verification-code requests / 5 min / email
    "verify_confirm": (10, 300),  # attempts against brute force on the code
    "open_identity": (20, 3600),  # new open-mode identities per IP / hour (used on raw ip)
    "results": (60, 60),       # results polling
}


class RateLimited(Exception):
    def __init__(self, bucket: str, retry_after: int):
        self.bucket = bucket
        self.retry_after = retry_after
        super().__init__(f"Rate limit exceeded for {bucket}")


def rate_limit(bucket: str, key: str):
    """Raise RateLimited if `key` exceeds bucket policy. key should already be
    fairly unique (e.g. 'vote:u:12:evt:3')."""
    max_n, win = LIMITS[bucket]
    now = time.monotonic()
    k = f"{bucket}:{key}"
    with _lock:
        hist = _windows.get(k, [])
        hist = [t for t in hist if now - t < win]
        if len(hist) >= max_n:
            retry = int(win - (now - hist[0])) + 1
            _windows[k] = hist
            raise RateLimited(bucket, retry)
        hist.append(now)
        _windows[k] = hist


# ---------------------------------------------------------------------------
# Identity normalisation
# ---------------------------------------------------------------------------
_IP_SALT = secrets.token_hex(16)  # random per process start — IP hashes aren't stable across restarts, by design


def ip_fingerprint(ip: str, user_agent: str) -> str:
    """Best-effort open-mode identity: one-way hash of ip+ua. We never store
    raw IPs (GDPR-hygienic), and the per-process salt means hashes can't be
    correlated across deployments or restarts."""
    raw = f"{ip.strip().lower()}|{(user_agent or '')[:128]}|{_IP_SALT}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


_GMAIL_HOSTS = {"gmail.com", "googlemail.com"}
_PLUS_ALIASED = re.compile(r"^[^@]+@([^@]+)$")


def normalize_email(raw: str) -> str:
    """Canonicalise so one human can't easily farm multiple ballots:
    lower-case, strip +label suffixes everywhere, strip dots for Gmail."""
    e = (raw or "").strip().lower()
    if not _PLUS_ALIASED.match(e) or ".." in e:
        return e  # let schema validation elsewhere reject malformed input
    local, host = e.rsplit("@", 1)
    local = local.split("+", 1)[0]
    if host in _GMAIL_HOSTS:
        local = local.replace(".", "")
        host = "gmail.com"
    return f"{local}@{host}"


def hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().lower().encode()).hexdigest()


def make_code(n: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(n))


# ---------------------------------------------------------------------------
# Audit trail — every mutating T3 action appends a row the organiser can read
# from the UI (no DB client needed).
# ---------------------------------------------------------------------------
def audit(db: Session, event_id, actor_key: str, action: str, detail: str = "", meta: dict = None):
    db.add(
        models.AuditLog(
            event_id=event_id,
            actor_key=actor_key,
            action=action,
            detail=detail,
            meta=meta,
            created_at=datetime.utcnow(),
        )
    )
    db.commit()


def flag_abuse(db: Session, event_id, actor_key: str, why: str, meta: dict = None):
    audit(db, event_id, actor_key, "abuse.flag", why, meta)
