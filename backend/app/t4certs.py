"""T4 certificates: printable + publicly verifiable (no login) with an
HMAC-signed canonical payload. The `signature` string is what makes a judge's
participation record independently checkable — the verifier recomputes it.

cert_code is a random short URL slug so certs can be shared/screenshotted
without leaking internals (id+participant words signed, code unguessable).
"""
import hashlib
import hmac
import json
import secrets

# Persisted on disk so certs remain verifiable across restarts.
# Delete the file to rotate (= revoke every old cert in one move, auditable and intentional).
import os
_SECRET_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "cert_secret.key")
def _load_secret() -> str:
    os.makedirs(os.path.dirname(_SECRET_PATH), exist_ok=True)
    if os.path.exists(_SECRET_PATH):
        return open(_SECRET_PATH).read().strip()
    val = secrets.token_hex(32)
    with open(_SECRET_PATH, "w") as f:
        f.write(val)
    try:
        os.chmod(_SECRET_PATH, 0o600)
    except OSError:
        pass
    return val
CERT_SECRET = _load_secret()


def canonical(cert) -> str:
    payload = {
        "event_id": cert.event_id,
        "user_id": cert.user_id,
        "kind": cert.kind,
        "cert_code": cert.cert_code,
        "meta": cert.meta or {},
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def sign(canonical_str: str) -> str:
    return hmac.new(CERT_SECRET.encode(), canonical_str.encode(), hashlib.sha256).hexdigest()


def make_code() -> str:
    return secrets.token_urlsafe(8).replace("-", "").replace("_", "")[:10]


def cert_styles() -> str:
    return """
    <!doctype html><meta charset="utf-8">
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center;
             background: #0b1220; font-family: ui-sans-serif, system-ui, sans-serif; padding: 24px; }
      .cert { width: 880px; max-width: 100%; border: 2px solid #6366f1; border-radius: 22px;
              background: linear-gradient(160deg, #111a33, #0b1220 60%); color: #e6ecff;
              padding: 56px 64px; position: relative; overflow: hidden; }
      .cert::before { content: ""; position: absolute; inset: -40% auto auto -10%; width: 340px; height: 340px;
              background: radial-gradient(circle, #6366f140, transparent 70%); }
      .eyebrow { font-size: 12px; letter-spacing: .35em; text-transform: uppercase; color: #8ea0d8; }
      h1 { font-size: 42px; margin: 14px 0 2px; letter-spacing: -1px; }
      h2 { font-size: 20px; margin: 0 0 26px; color: #aab8e8; font-weight: 500; }
      .meta { margin-top: 30px; display: flex; gap: 26px; flex-wrap: wrap; font-size: 13px; color: #9fb0e0; }
      .meta b { color: #dfe6ff; display: block; font-size: 15px; margin-bottom: 3px; }
      .sig { margin-top: 34px; font-family: ui-monospace, monospace; font-size: 11px; color: #667;
             word-break: break-all; border-top: 1px dashed #33406b; padding-top: 18px; }
      .code { font-size: 14px; color: #aab8e8; letter-spacing: .15em; }
      .print { position: fixed; right: 18px; top: 18px; font: 600 13px system-ui; color: #cdd7ff;
               background: #202a55; border: 1px solid #46548f; padding: 8px 14px; border-radius: 10px; cursor: pointer; }
      .print:hover { background: #2a3670; }
      .seal { position: absolute; right: 46px; top: 46px; width: 88px; height: 88px; border-radius: 50%;
              border: 2px dashed #6366f1; display: grid; place-items: center; font-size: 34px; opacity: .85; }
      .winner h1 { color: #ffd76a; }
      @media print { body { background: #fff; } .cert { border-color: #334; background: #fff; color: #111; }
                     .eyebrow, .meta, h2 { color: #335; } .print { display: none; } .sig { color: #667; } }
    </style>
    """


def render_cert_page(title: str, subtitle: str, name_big: str, event_title: str,
                     detail_rows: list, signature: str, cert_code: str, kind: str, emoji: str = "🏆") -> str:
    rows = "".join(
        f'<div><b>{k}</b>{v}</div>' for k, v in detail_rows
    )
    cls = "cert winner" if kind == "winner" else "cert"
    return f"""{cert_styles()}
    <body>
    <button class="print" onclick="window.print()">⎙ Print / Save PDF</button>
    <div class="{cls}">
      <div class="seal">{emoji}</div>
      <p class="eyebrow">{title}</p>
      <h1>{name_big}</h1>
      <h2>{subtitle} <b style="color:#dfe6ff">{event_title}</b></h2>
      <div class="meta">{rows}<div><b>Certificate code</b><span class="code">{cert_code}</span></div></div>
      <p class="sig">SHA-256 HMAC signature (publicly verifiable at /api/certificates/verify/{cert_code}):<br>{signature}</p>
    </div>
    </body>"""
