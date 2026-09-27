"""T4 — Stretch tier: REST/webhooks, certificates, signed judge records,
embeddable gallery widget, bulk import/export.

Routes:
  Webhooks:   CRUD + test-ping + delivery log (organiser)
  Certs:      issue list/mine/verify(public)/print
  Widget:     /api/widget/{slug}        → iframe-ready HTML gallery
              /api/widget/{slug}.js     → document.write loader
  Bulk:       import participants.csv, export everything.json
"""
import csv
import io
import json
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app import models, schemas
from app.auth import get_current_user, get_optional_user
from app.t4webhooks import fire, EVENT_TYPES
from app.t4certs import canonical, sign, make_code, render_cert_page

router = APIRouter(tags=["t4"])


def _org(user, event_id, db):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Organizers only")
    e = db.query(models.Event).get(event_id)
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    return e


# ============================== WEBHOOKS ==============================
class WebhookIn(schemas.BaseModel):
    url: str
    events: list[str] = []          # [] = all
    description: str | None = None
    active: bool = True


class WebhookOut(schemas.BaseModel):
    id: int
    event_id: int
    url: str
    events: list
    description: schemas.Optional[str] = None
    active: int
    created_at: datetime
    model_config = schemas.ConfigDict(from_attributes=True)


def _wh_out(w: models.Webhook) -> WebhookOut:
    return WebhookOut(id=w.id, event_id=w.event_id, url=w.url,
                      events=w.events or [], description=w.description,
                      active=w.active or 0, created_at=w.created_at)


@router.get("/api/events/{event_id}/webhooks", response_model=list[WebhookOut])
def list_webhooks(event_id: int, admin=Depends(get_current_user), db: Session = Depends(get_db)):
    _org(admin, event_id, db)
    return [_wh_out(w) for w in db.query(models.Webhook).filter_by(event_id=event_id).order_by(models.Webhook.id).all()]


@router.post("/api/events/{event_id}/webhooks", response_model=WebhookOut)
def create_webhook(event_id: int, data: WebhookIn, admin=Depends(get_current_user), db: Session = Depends(get_db)):
    e = _org(admin, event_id, db)
    if not data.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="URL must start with http(s)://")
    bad = [x for x in data.events if x not in EVENT_TYPES]
    if bad:
        raise HTTPException(status_code=400, detail=f"Unknown event types: {bad}. Valid: {EVENT_TYPES}")
    w = models.Webhook(
        event_id=e.id, url=data.url, secret=secrets.token_hex(16),
        events=data.events, description=data.description, active=1 if data.active else 0,
    )
    db.add(w)
    db.commit()
    db.refresh(w)
    return _wh_out(w)


@router.patch("/api/webhooks/{hook_id}", response_model=WebhookOut)
def update_webhook(hook_id: int, data: WebhookIn, admin=Depends(get_current_user), db: Session = Depends(get_db)):
    w = db.query(models.Webhook).get(hook_id)
    if not w:
        raise HTTPException(status_code=404, detail="Webhook not found")
    _org(admin, w.event_id, db)
    w.url = data.url
    w.events = data.events
    w.description = data.description
    w.active = 1 if data.active else 0
    db.commit()
    db.refresh(w)
    return _wh_out(w)


@router.delete("/api/webhooks/{hook_id}")
def delete_webhook(hook_id: int, admin=Depends(get_current_user), db: Session = Depends(get_db)):
    w = db.query(models.Webhook).get(hook_id)
    if not w:
        raise HTTPException(status_code=404, detail="Webhook not found")
    _org(admin, w.event_id, db)
    db.query(models.WebhookDelivery).filter_by(webhook_id=hook_id).delete()
    db.delete(w)
    db.commit()
    return {"ok": True}


@router.get("/api/webhooks/{hook_id}/secret")
def webhook_secret(hook_id: int, admin=Depends(get_current_user), db: Session = Depends(get_db)):
    w = db.query(models.Webhook).get(hook_id)
    if not w:
        raise HTTPException(status_code=404, detail="Webhook not found")
    _org(admin, w.event_id, db)
    return {"secret": w.secret, "header": "X-Platform-Signature", "scheme": "sha256=<hmac-sha256 of the raw request body, keyed with this secret>"}


@router.post("/api/webhooks/{hook_id}/ping")
def ping_webhook(hook_id: int, admin=Depends(get_current_user), db: Session = Depends(get_db)):
    from app.antifraud import audit
    w = db.query(models.Webhook).get(hook_id)
    if not w:
        raise HTTPException(status_code=404, detail="Webhook not found")
    _org(admin, w.event_id, db)
    n = fire(db, w.event_id, "ping", {"ping": True, "hook_id": hook_id, "by": admin.email}, audit)
    return {"ok": True, "fired": n}


@router.get("/api/webhooks/{hook_id}/deliveries")
def webhook_deliveries(hook_id: int, limit: int = 50, admin=Depends(get_current_user), db: Session = Depends(get_db)):
    w = db.query(models.Webhook).get(hook_id)
    if not w:
        raise HTTPException(status_code=404, detail="Webhook not found")
    _org(admin, w.event_id, db)
    rows = (
        db.query(models.WebhookDelivery).filter_by(webhook_id=hook_id)
        .order_by(models.WebhookDelivery.id.desc()).limit(min(limit, 200)).all()
    )
    return [
        {"id": r.id, "event_type": r.event_type, "status_code": r.status_code,
         "attempts": r.attempts, "ok": r.ok, "response_excerpt": r.response_excerpt,
         "created_at": r.created_at}
        for r in rows
    ]


@router.get("/api/webhooks/event-types")
def webhook_event_types():
    return {"event_types": EVENT_TYPES}


# ============================== CERTIFICATES ==============================
def _issue(db: Session, event: models.Event, user: models.User, kind: str, meta: dict) -> models.Certificate:
    existing = (
        db.query(models.Certificate)
        .filter_by(event_id=event.id, user_id=user.id, kind=kind, revoked=0)
        .first()
    )
    if existing:
        return existing
    cert = models.Certificate(
        event_id=event.id, user_id=user.id, kind=kind,
        cert_code=make_code(), meta=meta, signature="", revoked=0,
    )
    cert.signature = sign(canonical(cert))
    db.add(cert)
    db.commit()
    db.refresh(cert)
    return cert


@router.post("/api/events/{event_id}/issue-certificates")
def issue_certificates(
    event_id: int,
    kind: str = "participation",      # participation | winner | judge
    top_n: int = 3,                   # winners only
    admin=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Organizer bulk-issues certificates of one kind for the event."""
    from app.antifraud import audit
    from app.routers.judging import normalized_leaderboard
    event = _org(admin, event_id, db)
    if kind not in ("participation", "winner", "judge"):
        raise HTTPException(status_code=400, detail="kind ∈ participation|winner|judge")

    issued = 0
    if kind == "participation":
        regs = db.query(models.Registration).filter_by(event_id=event_id).all()
        for r in regs:
            u = db.query(models.User).get(r.user_id)
            cert = _issue(db, event, u, "participation", {
                "name": r.name, "event": event.title,
                "event_dates": f"{event.start_date.date()} → {event.end_date.date()}",
                "role": "Participant",
            })
            issued += 1 if cert else 0
    elif kind == "judge":
        judges = {a.judge_id for a in db.query(models.JudgeAssignment).filter_by(event_id=event_id).all()}
        for jid in judges:
            u = db.query(models.User).get(jid)
            if not u:
                continue
            n_assign = db.query(models.JudgeAssignment).filter_by(event_id=event_id, judge_id=jid).count()
            n_scored = db.query(models.Score).filter(models.Score.judge_id == jid).count()
            _issue(db, event, u, "judge", {
                "name": u.name, "event": event.title, "role": "Judge",
                "assignments": n_assign, "scored": n_scored,
                "event_dates": f"{event.start_date.date()} → {event.end_date.date()}",
            })
            issued += 1
    else:  # winners via normalized leaderboard (top_n teams with submissions)
        lb = normalized_leaderboard(db, event_id)
        seen_users, seen_teams = [], set()
        for row in lb[: top_n]:
            sub = db.query(models.Submission).get(row["submission_id"])
            if not sub or sub.team_id in seen_teams:
                continue
            seen_teams.add(sub.team_id)
            team = db.query(models.Team).get(sub.team_id)
            members = (
                db.query(models.Registration)
                .join(models.TeamMember, models.TeamMember.registration_id == models.Registration.id)
                .filter(models.TeamMember.team_id == sub.team_id).all()
            )
            place = len(seen_teams)
            for reg in members:
                u = db.query(models.User).get(reg.user_id)
                _issue(db, event, u, "winner", {
                    "name": reg.name, "event": event.title, "role": f"Winner #{place}",
                    "project": sub.title, "team": team.name if team else None,
                    "score_z": row.get("avg_normalized"), "score_raw": row.get("avg_raw"),
                })
                issued += 1
    audit(db, event_id, f"u:{admin.id}", "cert.issue", f"issued {issued} × {kind} certificates")
    fire(db, event_id, "certificate.issued", {"kind": kind, "count": issued}, audit)
    return {"ok": True, "kind": kind, "issued": issued}


@router.get("/api/certificates/mine")
def my_certificates(user=Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(models.Certificate).filter_by(user_id=user.id, revoked=0).order_by(models.Certificate.id.desc()).all()
    events = {e.id: e for e in db.query(models.Event).all()}
    return [
        {
            "id": c.id, "event_id": c.event_id, "event_title": events.get(c.event_id).title if c.event_id in events else None,
            "kind": c.kind, "cert_code": c.cert_code, "meta": c.meta,
            "created_at": c.created_at, "print_url": f"/api/certificates/{c.cert_code}/print",
        }
        for c in rows
    ]


@router.get("/api/certificates/verify/{cert_code}")
def verify_certificate(cert_code: str, db: Session = Depends(get_db)):
    """PUBLIC — anyone holding the code checks validity & signature, no login."""
    c = db.query(models.Certificate).filter_by(cert_code=cert_code).first()
    if not c:
        return {"valid": False, "reason": "No such certificate"}
    if c.revoked:
        return {"valid": False, "reason": "Revoked"}
    recompute = sign(canonical(c))
    sig_ok = recompute == c.signature
    e = db.query(models.Event).get(c.event_id)
    u = db.query(models.User).get(c.user_id)
    return {
        "valid": sig_ok,
        "reason": None if sig_ok else "Signature mismatch — forged or tampered",
        "event": e.title if e else None,
        "kind": c.kind,
        "holder": (c.meta or {}).get("name") or (u.name if u else None),
        "issued_at": c.created_at,
        "detail": c.meta,
    }


@router.get("/api/certificates/{cert_code}/print", response_class=HTMLResponse)
def print_certificate(cert_code: str, db: Session = Depends(get_db)):
    """Printable certificate (works in browser, Ctrl+P → PDF)."""
    c = db.query(models.Certificate).filter_by(cert_code=cert_code).first()
    if not c or c.revoked:
        raise HTTPException(status_code=404, detail="Certificate not found")
    e = db.query(models.Event).get(c.event_id)
    m = c.meta or {}
    emoji = "🏆" if c.kind == "winner" else ("⚖️" if c.kind == "judge" else "🎖️")
    title = {"participation": "Certificate of Participation", "winner": "Certificate of Achievement", "judge": "Judge Participation Record"}[c.kind]
    subtitle = {
        "participation": "is recognized for participating in",
        "winner": f"is awarded <b>{m.get('role','Winner')}</b> at",
        "judge": "served as an official <b>judge</b> at",
    }[c.kind]
    rows = [
        ("Event", e.title if e else "—"),
        ("Dates", m.get("event_dates", "—")),
    ]
    if c.kind in ("winner",):
        rows += [("Project", m.get("project", "—")), ("Team", m.get("team", "—"))]
    if c.kind == "judge":
        rows += [("Assignments", str(m.get("assignments", "—"))), ("Scored", str(m.get("scored", "—")))]
    return HTMLResponse(render_cert_page(
        title=title, subtitle=subtitle, name_big=m.get("name", "—"),
        event_title=e.title if e else "", detail_rows=rows,
        signature=c.signature, cert_code=c.cert_code, kind=c.kind, emoji=emoji,
    ))


# ============================== EMBED WIDGET ==============================
def _widget_html(event: models.Event, cards: list, base: str) -> str:
    def esc(x):
        return (x or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    items = []
    for c in cards:
        thumb = (
            f'<img src="{base}/api/submissions/{c.id}/thumbnail" alt="">'
            if c.has_thumbnail else
            '<div class="thumb ph"></div>'
        )
        items.append(f"""
        <a class="card" href="{base}/event/{esc(event.slug)}/gallery" target="_blank" rel="noopener">
          <div class="thumb">{thumb}</div>
          <div class="body">
            <h3>{esc(c.title)}</h3>
            <p class="tag">{esc(c.tagline)}</p>
            <p class="team">{esc(c.team_name)}</p>
          </div>
        </a>""")
    cards_html = "".join(items) or '<p class="empty">No submitted projects yet.</p>'
    return f"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * {{ box-sizing: border-box; margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; }}
  body {{ background: #0b1220; color: #e6ecff; padding: 12px; }}
  .brand {{ display:flex; justify-content:space-between; align-items:baseline; margin-bottom: 10px; }}
  .brand h2 {{ font-size: 14px; letter-spacing: .2em; text-transform: uppercase; color: #8ea0d8; }}
  .brand a {{ font-size: 12px; color: #aab8e8; text-decoration: none; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }}
  .card {{ display: block; text-decoration: none; color: inherit; background: #111a33; border: 1px solid #27335f;
           border-radius: 12px; overflow: hidden; transition: .15s; }}
  .card:hover {{ transform: translateY(-2px); border-color: #6366f1; }}
  .thumb {{ height: 96px; background: linear-gradient(120deg, #6366f1, #9333ea); overflow: hidden; }}
  .thumb img {{ width: 100%; height: 100%; object-fit: cover; display: block; }}
  .thumb.ph {{ height: 96px; }}
  .body {{ padding: 10px 12px; }}
  h3 {{ font-size: 14px; margin-bottom: 2px; }}
  .tag {{ font-size: 11px; color: #aab8e8; font-style: italic; margin-bottom: 5px; }}
  .team {{ font-size: 10px; color: #66719f; }}
  .empty {{ color: #66719f; font-size: 12px; padding: 18px; text-align: center; }}
  .foot {{ margin-top: 10px; text-align: right; }}
  .foot a {{ font-size: 11px; color: #66719f; text-decoration: none; letter-spacing: .1em; }}
</style></head><body>
<div class="brand"><h2>🖼 {esc(event.title)} — Project Gallery</h2>
<a href="{base}/event/{esc(event.slug)}/gallery" target="_blank" rel="noopener">Open full gallery →</a></div>
<div class="grid">{cards_html}</div>
<p class="foot"><a href="{base}" target="_blank" rel="noopener">powered by Aventi platform</a></p>
</body></html>"""


@router.get("/api/widget/{slug}.js")
def widget_loader(slug: str, db: Session = Depends(get_db)):
    """Loader script: `dangerous` but simplest possible embed —
    <script src=".../widget/{slug}.js" async></script> → writes an iframe."""
    e = db.query(models.Event).filter(models.Event.slug == slug).first()
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    js = (
        "(function(){var s=document.currentScript;var u=s.src.substring(0,s.src.lastIndexOf('/'));"
        "var f=document.createElement('iframe');f.src=u.replace(/\\.js$/,"");"
        "f.style.cssText='width:100%;min-height:340px;border:0;border-radius:12px';"
        "f.setAttribute('title','Project gallery');s.parentNode.insertBefore(f,s);})();"
    )
    return Response(content=js, media_type="application/javascript")


@router.get("/api/widget/{slug}", response_class=HTMLResponse)
def widget_page(slug: str, db: Session = Depends(get_db)):
    """Iframe-embeddable gallery — no login. Only *submitted* projects."""
    e = db.query(models.Event).filter(models.Event.slug == slug).first()
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    subs = (
        db.query(models.Submission).filter_by(event_id=e.id, status="submitted")
        .order_by(models.Submission.submitted_at.desc()).all()
    )
    teams = {t.id: t for t in db.query(models.Team).filter_by(event_id=e.id).all()}
    import os as _os
    cards = []
    for s in subs:
        t = teams.get(s.team_id)
        cards.append(type("C", (), {
            "id": s.id, "title": s.title, "tagline": s.tagline,
            "team_name": t.name if t else "Team",
            "has_thumbnail": bool(s.thumbnail_path and _os.path.exists(s.thumbnail_path)),
        })())
    # base = scheme+host+port of this very request — embeds work from any viewer host
    from fastapi import Request as _Req  # noqa — resolved via injection below instead
    return HTMLResponse(_widget_html(e, cards, ""))  # base injected by caller wrapper




@router.get("/api/widget")
def widget_help():
    return {
        "usage": "<script src=\"/api/widget/{slug}.js\" async></script>  — or —  <iframe src=\"/api/widget/{slug}\"></iframe>",
        "note": "No login needed; shows submitted projects for the event only.",
    }


# ============================== BULK IMPORT ==============================
@router.post("/api/admin/import/participants/{event_id}")
async def import_participants(
    event_id: int,
    file: UploadFile = File(...),
    create_accounts: bool = True,
    admin=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """CSV columns: name, email[, team_name] — header row required.
    Creates (if missing) a login account with email-domain default password,
    a registration, and team assignment when team_name collides/creates."""
    from app.antifraud import audit
    from app.auth import hash_password
    e = _org(admin, event_id, db)
    raw = (await file.read()).decode("utf-8-sig", errors="replace")
    rows = list(csv.DictReader(io.StringIO(raw)))
    if not rows:
        raise HTTPException(status_code=400, detail="Empty CSV (need headers: name,email[,team_name])")
    if "name" not in rows[0] or "email" not in rows[0]:
        raise HTTPException(status_code=400, detail="CSV must have name and email columns")

    created_users = created_regs = 0
    skipped = []
    for i, row in enumerate(rows, 2):
        name = (row.get("name") or "").strip()
        email = (row.get("email") or "").strip().lower()
        team_name = (row.get("team_name") or "").strip()
        if not name or not email or "@" not in email:
            skipped.append({"row": i, "why": "missing name/email", "email": email})
            continue
        u = db.query(models.User).filter(models.User.email == email).first()
        if not u:
            if not create_accounts:
                skipped.append({"row": i, "why": "no account", "email": email})
                continue
            u = models.User(email=email, name=name, hashed_password=hash_password("welcome123"), role="user")
            db.add(u)
            db.commit()
            db.refresh(u)
            created_users += 1
        if db.query(models.Registration).filter_by(event_id=event_id, user_id=u.id).first():
            skipped.append({"row": i, "why": "already registered", "email": email})
            continue
        team_id = None
        if team_name:
            t = db.query(models.Team).filter_by(event_id=event_id, name=team_name).first()
            if not t:
                from app.routers.admin import gen_code
                t = models.Team(event_id=event_id, name=team_name, tagline="", avatar_url="⚡",
                                is_open=1, max_members=e.max_team_size or 4,
                                invite_code=gen_code(), created_by=u.id)
                db.add(t)
                db.commit()
            team_id = t.id
        reg = models.Registration(event_id=event_id, user_id=u.id, name=name, email=email, team_id=team_id)
        db.add(reg)
        db.commit()
        if team_id:
            db.add(models.TeamMember(team_id=team_id, registration_id=reg.id))
            t_obj = db.query(models.Team).get(team_id)
            if t_obj and not t_obj.invite_code:
                t_obj.invite_code = gen_code()
            db.commit()
        created_regs += 1
    audit(db, event_id, f"u:{admin.id}", "import.participants",
          f"imported {created_regs} registrations, {created_users} new accounts, {len(skipped)} skipped")
    return {"ok": True, "registrations_created": created_regs, "accounts_created": created_users, "skipped": skipped}


# ============================== SUPER EXPORT ==============================
@router.get("/api/admin/export/event/{event_id}.json")
def export_full_event(event_id: int, admin=Depends(get_current_user), db: Session = Depends(get_db)):
    """One JSON hand-off: EVERYTHING about the event. Spec: 'bulk import and
    export so an organizer can leave as easily as they arrived'."""
    _org(admin, event_id, db)
    e = db.query(models.Event).get(event_id)
    teams = db.query(models.Team).filter_by(event_id=event_id).all()
    regs = db.query(models.Registration).filter_by(event_id=event_id).all()
    subs = db.query(models.Submission).filter_by(event_id=event_id).all()
    sub_ids = [s.id for s in subs]
    scores = db.query(models.Score).filter(models.Score.submission_id.in_(sub_ids)).all() if sub_ids else []
    assigns = db.query(models.JudgeAssignment).filter_by(event_id=event_id).all()
    allocs = db.query(models.VoteAllocation).filter_by(event_id=event_id).all()
    comments = db.query(models.Comment).filter(models.Comment.submission_id.in_(sub_ids)).all() if sub_ids else []
    audit_rows = db.query(models.AuditLog).filter_by(event_id=event_id).all()
    certs = db.query(models.Certificate).filter_by(event_id=event_id).all()
    users_by_id = {u.id: u.email for u in db.query(models.User).all()}

    def dt(x): return x.isoformat() if x else None
    dump = {
        "format": "hackathon-raptors/v1",
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "event": {
            "id": e.id, "slug": e.slug, "title": e.title, "tagline": e.tagline,
            "description": e.description, "about": e.about, "rules": e.rules, "rounds": e.rounds,
            "eligibility": e.eligibility, "judging_criteria": e.judging_criteria,
            "start_date": dt(e.start_date), "end_date": dt(e.end_date),
            "registration_deadline": dt(e.registration_deadline),
            "min_team_size": e.min_team_size, "max_team_size": e.max_team_size,
            "mode": e.mode, "location": e.location, "prize_pool": e.prize_pool,
            "tracks": e.tracks, "form_fields": e.form_fields,
            "submission_questions": e.submission_questions, "rubric": e.rubric,
            "vote_access": e.vote_access, "vote_mode": e.vote_mode,
            "max_picks": e.max_picks, "vote_credits": e.vote_credits,
            "voting_open_at": dt(e.voting_open_at), "voting_close_at": dt(e.voting_close_at),
            "results_published": e.results_published,
        },
        "teams": [{"id": t.id, "name": t.name, "tagline": t.tagline, "invite_code": t.invite_code,
                   "avatar_url": t.avatar_url, "max_members": t.max_members, "created_at": dt(t.created_at)} for t in teams],
        "registrations": [{"id": r.id, "user": users_by_id.get(r.user_id), "name": r.name, "email": r.email,
                           "team_id": r.team_id, "team_code": r.team_code,
                           "institution": r.institution, "created_at": dt(r.created_at)} for r in regs],
        "submissions": [{
            "id": s.id, "team_id": s.team_id, "title": s.title, "tagline": s.tagline,
            "description": s.description, "repo_url": s.repo_url, "demo_video_url": s.demo_video_url,
            "live_url": s.live_url, "tech_stack": s.tech_stack, "track": s.track,
            "extra_links": s.extra_links, "custom_answers": s.custom_answers,
            "status": s.status, "submitted_at": dt(s.submitted_at),
        } for s in subs],
        "judge_assignments": [{"judge": users_by_id.get(a.judge_id), "submission_id": a.submission_id} for a in assigns],
        "scores": [{"judge": users_by_id.get(sc.judge_id), "submission_id": sc.submission_id,
                    "breakdown": sc.breakdown, "rubric_snapshot": sc.rubric_snapshot,
                    "comment": sc.comment, "created_at": dt(sc.created_at)} for sc in scores],
        "votes": [{"voter_key": a.voter_key, "submission_id": a.submission_id, "votes": a.votes,
                   "created_at": dt(a.created_at)} for a in allocs],
        "comments": [{"user": users_by_id.get(c.user_id), "submission_id": c.submission_id,
                      "body": c.body, "removed": c.removed, "created_at": dt(c.created_at)} for c in comments],
        "certificates": [{"kind": c.kind, "cert_code": c.cert_code, "meta": c.meta,
                          "revoked": c.revoked, "created_at": dt(c.created_at)} for c in certs],
        "audit_log": [{"actor": a.actor_key, "action": a.action, "detail": a.detail, "created_at": dt(a.created_at)} for a in audit_rows],
    }
    return Response(
        content=json.dumps(dump, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=event-{event_id}-full-export.json"},
    )
