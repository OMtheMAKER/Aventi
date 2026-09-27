import os
import shutil

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app import models, schemas
from app.auth import get_current_user

router = APIRouter(prefix="/api/teams", tags=["teams"])

TEAM_UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "uploads",
)
os.makedirs(TEAM_UPLOAD_DIR, exist_ok=True)


def team_members_q(db: Session, team_id: int):
    return (
        db.query(models.Registration)
        .join(models.TeamMember, models.TeamMember.registration_id == models.Registration.id)
        .filter(models.TeamMember.team_id == team_id)
    )


def member_count(db: Session, team_id: int) -> int:
    return db.query(models.TeamMember).filter_by(team_id=team_id).count()


@router.get("/event/{event_id}", response_model=list[schemas.TeamCardOut])
def list_event_teams(
    event_id: int,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Team hub: every team in an event with its members and open slots."""
    event = db.query(models.Event).get(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    out = []
    for t in db.query(models.Team).filter_by(event_id=event_id).all():
        members = [
            {
                "name": m.name,
                "institution": m.institution,
                "gender": m.gender,
                "skills": m.skills,
                "email": m.email,
            }
            for m in team_members_q(db, t.id).all()
        ]
        out.append(
            schemas.TeamCardOut(
                id=t.id,
                event_id=t.event_id,
                name=t.name,
                tagline=t.tagline,
                avatar_url=t.avatar_url,
                has_thumbnail=bool(t.thumbnail_path and os.path.exists(t.thumbnail_path)),
                is_open=t.is_open,
                max_members=t.max_members or 4,
                member_count=len(members),
                members=members,
                created_by=t.created_by,
                created_at=t.created_at,
            )
        )
    return out


def _team_out(t: models.Team) -> schemas.TeamOut:
    d = schemas.TeamOut.model_validate(t)
    d.has_thumbnail = bool(t.thumbnail_path and os.path.exists(t.thumbnail_path))
    return d


@router.get("/by-code/{invite_code}", response_model=schemas.TeamOut)
def get_team_by_code(invite_code: str, db: Session = Depends(get_db)):
    t = db.query(models.Team).filter_by(invite_code=invite_code).first()
    if not t:
        raise HTTPException(status_code=404, detail="Team not found")
    return _team_out(t)


# ---------- team cover thumbnail (leader only) ----------

@router.post("/{team_id}/thumbnail", response_model=schemas.TeamOut)
async def upload_team_thumbnail(
    team_id: int,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    t = db.query(models.Team).get(team_id)
    if not t:
        raise HTTPException(status_code=404, detail="Team not found")
    if t.created_by != current.id and current.role != "admin":
        raise HTTPException(status_code=403, detail="Only the team leader can change the team thumbnail")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
        raise HTTPException(status_code=400, detail="Must be an image file")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Max 10 MB")
    path = os.path.join(TEAM_UPLOAD_DIR, f"team_thumb_{t.id}{ext}")
    if t.thumbnail_path and os.path.exists(t.thumbnail_path) and t.thumbnail_path != path:
        try:
            os.remove(t.thumbnail_path)
        except OSError:
            pass
    with open(path, "wb") as f:
        f.write(data)
    t.thumbnail_path = path
    db.commit()
    db.refresh(t)
    return _team_out(t)


@router.post("/{team_id}/thumbnail/stock", response_model=schemas.TeamOut)
def pick_team_stock_thumbnail(
    team_id: int,
    data: dict,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.routers.submissions import STOCK_DIR, STOCK_LABELS
    t = db.query(models.Team).get(team_id)
    if not t:
        raise HTTPException(status_code=404, detail="Team not found")
    if t.created_by != current.id and current.role != "admin":
        raise HTTPException(status_code=403, detail="Only the team leader can change the team thumbnail")
    fname = os.path.basename(str(data.get("file", "")))
    src = os.path.join(STOCK_DIR, fname)
    if fname not in STOCK_LABELS or not os.path.exists(src):
        raise HTTPException(status_code=400, detail="Unknown stock thumbnail")
    dst = os.path.join(TEAM_UPLOAD_DIR, f"team_thumb_{t.id}{os.path.splitext(fname)[1]}")
    shutil.copyfile(src, dst)
    t.thumbnail_path = dst
    db.commit()
    db.refresh(t)
    return _team_out(t)


@router.get("/{team_id}/thumbnail")
def serve_team_thumbnail(team_id: int, db: Session = Depends(get_db)):
    t = db.query(models.Team).get(team_id)
    if not t or not t.thumbnail_path or not os.path.exists(t.thumbnail_path):
        raise HTTPException(status_code=404, detail="No team thumbnail")
    return FileResponse(t.thumbnail_path)


@router.post("/{team_id}/invite")
def invite_to_team(
    team_id: int,
    data: schemas.TeamInviteIn,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Leader-invite by email OR username — instant add (no asking them for a code)."""
    team = db.query(models.Team).get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if team.created_by != current.id and current.role != "admin":
        raise HTTPException(status_code=403, detail="Only the team leader can invite")
    cnt = member_count(db, team_id)
    if cnt >= (team.max_members or 4):
        raise HTTPException(status_code=400, detail="Team is full")

    # resolve either by email or by username (name) — case-insensitive
    user = None
    if data.email:
        user = db.query(models.User).filter(models.User.email == data.email.lower()).first()
    elif data.username:
        user = db.query(models.User).filter(
            models.User.name.ilike(f"%{data.username.strip()}%")
        ).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user found with that email/username — they should sign up first")
    if user.role != "user":
        raise HTTPException(status_code=400, detail="Only participant accounts can be invited to teams")

    # must be registered for the event (registration drives the member listing)
    reg = (
        db.query(models.Registration)
        .filter_by(event_id=team.event_id, user_id=user.id)
        .first()
    )
    if not reg:
        raise HTTPException(status_code=400, detail=f"{user.name} hasn't registered for this event yet — ask them to register first")
    if reg.team_id is not None:
        raise HTTPException(status_code=400, detail=f"{user.name} is already on a team for this event")
    reg.team_id = team_id
    reg.team_code = team.invite_code
    db.add(models.TeamMember(team_id=team_id, registration_id=reg.id))
    db.commit()
    return {"ok": True, "added": user.name}


@router.patch("/{team_id}", response_model=schemas.TeamOut)
def update_team(
    team_id: int,
    data: schemas.TeamUpdate,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Only the team leader (creator) can rename / restyle the team."""
    team = db.query(models.Team).get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if team.created_by != current.id and current.role != "admin":
        raise HTTPException(status_code=403, detail="Only the team leader can edit this team")
    if data.name is not None and data.name.strip():
        team.name = data.name.strip()
    if data.tagline is not None:
        team.tagline = data.tagline
    if data.avatar_url is not None:
        team.avatar_url = data.avatar_url
    if data.is_open is not None:
        team.is_open = 1 if data.is_open else 0
    if data.max_members is not None:
        mm = max(1, min(10, int(data.max_members)))
        if mm < member_count(db, team_id):
            raise HTTPException(status_code=400, detail="Team already has more members than that limit")
        team.max_members = mm
    db.commit()
    db.refresh(team)
    return team


@router.post("/{team_id}/join")
def join_team(
    team_id: int,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    team = db.query(models.Team).get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    reg = (
        db.query(models.Registration)
        .filter_by(event_id=team.event_id, user_id=current.id)
        .first()
    )
    if not reg:
        raise HTTPException(status_code=400, detail="Register for the event first")
    if reg.team_id is not None:
        raise HTTPException(status_code=400, detail="You are already in a team for this event")
    if not team.is_open:
        raise HTTPException(status_code=403, detail="This team is closed — ask for an invite code")
    if member_count(db, team_id) >= (team.max_members or 4):
        raise HTTPException(status_code=400, detail="Team is full")
    reg.team_id = team_id
    reg.team_code = team.invite_code
    db.add(models.TeamMember(team_id=team_id, registration_id=reg.id))
    db.commit()
    return {"ok": True, "team": team.name}


@router.get("/{team_id}/members")
def team_members(
    team_id: int,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    team = db.query(models.Team).get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    members = team_members_q(db, team_id).all()
    return [
        {
            "name": m.name,
            "institution": m.institution,
            "email": m.email,
            "gender": m.gender,
            "skills": m.skills,
        }
        for m in members
    ]
