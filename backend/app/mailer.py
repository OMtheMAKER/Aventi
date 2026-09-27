"""Optional outbound email for the platform.

Offline-first by default: if no SMTP_HOST is configured, send_email() is a
no-op and the app keeps its demo behaviour (verification codes are surfaced
inline). To enable real delivery set:

  SMTP_HOST       e.g. smtp.gmail.com
  SMTP_PORT       default 587
  SMTP_USER       account/login user
  SMTP_PASSWORD   app password
  SMTP_FROM       optional From: header (defaults to SMTP_USER)
  SMTP_STARTTLS   "1" (default) or "0"
"""
import os
import smtplib
import ssl
from email.message import EmailMessage


def smtp_configured() -> bool:
    return bool(os.environ.get("SMTP_HOST"))


def send_email(to: str, subject: str, body: str) -> bool:
    """Best-effort single-recipient mail. Returns True when delivered to the
    relay, False when SMTP is not configured or the relay rejected us — the
    caller then falls back to the offline demo path, so nothing ever breaks."""
    host = os.environ.get("SMTP_HOST")
    if not host:
        return False
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASSWORD")
    sender = os.environ.get("SMTP_FROM") or user or "aventi@localhost"

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            if os.environ.get("SMTP_STARTTLS", "1") == "1":
                smtp.starttls(context=ssl.create_default_context())
            if user:
                smtp.login(user, password or "")
            smtp.send_message(msg)
        return True
    except Exception:
        return False
