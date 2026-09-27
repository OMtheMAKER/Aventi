"""Event community chat ("Lounge") — two channels per event:

  • general  — every REGISTERED participant posts; any team, all together
  • announce — organizers/admins/event-judges post; everyone reads + reacts

Moderation: rate limits, reporter flag, mod soft-delete (audit-kept),
per-event chat ban. Every moderating action lands in the existing
audit_log so the organizer reads it without a DB client (T3 invariant #6).
"""
import asyncio
import json
import datetime
from collections import defaultdict

from fastapi import APIRouter, WebSocket, Depends, HTTPException
from pydantic import BaseModel

from app.db import get_db
from app import models
from app.auth import get_current_user
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/chat", tags=["chat"])

# ---------------- live push: WebSocket hub (polling stays as fallback) -------------
# The socket never carries message content — it only POKES clients ("new message"),
# and each client refetches over REST with its own auth. Role-based visibility
# therefore stays enforced by the REST layer alone.
_WS_LOOP = None
_WS_CLIENTS: dict[int, set] = {}


@router.websocket("/ws/{event_id}")
async def chat_live_socket(websocket: WebSocket, event_id: int):
    global _WS_LOOP
    _WS_LOOP = asyncio.get_running_loop()
    await websocket.accept()
    _WS_CLIENTS.setdefault(event_id, set()).add(websocket)
    try:
        while True:
            await websocket.receive_text()  # client pings/keepalive; nothing else expected
    except Exception:
        pass
    finally:
        _WS_CLIENTS.get(event_id, set()).discard(websocket)


def _push(event_id: int, payload: dict):
    """Fire-and-forget broadcast from sync route handlers; no-op when nobody
    is connected or the loop is unavailable (e.g. plain test client)."""
    sockets = _WS_CLIENTS.get(event_id)
    if not sockets or _WS_LOOP is None:
        return
    msg = json.dumps(payload)

    async def _fanout():
        dead = []
        for ws in list(sockets):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            sockets.discard(ws)

    try:
        asyncio.run_coroutine_threadsafe(_fanout(), _WS_LOOP)
    except RuntimeError:
        pass

REACTIONS = {"👍", "❤️", "😂", "🎉", "🔥"}
MAX_MSG_LEN = 1200

# ---- tiny sliding-window rate limiter (per process, like votes) ----
_hits = defaultdict(list)

def _slim_rate(key: str, limit: int, window_s: int) -> bool:
    """True = allowed."""
    now = _now().timestamp()
    hits = _hits[key]
    hits[:] = [t for t in hits if t > now - window_s]
    if len(hits) >= limit:
        return False
    hits.append(now)
    return True

def _now():
    return datetime.datetime.utcnow()


# ---- role / access helpers -------------------------------------------------
def _registration(db: Session, event_id: int, user_id: int):
    return (
        db.query(models.Registration)
        .filter_by(event_id=event_id, user_id=user_id)
        .first()
    )


def _chat_role(db: Session, event_id: int, user: models.User) -> str | None:
    """announce-poster ladder: organizer/admin > judge (assigned) > None.
    None = participant (general only)."""
    if user.role == "admin":
        return "organizer"
    if user.role == "judge":
        assigned = (
            db.query(models.JudgeAssignment)
            .filter_by(event_id=event_id, judge_id=user.id)
            .first()
        )
        if assigned:
            return "judge"
    ev = db.query(models.Event).get(event_id)
    if ev and ev.created_by == user.id:
        return "organizer"
    return None


def _require_access(db: Session, event_id: int, user: models.User):
    """Chat is for registered participants of THIS event (+ staff)."""
    if not db.query(models.Event).get(event_id):
        raise HTTPException(404, "Event not found")
    if user.role == "admin":
        return
    if _chat_role(db, event_id, user):
        return
    if not _registration(db, event_id, user.id):
        raise HTTPException(403, "Chat unlocks after you register for this event")


def _banned(db: Session, event_id: int, user_id: int):
    return (
        db.query(models.ChatBan)
        .filter_by(event_id=event_id, user_id=user_id, active=1)
        .first()
    )


def _audit(db: Session, event_id: int, actor: str, action: str, detail: str, meta=None):
    db.add(models.AuditLog(
        event_id=event_id, actor_key=actor, action=action, detail=detail, meta=meta,
    ))


def _leash():
    """Per-user rate: 20 posts/min, 60 reactions/min."""
    return True


def _my_team(db: Session, event_id: int, user_id: int) -> int | None:
    reg = _registration(db, event_id, user_id)
    return reg.team_id if reg else None


def _can_see_team(db: Session, msg: models.ChatMessage, user: models.User, mod: str | None) -> bool:
    """Team channel = members-only. Moderators (organizer/judge) can read for
    audits; participants see ONLY their own team's wall."""
    if msg.channel != "team":
        return True
    if mod:
        return True
    return _my_team(db, msg.event_id, user.id) == msg.team_id


def _serialize(db: Session, event_id: int, msg: models.ChatMessage, viewer_id: int,
               include_body: bool = True):
    u = db.query(models.User).get(msg.user_id)
    reg = _registration(db, event_id, msg.user_id)
    author_role = "organizer" if (u and u.role == "admin") else (
        "judge" if (u and u.role == "judge" and db.query(models.JudgeAssignment)
                    .filter_by(event_id=event_id, judge_id=msg.user_id).first())
        else "participant")
    reacts = db.query(models.ChatReaction).filter_by(message_id=msg.id).all()
    buckets = {}
    mine = {}
    for r in reacts:
        buckets.setdefault(r.emoji, 0)
        buckets[r.emoji] += 1
        if r.user_id == viewer_id:
            mine[r.emoji] = True
    team_name = None
    if msg.team_id:
        t = db.query(models.Team).get(msg.team_id)
        team_name = t.name if t else None
    return {
        "id": msg.id,
        "channel": msg.channel,
        "team_id": msg.team_id,
        "team_name": team_name,
        "body": (None if msg.removed else msg.body) if include_body else None,
        "removed": bool(msg.removed),
        "reported": bool(msg.reported),
        "report_reason": msg.report_reason,
        "author_id": msg.user_id,
        "author_name": (u.name if u else "unknown"),
        "author_role": author_role,
        "author_gender": (reg.gender if reg else None),
        "reactions": {"buckets": buckets, "mine": mine},
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }


class PostBody(BaseModel):
    body: str


class ReactBody(BaseModel):
    emoji: str


class ReportBody(BaseModel):
    reason: str = ""


class BanBody(BaseModel):
    user_id: int
    reason: str = ""


# ---- endpoints ---------------------------------------------------------------
@router.get("/{event_id}/messages")
def list_messages(
    event_id: int,
    after_id: int = 0,
    limit: int = 80,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _require_access(db, event_id, user)
    q = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.event_id == event_id, models.ChatMessage.id > after_id)
        .order_by(models.ChatMessage.id.asc())
    )
    staff = _chat_role(db, event_id, user) or ("organizer" if user.role == "admin" else None)
    rows = q.all()[-min(limit, 200):]
    hidden_ban = _banned(db, event_id, user.id)
    my_team_id = _my_team(db, event_id, user.id)
    out = []
    for m in rows:
        if m.channel == "team" and not _can_see_team(db, m, user, staff):
            continue  # members-only wall
        include_body = bool(staff) or not m.removed
        s = _serialize(db, event_id, m, user.id, include_body=include_body)
        out.append(s)
    return {
        "messages": out,
        "my_team_id": my_team_id,
        "my_ban": {"banned": bool(hidden_ban), "reason": hidden_ban.reason if hidden_ban else None},
        "my_role": _chat_role(db, event_id, user) or ("organizer" if user.role == "admin" else None) or "participant",
        "allowed_reactions": sorted(REACTIONS),
    }


@router.post("/{event_id}/messages")
def post_message(
    event_id: int,
    channel: str,
    data: PostBody,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _require_access(db, event_id, user)
    body = (data.body or "").strip()
    if not body:
        raise HTTPException(400, "Empty message")
    if len(body) > MAX_MSG_LEN:
        raise HTTPException(400, f"Max {MAX_MSG_LEN} characters")
    if channel not in ("general", "announce", "team"):
        raise HTTPException(400, "channel must be general|announce|team")
    role = _chat_role(db, event_id, user) or ("organizer" if user.role == "admin" else None)
    if channel == "announce" and role not in ("organizer", "judge"):
        raise HTTPException(403, "Only organizers & judges can post to 📢 Announce")
    team_id = None
    if channel == "team":
        team_id = _my_team(db, event_id, user.id)
        if not team_id:
            raise HTTPException(403, "Join a team first to post in your team wall")
        if not _slim_rate(f"chat:post:team:{user.id}", 20, 60):
            raise HTTPException(429, "Slow down — max 20 messages/min")
    if channel == "general":
        if user.role != "admin" and not (role or _registration(db, event_id, user.id)):
            raise HTTPException(403, "Register first to post")
        ban = _banned(db, event_id, user.id)
        if ban:
            raise HTTPException(403, f"You are muted in this lounge ({ban.reason or 'no reason given'})")
        if not _slim_rate(f"chat:post:general:{user.id}", 20, 60):
            raise HTTPException(429, "Slow down — max 20 messages/min (general)")
    m = models.ChatMessage(event_id=event_id, channel=channel, team_id=team_id,
                           user_id=user.id, body=body)
    db.add(m)
    _audit(db, event_id, f"u:{user.id}", f"chat.post.{channel}",
           (f"[team={team_id}] " if team_id else "") + body[:120])
    db.commit()
    db.refresh(m)
    _push(event_id, {"type": "new_message", "channel": channel})
    return _serialize(db, event_id, m, user.id)


@router.post("/message/{message_id}/react")
def react(
    message_id: int,
    data: ReactBody,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    msg = db.query(models.ChatMessage).get(message_id)
    if not msg:
        raise HTTPException(404, "Message not found")
    _require_access(db, msg.event_id, user)
    if msg.channel == "team":
        mod = _chat_role(db, msg.event_id, user) or ("organizer" if user.role == "admin" else None)
        if not _can_see_team(db, msg, user, mod):
            raise HTTPException(403, "Members-only wall")
    emoji = data.emoji
    if emoji not in REACTIONS:
        raise HTTPException(400, f"emoji must be one of {sorted(REACTIONS)}")
    if msg.removed:
        raise HTTPException(400, "Cannot react to a removed message")
    if not _slim_rate(f"chat:react:{user.id}", 60, 60):
        raise HTTPException(429, "Reaction rate limit")
    existing = (
        db.query(models.ChatReaction)
        .filter_by(message_id=message_id, user_id=user.id, emoji=emoji)
        .first()
    )
    if existing:
        db.delete(existing)   # toggle off
        db.commit()
        return {"ok": True, "toggled": "off"}
    db.add(models.ChatReaction(event_id=msg.event_id, message_id=message_id,
                               user_id=user.id, emoji=emoji))
    db.commit()
    return {"ok": True, "toggled": "on"}


@router.post("/message/{message_id}/report")
def report(
    message_id: int,
    data: ReportBody,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    msg = db.query(models.ChatMessage).get(message_id)
    if not msg:
        raise HTTPException(404, "Message not found")
    _require_access(db, msg.event_id, user)
    if msg.user_id == user.id:
        raise HTTPException(400, "You cannot report your own message")
    if msg.channel == "team" and _my_team(db, msg.event_id, user.id) != msg.team_id:
        raise HTTPException(403, "Only teammates can report team messages")
    msg.reported = 1
    msg.report_reason = (data.reason or "").strip()[:240] or None
    _audit(db, msg.event_id, f"u:{user.id}", "chat.report",
           f"msg#{message_id}: {msg.report_reason or 'no reason'}")
    db.commit()
    return {"ok": True}


# ---- moderation (organizer / admin / judge) --------------------------------
def _require_mod(db: Session, event_id: int, user: models.User):
    role = _chat_role(db, event_id, user) or ("organizer" if user.role == "admin" else None)
    if role not in ("organizer", "judge"):
        raise HTTPException(403, "Moderators only")
    return role


@router.post("/message/{message_id}/moderate")
def moderate(
    message_id: int,
    action: str = "remove",
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    msg = db.query(models.ChatMessage).get(message_id)
    if not msg:
        raise HTTPException(404, "Message not found")
    _require_mod(db, msg.event_id, user)
    if action == "remove":
        msg.removed = 1
        msg.reported = 0
    elif action == "restore":
        msg.removed = 0
    else:
        raise HTTPException(400, "action=remove|restore")
    _audit(db, msg.event_id, f"u:{user.id}", f"chat.mod.{action}",
           f"msg#{message_id} by u:{msg.user_id}")
    db.commit()
    return {"ok": True, "action": action, "message_id": message_id}


@router.post("/{event_id}/ban")
def ban_user(
    event_id: int,
    data: BanBody,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _require_mod(db, event_id, user)
    if data.user_id == user.id:
        raise HTTPException(400, "You cannot ban yourself")
    target = db.query(models.User).get(data.user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if _chat_role(db, event_id, target) == "organizer" or target.role == "admin":
        raise HTTPException(400, "Cannot ban an organizer")
    if _banned(db, event_id, data.user_id):
        raise HTTPException(400, "Already muted")
    db.add(models.ChatBan(event_id=event_id, user_id=data.user_id,
                          reason=(data.reason or "").strip()[:240] or None,
                          created_by=user.id))
    _audit(db, event_id, f"u:{user.id}", "chat.ban",
           f"u:{data.user_id} ({target.name}) — {data.reason or 'no reason'}")
    db.commit()
    return {"ok": True}


@router.get("/{event_id}/mod-queue")
def mod_queue(
    event_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Organizer console inbox: flagged messages + active mutes."""
    _require_mod(db, event_id, user)
    flagged = (
        db.query(models.ChatMessage)
        .filter_by(event_id=event_id, reported=1, removed=0)
        .order_by(models.ChatMessage.id.desc())
        .limit(50)
        .all()
    )
    bans = (
        db.query(models.ChatBan)
        .filter_by(event_id=event_id, active=1)
        .order_by(models.ChatBan.id.desc())
        .all()
    )
    ban_rows = []
    for b in bans:
        u = db.query(models.User).get(b.user_id)
        by = db.query(models.User).get(b.created_by)
        ban_rows.append({
            "user_id": b.user_id,
            "name": u.name if u else f"user#{b.user_id}",
            "email": u.email if u else None,
            "reason": b.reason,
            "by": by.name if by else None,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        })
    return {
        "flagged": [_serialize(db, event_id, m, user.id) for m in flagged],
        "mutes": ban_rows,
    }


@router.post("/{event_id}/unban")
def unban_user(
    event_id: int,
    data: BanBody,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    _require_mod(db, event_id, user)
    ban = _banned(db, event_id, data.user_id)
    if not ban:
        raise HTTPException(404, "Not muted")
    ban.active = 0
    _audit(db, event_id, f"u:{user.id}", "chat.unban", f"u:{data.user_id}")
    db.commit()
    return {"ok": True}
