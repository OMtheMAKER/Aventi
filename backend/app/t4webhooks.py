"""T4 outbound webhooks: fire-and-forget dispatch with HMAC signature and a
delivery log the organiser can read in the UI.

Self-hosted friendly: delivery runs on a background thread (no Celery/Redis);
the API request that triggered it returns immediately. Payloads are JSON with
a standard envelope, signed X-Platform-Signature: sha256=<hex-hmac>.
"""
import hashlib
import hmac
import json
import logging
import threading
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from app import models
from app.db import SessionLocal

log = logging.getLogger("webhooks")

# every event type the UI (and thus the API) can trigger
EVENT_TYPES = [
    "registration.created",
    "submission.created",
    "submission.submitted",
    "vote.cast",
    "score.created",
    "results.published",
    "results.final",
    "certificate.issued",
    "ping",  # organiser "send test" button
]


def _sign(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _deliver(webhook_id: int, event_type: str, payload: dict, attempt_cap: int = 2):
    """Worker: POST the payload with signature headers, log every attempt.
    Runs on a daemon thread — failures never bubble into the request flow."""
    db = SessionLocal()
    try:
        wh = db.query(models.Webhook).get(webhook_id)
        if not wh or not wh.active:
            return
        envelope = {
            "event": event_type,
            "delivered_at": datetime.utcnow().isoformat() + "Z",
            "data": payload,
        }
        body = json.dumps(envelope, default=str).encode()
        headers = {
            "Content-Type": "application/json",
            "X-Platform-Event": event_type,
            "X-Platform-Signature": _sign(wh.secret, body),
            "User-Agent": "hackathon-raptors-webhooks/1.0",
        }
        status, excerpt, ok = None, "", 0
        attempts = 0
        while attempts < attempt_cap:
            attempts += 1
            try:
                with httpx.Client(timeout=8, follow_redirects=False) as cli:
                    r = cli.post(wh.url, content=body, headers=headers)
                    status, excerpt, ok = r.status_code, (r.text or "")[:500], 200 <= r.status_code < 300
                    if ok:
                        break
            except Exception as e:  # network down, DNS, refusing… — log and retry once
                log.info("webhook %d attempt %d failed: %s", webhook_id, attempts, e)
                excerpt = f"{type(e).__name__}: {e}"[:500]
        db.add(
            models.WebhookDelivery(
                webhook_id=wh.id, event_type=event_type, payload=envelope,
                status_code=status, response_excerpt=excerpt,
                attempts=attempts, ok=1 if ok else 0,
            )
        )
        db.commit()
    finally:
        db.close()


def fire(db: Session, event_id: int, event_type: str, payload: dict, audit=None):
    """Call from any router after a state change the UI exposes. Spawns one
    daemon thread per subscribed webhook. `audit` writes to audit_log too,
    so the trail is visible even if deliveries fail."""
    hooks = (
        db.query(models.Webhook)
        .filter_by(event_id=event_id, active=1)
        .all()
    )
    if not hooks:
        return 0
    n = 0
    for wh in hooks:
        if wh.events and event_type not in wh.events:
            continue
        t = threading.Thread(target=_deliver, args=(wh.id, event_type, payload), daemon=True)
        t.start()
        n += 1
    if audit and n:
        audit(db, event_id, "system", "webhook.fired",
              f"{event_type} → {n} webhook(s)", {"type": event_type})
    return n
