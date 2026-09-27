import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app import models, schemas
from app import oauth
from app.auth import hash_password, verify_password, create_token, get_current_user
from fastapi import Request
from fastapi.responses import RedirectResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_MAX_AGE = 7 * 24 * 3600  # match ACCESS_TOKEN_EXPIRE_DAYS


def _set_auth_cookie(response: Response, token: str):
    # httpOnly cookie — works through preview proxies that strip custom
    # Authorization headers. secure=False so it also works on plain-http
    # self-hosted/local deployments; the cookie is still sent over https.
    response.set_cookie(
        key="hp_token",
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        path="/",
    )


def _issue_token(user: models.User, db: Session, response: Response):
    db.add(models.LoginLog(user_id=user.id, login_at=datetime.utcnow()))
    db.commit()
    token = create_token(user.id, user.role)
    _set_auth_cookie(response, token)
    return schemas.TokenOut(
        access_token=token,
        user=schemas.UserOut.model_validate(user),
    )


@router.post("/signup", response_model=schemas.TokenOut)
def signup(data: schemas.UserCreate, response: Response, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = models.User(
        email=data.email,
        name=data.name,
        hashed_password=hash_password(data.password),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _issue_token(user, db, response)


@router.post("/login", response_model=schemas.TokenOut)
def login(data: schemas.LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    # Portal separation: when the caller says which door they're at, make sure
    # the account belongs there. Otherwise you'd have admins opening the
    # participant portal (and vice versa) by mistake.
    if data.role == "admin" and user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="This is a participant account, not an admin account. Please use the Participant login tab.",
        )
    if data.role == "user" and user.role == "admin":
        raise HTTPException(
            status_code=403,
            detail="This is an admin account, not a participant account. Please use the Admin login tab.",
        )
    if data.role == "judge" and user.role != "judge":
        raise HTTPException(
            status_code=403,
            detail="This isn't a judge account. Judges use the Judge tab with the ID given by the organizer.",
        )
    return _issue_token(user, db, response)


# ---------- real OAuth (optional, env-gated) ----------
# If GOOGLE_/DISCORD_/GITHUB_CLIENT_ID (+ _SECRET) are set and
# PUBLIC_BASE_URL points at the deployed origin, the social buttons drive a
# REAL OAuth2 handshake — the genuine Google account picker / Discord consent
# screen opens. Without envs, /api/auth/social stays as the offline demo flow.
@router.get("/oauth/{provider}/start")
def oauth_start(provider: str, request: Request):
    p = provider.lower()
    if p not in oauth.PROVIDERS:
        raise HTTPException(status_code=400, detail="Unsupported provider")
    if not oauth.configured(p):
        return {
            "mode": "demo",
            "detail": f"{p} OAuth not configured — running the offline demo handshake. "
                      f"Set {p.upper()}_CLIENT_ID / {p.upper()}_CLIENT_SECRET and PUBLIC_BASE_URL to go live.",
        }
    state = oauth.state_make(p)
    return {"mode": "redirect", "url": oauth.authorize_url(p, state)}


@router.get("/oauth/{provider}/callback")
def oauth_callback(
    provider: str,
    code: str = "",
    state: str = "",
    error: str = "",
    db: Session = Depends(get_db),
):
    """Redirect target for the provider. Issues our JWT, bounces back to the
    SPA with `#tk=<jwt>` (fragment — never hits the server logs)."""
    p = provider.lower()
    if p not in oauth.PROVIDERS:
        raise HTTPException(status_code=400, detail="Unsupported provider")
    if error:
        raise HTTPException(status_code=401, detail=f"Provider error: {error}")
    if not code or not oauth.state_verify(p, state):
        raise HTTPException(status_code=401, detail="Invalid or expired OAuth state")
    if not oauth.configured(p):
        raise HTTPException(status_code=500, detail="Provider not configured — no envs")
    try:
        prof = oauth.exchange_and_profile(p, code)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OAuth exchange failed: {e}")

    user = db.query(models.User).filter(models.User.email == prof["email"]).first()
    if not user:
        user = models.User(
            email=prof["email"],
            name=prof["name"],
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            role="user",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        db.add(models.LoginLog(user_id=user.id, login_at=datetime.utcnow(),
                               ip=f"oauth:{p}:signup"))
    else:
        db.add(models.LoginLog(user_id=user.id, login_at=datetime.utcnow(),
                               ip=f"oauth:{p}:login"))
    db.commit()
    token = create_token(user.id, user.role)

    # redirect to SPA root; fragment carries the token (never logged anywhere)
    target = f"{oauth.FRONT_URL}#tk={urllib_parse_quote(token)}&oauth=1"
    return RedirectResponse(target)


def urllib_parse_quote(s: str) -> str:
    import urllib.parse
    return urllib.parse.quote(s, safe="")


@router.post("/social", response_model=schemas.TokenOut)
def social_login(
    data: schemas.SocialIn, response: Response, db: Session = Depends(get_db)
):
    # Self-hosted "social" login — keeps the platform fully offline with no
    # external auth provider (required by the spec). Swap this for a real OAuth
    # handshake (Google/GitHub) by gating on CLIENT_ID/CLIENT_SECRET env vars.
    provider = data.provider.lower()
    if provider not in {"google", "github", "discord"}:
        raise HTTPException(status_code=400, detail="Unsupported provider")
    email = f"{provider}.user@social.demo"
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        user = models.User(
            email=email,
            name=f"{provider.title()} User",
            hashed_password=hash_password(secrets.token_urlsafe(16)),
            role="user",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return _issue_token(user, db, response)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key="hp_token", path="/")
    return {"ok": True}


@router.get("/me", response_model=schemas.UserOut)
def me(current: models.User = Depends(get_current_user)):
    return current


# ---------- admin creates other admin accounts (from the admin console) ----------

@router.get("/admins", response_model=list[schemas.UserOut])
def list_admins(
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current.role != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    return (
        db.query(models.User)
        .filter(models.User.role == "admin")
        .order_by(models.User.created_at)
        .all()
    )


@router.post("/admins", response_model=schemas.UserOut)
def create_admin(
    data: schemas.AdminCreate,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One admin can mint another admin ID — from Admin console → Admins tab."""
    if current.role != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    email = data.email.strip().lower()
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user = models.User(
        email=email,
        name=data.name.strip() or email.split("@")[0],
        hashed_password=hash_password(data.password),
        role="admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ---------- profile (user + admin variants) ----------

def _weighted(sc: models.Score) -> float:
    return sc.innovation * 0.3 + sc.execution * 0.3 + sc.impact * 0.2 + sc.presentation * 0.2


def _event_status(e: models.Event) -> str:
    # same maths as events.status_of (kept local to avoid an import loop)
    now = datetime.utcnow()
    if now < e.start_date:
        return "upcoming"
    if now > e.end_date:
        return "past"
    return "ongoing"


@router.get("/profile")
def get_profile(
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Full profile payload: details + role-specific achievements/history/stats."""
    last_login = (
        db.query(models.LoginLog)
        .filter_by(user_id=current.id)
        .order_by(models.LoginLog.login_at.desc())
        .first()
    )
    regs = (
        db.query(models.Registration)
        .filter_by(user_id=current.id)
        .order_by(models.Registration.id)
        .all()
    )
    # phone comes from the latest registration — display only, NOT editable
    phone = None
    for r in reversed(regs):
        if r.phone:
            phone = r.phone
            break

    out = {
        "id": current.id,
        "name": current.name,
        "email": current.email,
        "role": current.role,
        "created_at": current.created_at,
        "last_login": last_login.login_at if last_login else None,
        "phone": phone,
    }

    if current.role == "admin":
        events_created = (
            db.query(models.Event)
            .filter(models.Event.created_by == current.id)
            .order_by(models.Event.id)
            .all()
        )
        out["stats"] = {
            "events_created": len(events_created),
            "total_events": db.query(models.Event).count(),
            "total_participants": db.query(models.User).filter_by(role="user").count(),
            "total_judges": db.query(models.User).filter_by(role="judge").count(),
            "total_admins": db.query(models.User).filter_by(role="admin").count(),
            "total_registrations": db.query(models.Registration).count(),
            "total_submissions": db.query(models.Submission).count(),
            "total_scores": db.query(models.Score).count(),
        }
        out["my_events"] = [
            {"id": e.id, "slug": e.slug, "title": e.title, "status": _event_status(e)}
            for e in events_created
        ]
        return out

    # participant / judge view ------------------------
    history = []
    total_pts = 0.0
    wins = 0
    joined_teams = 0
    led_teams = 0
    submitted_count = 0
    for r in regs:
        event = db.query(models.Event).get(r.event_id)
        team = db.query(models.Team).get(r.team_id) if r.team_id else None
        is_leader = bool(team and team.created_by == current.id)
        if team:
            if is_leader:
                led_teams += 1
            else:
                joined_teams += 1
        sub = (
            db.query(models.Submission)
            .filter_by(event_id=r.event_id, team_id=r.team_id)
            .first()
            if r.team_id
            else None
        )
        pts = 0.0
        rank = None
        votes = 0
        if sub and sub.status == "submitted":
            submitted_count += 1
            votes = db.query(models.Vote).filter_by(submission_id=sub.id).count()
            scores = db.query(models.Score).filter_by(submission_id=sub.id).all()
            if scores:
                pts = round(sum(_weighted(s) for s in scores) / len(scores), 2)
                total_pts += pts
            # rank within the event leaderboard
            others = (
                db.query(models.Submission)
                .filter_by(event_id=r.event_id, status="submitted")
                .all()
            )
            board = []
            for o in others:
                os_ = db.query(models.Score).filter_by(submission_id=o.id).all()
                op = sum(_weighted(s) for s in os_) / len(os_) if os_ else 0.0
                board.append((op, o.id))
            board.sort(reverse=True)
            for i, (_, sid) in enumerate(board):
                if sid == sub.id:
                    rank = i + 1
                    if i < 3:
                        wins += 1
                    break
        history.append(
            {
                "event_id": r.event_id,
                "event_slug": event.slug if event else "",
                "event_title": event.title if event else "Event",
                "event_status": _event_status(event) if event else "",
                "team_name": team.name if team else None,
                "team_avatar": team.avatar_url if team else None,
                "is_leader": is_leader,
                "submission_title": sub.title if sub else None,
                "submission_status": sub.status if sub else None,
                "pts": pts,
                "rank": rank,
                "votes": votes,
                "has_file": bool(sub and sub.file_path),
                "file_type": sub.file_type if sub else None,
                "registered_at": r.created_at,
            }
        )

    judged = db.query(models.Score).filter_by(judge_id=current.id).count()

    def badge(icon, title, desc, earned):
        return {"icon": icon, "title": title, "desc": desc, "earned": earned}

    achievements = [
        badge("🎟️", "First Entry", "Register for your first event", len(regs) > 0),
        badge("🤝", "Team Player", "Join a team", joined_teams > 0),
        badge("👑", "Team Leader", "Create and lead a team", led_teams > 0),
        badge("📦", "Shipper", "Submit a project", submitted_count > 0),
        badge("🔥", "Double Shipper", "Submit to 2+ events", submitted_count >= 2),
        badge("❤️", "Crowd Favorite", "Earn community votes", any(h["votes"] > 0 for h in history)),
        badge("🏆", "Podium Finish", "Top 3 on any leaderboard", wins > 0),
        badge("💯", "Point Hunter", "Earn 15+ total leaderboard pts", total_pts >= 15),
        badge("⚖️", "The Judge", "Score assigned projects", judged > 0),
    ]

    out["history"] = history
    out["achievements"] = achievements
    out["stats"] = {
        "events_joined": len(regs),
        "teams_led": led_teams,
        "submissions": submitted_count,
        "total_pts": round(total_pts, 2),
        "podiums": wins,
        "projects_judged": judged,
    }
    return out


@router.patch("/profile", response_model=schemas.UserOut)
def update_profile(
    data: schemas.ProfileUpdate,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Personal details then editable — name, email, password.
    Phone number is intentionally NOT editable here (it belongs to each
    event's registration form)."""
    # re-fetch inside THIS session — `current` may arrive detached via the dependency
    user = db.query(models.User).get(current.id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    changed = False
    if data.name is not None and data.name.strip() and data.name.strip() != user.name:
        user.name = data.name.strip()
        changed = True
    if data.email is not None:
        email = data.email.strip().lower()
        if "@" not in email or "." not in email:
            raise HTTPException(status_code=400, detail="Enter a valid email")
        if email != user.email:
            clash = db.query(models.User).filter(models.User.email == email).first()
            if clash:
                raise HTTPException(status_code=400, detail="That email is already taken")
            user.email = email
            changed = True
    if data.new_password is not None:
        if not data.current_password or not verify_password(data.current_password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Current password is wrong")
        if len(data.new_password) < 6:
            raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
        user.hashed_password = hash_password(data.new_password)
        changed = True
    if changed:
        db.commit()
    db.refresh(user)
    return user
