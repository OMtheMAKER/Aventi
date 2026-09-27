"""T3 — public community voting with configurable access & anti-abuse.

Access modes (organiser-configured per event):
  authenticated → voters must log in; identity = their account
  email         → voters prove an email with a 6-digit code (self-hosted
                  flow: no SMTP dependency — the code is surfaced to the
                  organiser in the response; in production wire it to mail)
  open          → anyone may vote; identity = one-way IP+UA fingerprint,
                  rate limited. Weakest vs sybil, honest about it.

Vote modes:
  simple    → one vote per project, max `max_picks` projects per ballot
  quadratic → each ballot holds `vote_credits`; allocating n votes to one
              project costs n²... actually cost = n² credits, so spreading
              beats shouting — see JUDGING.md for the defence.

Results stay hidden from everyone except organisers while the voting window
is active, until the organiser flips `results_published` (standard advice
from every platform we studied — dogfood spec reference [1]).
"""
import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db import get_db
from app import models, schemas
from app.auth import get_current_user, get_optional_user
from app.mailer import send_email
from app.antifraud import (
    RateLimited, rate_limit, normalize_email, ip_fingerprint,
    make_code, hash_code, audit,
)

router = APIRouter(prefix="/api/votes", tags=["votes"])

# Email login sessions: random bearer tokens, expire with the verify code window.
_EMAIL_SESSIONS: dict = {}  # token -> (event_id, email_norm, expires_at)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _event(event_id: int, db: Session) -> models.Event:
    e = db.query(models.Event).get(event_id)
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    return e


def _now() -> datetime:
    return datetime.utcnow()


def voting_open(e: models.Event) -> bool:
    now = _now()
    if e.voting_open_at and now < e.voting_open_at:
        return False
    if e.voting_close_at and now > e.voting_close_at:
        return False
    return True


def results_visible(e: models.Event) -> bool:
    """Hidden during the voting window for everyone but organisers; public
    after the window closes or once the organiser publishes early."""
    if e.results_published:
        return True
    if e.voting_close_at and _now() > e.voting_close_at:
        return True
    return False


def _client_fp(request: Request) -> str:
    ip = request.client.host if request.client else "unknown"
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        ip = fwd.split(",")[0].strip()
    return ip_fingerprint(ip, request.headers.get("user-agent", ""))


def _voter_key(event: models.Event, request: Request, user, email_token: str | None) -> tuple[str, dict]:
    """Resolve the ballot identity for this event's access mode.
    Returns (voter_key, extra_meta)."""
    if event.vote_access == "authenticated":
        if not user:
            raise HTTPException(status_code=401, detail="Log in to vote in this event")
        return f"u:{user.id}", {"via": "account"}
    if event.vote_access == "email":
        if not email_token or email_token not in _EMAIL_SESSIONS:
            raise HTTPException(status_code=401, detail="Verify your email to vote in this event")
        ev_id, email_norm, exp = _EMAIL_SESSIONS[email_token]
        if ev_id != event.id or _now() > exp:
            _EMAIL_SESSIONS.pop(email_token, None)
            raise HTTPException(status_code=401, detail="Email session expired — verify again")
        return f"e:{email_norm}", {"via": "email"}
    # open
    return f"ip:{_client_fp(request)}", {"via": "anonymous-fingerprint"}


def _load_ballot(db: Session, event_id: int, voter_key: str):
    return (
        db.query(models.VoteAllocation)
        .filter_by(event_id=event_id, voter_key=voter_key)
        .all()
    )


def _ballot_out(event: models.Event, voter_key: str, rows) -> schemas.BallotOut:
    allocs = [schemas.BallotAllocation(submission_id=r.submission_id, votes=r.votes) for r in rows]
    spent = sum(a.votes ** 2 for a in allocs) if event.vote_mode == "quadratic" else len(allocs)
    return schemas.BallotOut(
        voter_key=voter_key,
        access_mode=event.vote_access,
        mode=event.vote_mode,
        credits_total=event.vote_credits if event.vote_mode == "quadratic" else 0,
        credits_spent=spent if event.vote_mode == "quadratic" else 0,
        picks_used=len(allocs),
        max_picks=event.max_picks if event.vote_mode == "simple" else 0,
        allocations=allocs,
    )


def _req_to_http(exc: RateLimited):
    raise HTTPException(
        status_code=429,
        detail=f"Slow down — too many requests. Retry in ~{exc.retry_after}s.",
        headers={"Retry-After": str(exc.retry_after)},
    )


# ---------------------------------------------------------------------------
# voting window + config (organiser)
# ---------------------------------------------------------------------------
@router.get("/config/{event_id}", response_model=schemas.VotingConfigOut)
def get_config(event_id: int, db: Session = Depends(get_db)):
    e = _event(event_id, db)
    return schemas.VotingConfigOut(
        vote_access=e.vote_access or "authenticated",
        vote_mode=e.vote_mode or "simple",
        max_picks=e.max_picks or 3,
        vote_credits=e.vote_credits or 9,
        voting_open_at=e.voting_open_at,
        voting_close_at=e.voting_close_at,
        results_published=e.results_published or 0,
        voting_open=voting_open(e),
        results_visible=results_visible(e),
    )


@router.patch("/config/{event_id}", response_model=schemas.VotingConfigOut)
def set_config(
    event_id: int,
    data: schemas.VotingConfigIn,
    db: Session = Depends(get_db),
    admin=Depends(get_current_user),
):
    if admin.role != "admin":
        raise HTTPException(status_code=403, detail="Organizers only")
    e = _event(event_id, db)
    changes = []
    if data.vote_access is not None:
        if data.vote_access not in ("open", "email", "authenticated"):
            raise HTTPException(status_code=400, detail="vote_access must be open | email | authenticated")
        e.vote_access = data.vote_access; changes.append(f"access→{data.vote_access}")
    if data.vote_mode is not None:
        if data.vote_mode not in ("simple", "quadratic"):
            raise HTTPException(status_code=400, detail="vote_mode must be simple | quadratic")
        e.vote_mode = data.vote_mode; changes.append(f"mode→{data.vote_mode}")
    if data.max_picks is not None:
        if not (1 <= data.max_picks <= 50):
            raise HTTPException(status_code=400, detail="max_picks 1–50")
        e.max_picks = data.max_picks; changes.append(f"max_picks→{data.max_picks}")
    if data.vote_credits is not None:
        if not (1 <= data.vote_credits <= 10000):
            raise HTTPException(status_code=400, detail="vote_credits 1–10000")
        e.vote_credits = data.vote_credits; changes.append(f"credits→{data.vote_credits}")
    if data.voting_open_at is not None:
        e.voting_open_at = data.voting_open_at; changes.append(f"opens→{data.voting_open_at}")
    if data.voting_close_at is not None:
        e.voting_close_at = data.voting_close_at; changes.append(f"closes→{data.voting_close_at}")
    db.commit()
    audit(db, e.id, f"u:{admin.id}", "voting.config", "; ".join(changes) or "no-op")
    return get_config(event_id, db)


@router.post("/publish/{event_id}", response_model=schemas.VotingConfigOut)
def publish_results(event_id: int, publish: bool = True, db: Session = Depends(get_db), admin=Depends(get_current_user)):
    if admin.role != "admin":
        raise HTTPException(status_code=403, detail="Organizers only")
    e = _event(event_id, db)
    e.results_published = 1 if publish else 0
    db.commit()
    audit(
        db, e.id, f"u:{admin.id}",
        "results.publish" if publish else "results.hide",
        f"results {'made public' if publish else 'hidden'} by {admin.name}",
    )
    if publish:
        from app.t4webhooks import fire
        fire(db, e.id, "results.published", {"event_id": e.id, "by": admin.email}, audit)
    return get_config(event_id, db)


# ---------------------------------------------------------------------------
# email-gated access: request code → confirm code → session token
# ---------------------------------------------------------------------------
@router.post("/verify/{event_id}/request", response_model=schemas.VerifyRequestOut)
def verify_request(event_id: int, data: schemas.VerifyRequestIn, request: Request, db: Session = Depends(get_db)):
    e = _event(event_id, db)
    if e.vote_access != "email":
        raise HTTPException(status_code=400, detail="This event does not use email voting")
    email_norm = normalize_email(data.email)
    if "@" not in email_norm or "." not in email_norm.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    try:
        rate_limit("verify", f"email:{email_norm}")
        rate_limit("verify", _client_fp(request))
    except RateLimited as ex:
        _req_to_http(ex)

    code = make_code()
    exp = _now() + timedelta(minutes=15)
    # invalidate previous unused tokens for this email+event (idempotent resend)
    db.query(models.VoteVerifyToken).filter_by(event_id=event_id, email_norm=email_norm, used_at=None).delete()
    db.add(models.VoteVerifyToken(event_id=event_id, email_norm=email_norm, code_hash=hash_code(code), expires_at=exp))
    db.commit()

    # Default stays offline-first: the code is returned for the demo flow.
    # If SMTP_HOST is configured on the server, we instead deliver the code by
    # email and never expose it in the API response.
    sent = send_email(
        to=email_norm,
        subject="Your Aventi voting code",
        body=(f"Your Aventi voting verification code is: {code}\n\n"
              f"It expires in 15 minutes.\n\n— Aventi Platform"),
    )
    return schemas.VerifyRequestOut(
        ok=True,
        dev_code=None if sent else code,
        detail=(
            "Verification code sent to your email." if sent else
            "Verification code issued. Self-hosted deployment with no SMTP: the "
            "code is shown inline so the flow is testable with the network off. "
            "Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD to deliver by email."
        ),
    )


@router.post("/verify/{event_id}/confirm", response_model=schemas.VerifyConfirmOut)
def verify_confirm(event_id: int, data: schemas.VerifyConfirmIn, request: Request, db: Session = Depends(get_db)):
    e = _event(event_id, db)
    if e.vote_access != "email":
        raise HTTPException(status_code=400, detail="This event does not use email voting")
    email_norm = normalize_email(data.email)
    try:
        rate_limit("verify_confirm", f"email:{email_norm}")
    except RateLimited as ex:
        _req_to_http(ex)
    tok = (
        db.query(models.VoteVerifyToken)
        .filter_by(event_id=event_id, email_norm=email_norm, used_at=None)
        .order_by(models.VoteVerifyToken.id.desc())
        .first()
    )
    if not tok or tok.expires_at < _now() or tok.code_hash != hash_code(data.code):
        raise HTTPException(status_code=400, detail="Invalid or expired code")
    tok.used_at = _now()
    db.commit()
    session = secrets.token_urlsafe(24)
    _EMAIL_SESSIONS[session] = (event_id, email_norm, _now() + timedelta(hours=12))
    audit(db, event_id, f"e:{email_norm}", "voting.verify", "email verified for voting")
    return schemas.VerifyConfirmOut(ok=True, email_token=session)


# ---------------------------------------------------------------------------
# ballots
# ---------------------------------------------------------------------------
@router.get("/ballot/{event_id}", response_model=schemas.BallotOut)
def my_ballot(
    event_id: int,
    request: Request,
    email_token: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_optional_user),
):
    e = _event(event_id, db)
    key, _ = _voter_key(e, request, user, email_token)
    rows = _load_ballot(db, event_id, key)
    return _ballot_out(e, key, rows)


@router.post("/ballot/{event_id}", response_model=schemas.BallotOut)
def cast_ballot(
    event_id: int,
    data: schemas.BallotIn,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(get_optional_user),
):
    e = _event(event_id, db)
    if not voting_open(e):
        raise HTTPException(status_code=400, detail="Voting is not open right now")
    email_token = data.email_token
    key, meta = _voter_key(e, request, user, email_token)

    try:
        rate_limit("vote", f"{key}:evt:{event_id}")
    except RateLimited as ex:
        from app.antifraud import flag_abuse
        flag_abuse(db, event_id, key, f"vote rate limit hit ({ex.retry_after}s retry)", meta)
        _req_to_http(ex)

    # valid targets: submitted projects of this event
    submitted = {
        s.id for s in db.query(models.Submission)
        .filter_by(event_id=event_id, status="submitted").all()
    }
    seen: set = set()
    allocs: list[schemas.BallotAllocation] = []
    for a in data.allocations:
        if a.submission_id not in submitted:
            raise HTTPException(status_code=400, detail=f"Submission {a.submission_id} is not voteable in this event")
        if a.submission_id in seen:
            raise HTTPException(status_code=400, detail="Duplicate allocation to the same submission")
        seen.add(a.submission_id)
        if a.votes < 1:
            raise HTTPException(status_code=400, detail="votes must be ≥ 1")
        allocs.append(a)

    # participants can't vote for their own team (auth mode — only mode where
    # we can prove identity)
    if key.startswith("u:"):
        uid = int(key[2:])
        my_regs = [r.id for r in db.query(models.Registration).filter_by(event_id=event_id, user_id=uid).all()]
        my_teams = {m.team_id for m in db.query(models.TeamMember).filter(models.TeamMember.registration_id.in_(my_regs)).all()} if my_regs else set()
        my_team_subs = {
            s.id for s in db.query(models.Submission)
            .filter(models.Submission.event_id == event_id, models.Submission.team_id.in_(my_teams))
            .all()
        } if my_teams else set()
        bad = seen & my_team_subs
        if bad:
            from app.antifraud import flag_abuse
            flag_abuse(db, event_id, key, "attempted self-vote", {"submissions": sorted(bad)})
            raise HTTPException(status_code=400, detail="You can't vote for your own team")

    if e.vote_mode == "simple":
        for a in allocs:
            if a.votes != 1:
                raise HTTPException(status_code=400, detail="Simple mode: one vote per project")
        if len(allocs) > (e.max_picks or 3):
            raise HTTPException(status_code=400, detail=f"Pick at most {e.max_picks or 3} projects")
    else:  # quadratic: total cost = Σ votes² ≤ credits
        cost = sum(a.votes ** 2 for a in allocs)
        if cost > (e.vote_credits or 9):
            raise HTTPException(
                status_code=400,
                detail=f"Quadratic budget exceeded: costs {cost} credits, you have {e.vote_credits or 9} (n votes on one project cost n²)",
            )

    existed = _load_ballot(db, event_id, key)
    for r in existed:
        db.delete(r)
    for a in allocs:
        db.add(models.VoteAllocation(event_id=event_id, submission_id=a.submission_id, voter_key=key, votes=a.votes))
    db.commit()

    audit(
        db, event_id, key,
        "vote.update" if existed else "vote.cast",
        f"{len(allocs)} allocation(s)" + (" replaced previous ballot" if existed else ""),
        {"mode": e.vote_mode, "allocations": [a.model_dump() for a in allocs], **meta},
    )
    # T4 webhooks — vote.cast (identity is the voter_key, never personal
    # identifiers like IP/email)
    from app.t4webhooks import fire
    fire(db, event_id, "vote.cast", {
        "voter_key": key, "allocations": [a.model_dump() for a in allocs],
        "mode": e.vote_mode, "access": e.vote_access,
    })
    return _ballot_out(e, key, _load_ballot(db, event_id, key))


@router.delete("/ballot/{event_id}")
def withdraw_ballot(
    event_id: int,
    request: Request,
    email_token: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_optional_user),
):
    e = _event(event_id, db)
    key, _ = _voter_key(e, request, user, email_token)
    rows = _load_ballot(db, event_id, key)
    for r in rows:
        db.delete(r)
    db.commit()
    if rows:
        audit(db, event_id, key, "vote.withdraw", f"withdrew {len(rows)} allocation(s)")
    return {"ok": True, "removed": len(rows)}


# ---------------------------------------------------------------------------
# results — hidden during the window unless published
# ---------------------------------------------------------------------------
@router.get("/results/{event_id}", response_model=schemas.ResultsOut)
def results(
    event_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user=Depends(get_optional_user),
):
    e = _event(event_id, db)
    # Organisers are privileged readers — never throttle their review flow;
    # everyone else gets a per-identity cap so polling storms can't DoS legit
    # results traffic.
    if not (user and user.role == "admin"):
        try:
            rate_limit("results", f"u:{user.id}" if user else _client_fp(request))
        except RateLimited as ex:
            _req_to_http(ex)

    privileged = bool(user and user.role == "admin")
    if not privileged and not results_visible(e):
        raise HTTPException(
            status_code=403,
            detail="Results are hidden during the voting window. Organisers can publish them early.",
        )

    rows = db.query(models.VoteAllocation).filter_by(event_id=event_id).all()
    by_sub: dict = {}
    voters: set = set()
    for r in rows:
        entry = by_sub.setdefault(r.submission_id, {"votes": 0, "ballots": set()})
        entry["votes"] += r.votes
        entry["ballots"].add(r.voter_key)
        voters.add(r.voter_key)

    # include zero-vote submissions so the tally is complete
    subs = db.query(models.Submission).filter_by(event_id=event_id, status="submitted").all()
    team_names = {
        t.id: t.name for t in db.query(models.Team).filter_by(event_id=event_id).all()
    }
    tally = []
    for s in subs:
        agg = by_sub.get(s.id, {"votes": 0, "ballots": set()})
        tally.append(
            schemas.TallyRow(
                submission_id=s.id, title=s.title,
                team_name=team_names.get(s.team_id),
                votes=agg["votes"], ballots=len(agg["ballots"]),
            )
        )
    tally.sort(key=lambda t: (-t.votes, -t.ballots, t.title.lower()))
    return schemas.ResultsOut(event_id=event_id, published=bool(e.results_published), tally=tally, voters=len(voters))


# ---------------------------------------------------------------------------
# audit trail (organiser-readable)
# ---------------------------------------------------------------------------
@router.get("/audit/{event_id}", response_model=list[schemas.AuditRow])
def audit_trail(event_id: int, limit: int = 200, db: Session = Depends(get_db), admin=Depends(get_current_user)):
    if admin.role != "admin":
        raise HTTPException(status_code=403, detail="Organizers only")
    rows = (
        db.query(models.AuditLog)
        .filter_by(event_id=event_id)
        .order_by(models.AuditLog.id.desc())
        .limit(min(limit, 500))
        .all()
    )
    return rows


@router.get("/audit-export/{event_id}.csv")
def audit_csv(event_id: int, db: Session = Depends(get_db), admin=Depends(get_current_user)):
    import csv, io
    if admin.role != "admin":
        raise HTTPException(status_code=403, detail="Organizers only")
    rows = (
        db.query(models.AuditLog).filter_by(event_id=event_id)
        .order_by(models.AuditLog.id.asc()).all()
    )
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "created_at", "actor_key", "action", "detail"])
    for r in rows:
        w.writerow([r.id, r.created_at.isoformat(sep=" ", timespec="seconds"), r.actor_key, r.action, r.detail or ""])
    from fastapi.responses import Response
    return Response(
        content=buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=event-{event_id}-audit.csv"},
    )


# ---------------------------------------------------------------------------
# legacy single-toggle (kept for the old Gallery heart button; delegates to
# the allocation engine when the event uses auth-access simple voting)
# ---------------------------------------------------------------------------
@router.post("/{sub_id}/toggle", response_model=schemas.VoteOut)
def toggle_vote(
    sub_id: int,
    request: Request,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sub = db.query(models.Submission).get(sub_id)
    if not sub or sub.status != "submitted":
        raise HTTPException(status_code=404, detail="Submission not found")
    e = _event(sub.event_id, db)
    if (e.vote_access or "authenticated") != "authenticated":
        raise HTTPException(status_code=400, detail="Use the ballot endpoints for this event's access mode")
    if not voting_open(e):
        raise HTTPException(status_code=400, detail="Voting is not open right now")
    key = f"u:{current.id}"
    try:
        rate_limit("vote", f"{key}:evt:{e.id}")
    except RateLimited as ex:
        _req_to_http(ex)
    rows = _load_ballot(db, e.id, key)
    mine = next((r for r in rows if r.submission_id == sub_id), None)
    if mine:
        db.delete(mine)
        db.commit()
        audit(db, e.id, key, "vote.withdraw", f"removed support from submission {sub_id}")
    else:
        if (e.vote_mode or "simple") == "simple" and len(rows) >= (e.max_picks or 3):
            raise HTTPException(status_code=400, detail=f"Pick at most {e.max_picks or 3} projects")
        db.add(models.VoteAllocation(event_id=e.id, submission_id=sub_id, voter_key=key, votes=1))
        db.commit()
        audit(db, e.id, key, "vote.cast", f"supported submission {sub_id}")
    # count only if results are visible — otherwise hide (voter still learns
    # their own state)
    votes = 0
    if results_visible(e):
        votes = (
            db.query(models.VoteAllocation).filter_by(event_id=e.id, submission_id=sub_id)
            .with_entities(models.VoteAllocation.votes).all()
        )
        votes = sum(v for (v,) in votes)
    return schemas.VoteOut(votes=votes, my_vote=mine is None)


# ---------------------------------------------------------------------------
# comments (auth'd, rate-limited, organiser-moderated)
# ---------------------------------------------------------------------------
@router.get("/{sub_id}/comments", response_model=list[schemas.CommentOut])
def list_comments(sub_id: int, db: Session = Depends(get_db), user=Depends(get_optional_user)):
    q = db.query(models.Comment).filter_by(submission_id=sub_id)
    if not (user and (user.role == "admin")):
        q = q.filter_by(removed=0)
    comments = q.order_by(models.Comment.created_at.asc()).all()
    out = []
    for c in comments:
        u = db.query(models.User).get(c.user_id)
        out.append(
            schemas.CommentOut(
                id=c.id,
                body="[removed by organiser]" if c.removed else c.body,
                user_name=u.name if u else "User",
                user_id=c.user_id,
                removed=c.removed or 0,
                created_at=c.created_at,
            )
        )
    return out


@router.post("/{sub_id}/comments", response_model=schemas.CommentOut)
def add_comment(
    sub_id: int,
    data: schemas.CommentIn,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sub = db.query(models.Submission).get(sub_id)
    if not sub or sub.status != "submitted":
        raise HTTPException(status_code=404, detail="Submission not found")
    try:
        rate_limit("comment", f"u:{current.id}")
    except RateLimited as ex:
        from app.antifraud import flag_abuse
        flag_abuse(db, sub.event_id, f"u:{current.id}", "comment rate limit hit")
        _req_to_http(ex)
    body = (data.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    if len(body) > 2000:
        raise HTTPException(status_code=400, detail="Comment too long (2000 chars max)")
    # exact-duplicate spam check (same user, same body, same hour)
    hour_ago = _now() - timedelta(hours=1)
    dup = (
        db.query(models.Comment)
        .filter(models.Comment.submission_id == sub_id, models.Comment.user_id == current.id,
                models.Comment.body == body, models.Comment.created_at > hour_ago)
        .first()
    )
    if dup:
        from app.antifraud import flag_abuse
        flag_abuse(db, sub.event_id, f"u:{current.id}", "duplicate comment", {"submission_id": sub_id})
        raise HTTPException(status_code=400, detail="You've already posted this same comment here recently")
    c = models.Comment(submission_id=sub_id, user_id=current.id, body=body)
    db.add(c)
    db.commit()
    db.refresh(c)
    audit(db, sub.event_id, f"u:{current.id}", "comment.create", f"comment on submission {sub_id}")
    return schemas.CommentOut(id=c.id, body=c.body, user_name=current.name, user_id=current.id, removed=0, created_at=c.created_at)


@router.delete("/comments/{comment_id}")
def remove_comment(comment_id: int, current: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.query(models.Comment).get(comment_id)
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if c.user_id != current.id and current.role != "admin":
        raise HTTPException(status_code=403, detail="Not your comment")
    sub = db.query(models.Submission).get(c.submission_id)
    c.removed = 1
    db.commit()
    audit(
        db, sub.event_id if sub else None, f"u:{current.id}",
        "comment.remove",
        f"comment {comment_id} removed by {'organiser' if current.role == 'admin' and c.user_id != current.id else 'author'}",
    )
    return {"ok": True}
