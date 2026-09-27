import os
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app import models, schemas
from app.auth import get_current_user
from app.routers.judging import require_organizer

router = APIRouter(prefix="/api/submissions", tags=["submissions"])

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data",
    "uploads",
)
os.makedirs(UPLOAD_DIR, exist_ok=True)

FILE_TYPE_CHOICES = ["mp4", "ppt", "pptx", "pdf", "zip", "image", "ipynb", "docx", "other"]
EXT_TO_TYPE = {
    ".mp4": "mp4", ".ppt": "ppt", ".pptx": "pptx", ".pdf": "pdf",
    ".zip": "zip", ".png": "image", ".jpg": "image", ".jpeg": "image",
    ".ipynb": "ipynb", ".docx": "docx",
}
MAX_UPLOAD_MB = 200


def _now():
    return datetime.utcnow()


def _locked(event: models.Event) -> bool:
    """Submissions hard-lock at the event end (code-freeze) time."""
    return _now() > event.end_date


def _my_team(db: Session, event_id: int, user_id: int):
    reg = (
        db.query(models.Registration)
        .filter_by(event_id=event_id, user_id=user_id)
        .first()
    )
    if not reg or not reg.team_id:
        return None, None
    team = db.query(models.Team).get(reg.team_id)
    return reg, team


def _enrich(db: Session, sub: models.Submission) -> schemas.SubmissionOut:
    d = schemas.SubmissionOut.model_validate(sub)
    t = db.query(models.Team).get(sub.team_id)
    if t:
        d.team_name = t.name
        d.team_avatar = t.avatar_url
    d.has_thumbnail = bool(sub.thumbnail_path and os.path.exists(sub.thumbnail_path))
    d.image_count = len(sub.gallery_images or [])
    return d


# ---------- team-facing (draft / edit / submit) ----------

@router.get("/mine/{event_id}")
def my_submission(
    event_id: int,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _, team = _my_team(db, event_id, current.id)
    if not team:
        return {"submission": None, "locked": False}
    sub = (
        db.query(models.Submission)
        .filter_by(event_id=event_id, team_id=team.id)
        .first()
    )
    event = db.query(models.Event).get(event_id)
    return {
        "submission": _enrich(db, sub) if sub else None,
        "locked": _locked(event) if event else False,
        "status": event.status if hasattr(event, "status") else None,
    }


@router.post("", response_model=schemas.SubmissionOut)
def create_submission(
    event_id: int,
    data: schemas.SubmissionIn,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    event = db.query(models.Event).get(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if _locked(event):
        raise HTTPException(status_code=403, detail="Submissions are locked — the build window is closed")
    _, team = _my_team(db, event_id, current.id)
    if not team:
        raise HTTPException(status_code=400, detail="You must register and be in a team before submitting")
    existing = (
        db.query(models.Submission)
        .filter_by(event_id=event_id, team_id=team.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Your team already has a submission — edit it instead")
    sub = models.Submission(
        event_id=event_id,
        team_id=team.id,
        title=data.title,
        tagline=data.tagline,
        description=data.description,
        repo_url=data.repo_url,
        demo_video_url=data.demo_video_url,
        tech_stack=data.tech_stack,
        extra_links=[l.model_dump() for l in data.extra_links],
        live_url=data.live_url,
        track=data.track,
        custom_answers=[qa.model_dump() for qa in data.custom_answers if qa.answer and qa.answer.strip()],
        status="draft",
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return _enrich(db, sub)


@router.put("/{sub_id}", response_model=schemas.SubmissionOut)
def edit_submission(
    sub_id: int,
    data: schemas.SubmissionIn,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sub = db.query(models.Submission).get(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    event = db.query(models.Event).get(sub.event_id)
    if _locked(event):
        raise HTTPException(status_code=403, detail="The submission window has closed")
    team = db.query(models.Team).get(sub.team_id)
    reg = (
        db.query(models.Registration)
        .filter_by(event_id=sub.event_id, user_id=current.id)
        .first()
    )
    if not (reg and reg.team_id == team.id) and current.role != "admin":
        raise HTTPException(status_code=403, detail="Only team members can edit this submission")
    if sub.status == "submitted" and current.role != "admin":
        raise HTTPException(status_code=403, detail="Already submitted — submissions are final after submit")
    for f in ("title", "tagline", "description", "repo_url", "demo_video_url", "tech_stack", "live_url", "track"):
        setattr(sub, f, getattr(data, f))
    sub.extra_links = [l.model_dump() for l in data.extra_links]
    sub.custom_answers = [qa.model_dump() for qa in data.custom_answers if qa.answer and qa.answer.strip()]
    sub.updated_at = _now()
    db.commit()
    db.refresh(sub)
    return _enrich(db, sub)


@router.post("/{sub_id}/submit", response_model=schemas.SubmissionOut)
def final_submit(
    sub_id: int,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sub = db.query(models.Submission).get(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    event = db.query(models.Event).get(sub.event_id)
    if _locked(event):
        raise HTTPException(status_code=403, detail="The submission window has closed")
    reg = (
        db.query(models.Registration)
        .filter_by(event_id=sub.event_id, user_id=current.id)
        .first()
    )
    if not (reg and reg.team_id == sub.team_id) and current.role != "admin":
        raise HTTPException(status_code=403, detail="Only team members can submit")
    if sub.status == "submitted":
        raise HTTPException(status_code=400, detail="Already submitted")
    # mandatory fields for final submit — draft can be partial.
    # The event creator decides if a project repo is asked (form_fields.project_repo);
    # when it's off, a title alone (plus whatever fields exist) is enough.
    asks_repo = (event.form_fields or {}).get("project_repo", True) is not False
    if not sub.title:
        raise HTTPException(status_code=400, detail="Fill these before submitting: title")
    if asks_repo and not sub.repo_url and not sub.file_path:
        raise HTTPException(status_code=400, detail="Attach a repo link or upload a file before submitting")
    sub.status = "submitted"
    sub.submitted_at = _now()
    db.commit()
    db.refresh(sub)
    # T4: webhooks
    from app.t4webhooks import fire
    from app.antifraud import audit
    team = db.query(models.Team).get(sub.team_id)
    fire(db, sub.event_id, "submission.submitted", {
        "submission_id": sub.id, "title": sub.title,
        "team": team.name if team else None, "event_id": sub.event_id,
        "repo_url": sub.repo_url, "submitted_at": sub.submitted_at.isoformat() if sub.submitted_at else None,
    }, audit)
    return _enrich(db, sub)


# ---------- direct file upload (mp4 / ppt / pdf / zip / …) ----------

@router.post("/{sub_id}/file", response_model=schemas.SubmissionOut)
async def upload_file(
    sub_id: int,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    file_type: str = Form("auto"),
):
    """Leader/member browses a file from their desktop — saved against the submission."""
    sub = db.query(models.Submission).get(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    event = db.query(models.Event).get(sub.event_id)
    if _locked(event):
        raise HTTPException(status_code=403, detail="The submission window has closed")
    reg = (
        db.query(models.Registration)
        .filter_by(event_id=sub.event_id, user_id=current.id)
        .first()
    )
    if not (reg and reg.team_id == sub.team_id) and current.role != "admin":
        raise HTTPException(status_code=403, detail="Only team members can upload")
    if sub.status == "submitted" and current.role != "admin":
        raise HTTPException(status_code=403, detail="Already submitted — uploads are locked")

    # decide effective type: explicit choice, else infer from extension
    ext = os.path.splitext(file.filename or "")[1].lower()
    ftype = file_type if file_type in FILE_TYPE_CHOICES and file_type != "auto" else EXT_TO_TYPE.get(ext, "other")

    data = await file.read()
    size_mb = len(data) / (1024 * 1024)
    if size_mb > MAX_UPLOAD_MB:
        raise HTTPException(status_code=400, detail=f"File too large ({size_mb:.1f} MB > {MAX_UPLOAD_MB} MB limit)")

    safe_name = f"{sub.id}{ext}" if ext else f"{sub.id}.bin"
    path = os.path.join(UPLOAD_DIR, safe_name)
    # clean old file if exists
    if sub.file_path and os.path.exists(sub.file_path) and sub.file_path != path:
        try:
            os.remove(sub.file_path)
        except OSError:
            pass
    with open(path, "wb") as f:
        f.write(data)

    sub.file_path = path
    sub.file_name = file.filename or safe_name
    sub.file_type = ftype
    sub.updated_at = _now()
    db.commit()
    db.refresh(sub)
    return _enrich(db, sub)


@router.get("/{sub_id}/file")
def download_file(sub_id: int, db: Session = Depends(get_db)):
    """Public download — gallery cites this URL for the team's uploaded file."""
    sub = db.query(models.Submission).get(sub_id)
    if not sub or not sub.file_path or not os.path.exists(sub.file_path):
        raise HTTPException(status_code=404, detail="No file attached")
    return FileResponse(sub.file_path, filename=sub.file_name or "submission")


# ---------- T1: stock thumbnail library ----------

STOCK_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "stock_thumbs",
)
STOCK_LABELS = {
    "rocket.jpg": "🚀 Rocket Launch",
    "robot.jpg": "🤖 Robot AI",
    "cybercity.jpg": "🌃 Cyber City",
    "gaming.jpg": "🎮 Trophy Gaming",
    "green.jpg": "🌱 Green Tech",
    "brain.jpg": "🧠 Neural Brain",
    "puzzle.jpg": "🧩 Teamwork Puzzle",
    "health.jpg": "❤️ Health Monitor",
    "style-cyberpunk.png": "🌆 Cyberpunk Neon",
    "style-glassmorphism.png": "🫧 Glassmorphism",
    "style-gradient-mesh.png": "🌈 Gradient Mesh",
    "style-terminal.png": "💻 Terminal Dark",
    "style-3d-render.png": "🧊 3D Render",
    "style-isometric.png": "🏗️ Isometric Workspace",
    "style-lowpoly.png": "🔮 Lowpoly Network",
    "style-synthwave.png": "🌅 Retro Synthwave",
    "style-editorial.png": "🖨️ Dark Editorial",
    "style-holographic.png": "🪽 Holographic Iridescent",
    "idea-bulb.jpg": "💡 Idea Bulb",
}


@router.get("/stock-thumbnails")
def list_stock_thumbnails():
    """Public list of bundled stock thumbnails: [{file, label, url}]"""
    if not os.path.isdir(STOCK_DIR):
        return []
    out = []
    for f in sorted(os.listdir(STOCK_DIR)):
        if f in STOCK_LABELS:
            out.append({
                "file": f,
                "label": STOCK_LABELS[f],
                "url": f"/api/submissions/stock-thumbnails/{f}",
            })
    return out


@router.get("/stock-thumbnails/{filename}")
def serve_stock_thumbnail(filename: str):
    safe = os.path.basename(filename)
    path = os.path.join(STOCK_DIR, safe)
    if safe not in STOCK_LABELS or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="No such stock thumbnail")
    return FileResponse(path)


@router.post("/{sub_id}/thumbnail/stock", response_model=schemas.SubmissionOut)
def pick_stock_thumbnail(
    sub_id: int,
    data: dict,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pick one of the bundled stock thumbnails instead of uploading a file."""
    sub = db.query(models.Submission).get(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    _image_guard(sub, current, db)
    fname = os.path.basename(str(data.get("file", "")))
    src = os.path.join(STOCK_DIR, fname)
    if fname not in STOCK_LABELS or not os.path.exists(src):
        raise HTTPException(status_code=400, detail="Unknown stock thumbnail")
    import shutil
    dst = os.path.join(UPLOAD_DIR, f"thumb_{sub.id}{os.path.splitext(fname)[1]}")
    shutil.copyfile(src, dst)
    sub.thumbnail_path = dst
    sub.updated_at = _now()
    db.commit()
    db.refresh(sub)
    return _enrich(db, sub)


# ---------- T1: thumbnail + image gallery ----------

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
MAX_IMAGES = 6


def _image_guard(sub: models.Submission, current: models.User, db: Session):
    """Same write-guard as file upload: team member, before deadline, before submit."""
    event = db.query(models.Event).get(sub.event_id)
    if _locked(event):
        raise HTTPException(status_code=403, detail="The submission window has closed")
    reg = (
        db.query(models.Registration)
        .filter_by(event_id=sub.event_id, user_id=current.id)
        .first()
    )
    if not (reg and reg.team_id == sub.team_id) and current.role != "admin":
        raise HTTPException(status_code=403, detail="Only team members can manage images")
    if sub.status == "submitted" and current.role != "admin":
        raise HTTPException(status_code=403, detail="Already submitted — images are locked")


@router.post("/{sub_id}/thumbnail", response_model=schemas.SubmissionOut)
async def upload_thumbnail(
    sub_id: int,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    sub = db.query(models.Submission).get(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    _image_guard(sub, current, db)
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in IMAGE_EXTS:
        raise HTTPException(status_code=400, detail="Thumbnail must be an image (png/jpg/gif/webp)")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 10 MB)")
    path = os.path.join(UPLOAD_DIR, f"thumb_{sub.id}{ext}")
    if sub.thumbnail_path and os.path.exists(sub.thumbnail_path) and sub.thumbnail_path != path:
        try:
            os.remove(sub.thumbnail_path)
        except OSError:
            pass
    with open(path, "wb") as f:
        f.write(data)
    sub.thumbnail_path = path
    sub.updated_at = _now()
    db.commit()
    db.refresh(sub)
    return _enrich(db, sub)


@router.get("/{sub_id}/thumbnail")
def get_thumbnail(sub_id: int, db: Session = Depends(get_db)):
    sub = db.query(models.Submission).get(sub_id)
    if not sub or not sub.thumbnail_path or not os.path.exists(sub.thumbnail_path):
        raise HTTPException(status_code=404, detail="No thumbnail")
    return FileResponse(sub.thumbnail_path)


@router.post("/{sub_id}/images", response_model=schemas.SubmissionOut)
async def add_gallery_image(
    sub_id: int,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
):
    sub = db.query(models.Submission).get(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    _image_guard(sub, current, db)
    imgs = list(sub.gallery_images or [])
    if len(imgs) >= MAX_IMAGES:
        raise HTTPException(status_code=400, detail=f"Max {MAX_IMAGES} gallery images")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in IMAGE_EXTS:
        raise HTTPException(status_code=400, detail="Only images (png/jpg/gif/webp) allowed")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 10 MB)")
    idx = len(imgs)
    path = os.path.join(UPLOAD_DIR, f"img_{sub.id}_{idx}{ext}")
    with open(path, "wb") as f:
        f.write(data)
    imgs.append(os.path.basename(path))
    sub.gallery_images = imgs
    sub.updated_at = _now()
    db.commit()
    db.refresh(sub)
    return _enrich(db, sub)


@router.get("/{sub_id}/images/{idx}")
def get_gallery_image(sub_id: int, idx: int, db: Session = Depends(get_db)):
    sub = db.query(models.Submission).get(sub_id)
    imgs = sub.gallery_images or []
    if idx < 0 or idx >= len(imgs):
        raise HTTPException(status_code=404, detail="No such image")
    path = os.path.join(UPLOAD_DIR, imgs[idx])
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Image missing on disk")
    return FileResponse(path)


@router.delete("/{sub_id}/images/{idx}", response_model=schemas.SubmissionOut)
def delete_gallery_image(
    sub_id: int,
    idx: int,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sub = db.query(models.Submission).get(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    _image_guard(sub, current, db)
    imgs = list(sub.gallery_images or [])
    if idx < 0 or idx >= len(imgs):
        raise HTTPException(status_code=404, detail="No such image")
    path = os.path.join(UPLOAD_DIR, imgs.pop(idx))
    if os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass
    # rename remaining files so indices stay stable
    new_imgs = []
    for i, name in enumerate(imgs):
        old = os.path.join(UPLOAD_DIR, name)
        ext = os.path.splitext(name)[1]
        new_name = f"img_{sub.id}_{i}{ext}"
        new_path = os.path.join(UPLOAD_DIR, new_name)
        if os.path.exists(old) and old != new_path:
            os.rename(old, new_path)
        new_imgs.append(new_name)
    sub.gallery_images = new_imgs
    sub.updated_at = _now()
    db.commit()
    db.refresh(sub)
    return _enrich(db, sub)


# ---------- public mini-leaderboard (visible on the event page) ----------

@router.get("/leaderboard-public/{event_id}")
def public_leaderboard(event_id: int, db: Session = Depends(get_db)):
    """Ranked teams for the event page — team profile + pts (rubric-weighted average)."""
    from app.routers.judging import weighted
    subs = (
        db.query(models.Submission)
        .filter_by(event_id=event_id, status="submitted")
        .all()
    )
    rows = []
    for s in subs:
        team = db.query(models.Team).get(s.team_id)
        scores = db.query(models.Score).filter_by(submission_id=s.id).all()
        pts = 0.0
        if scores:
            pts = round(sum(weighted(sc) for sc in scores) / len(scores), 2)
        rows.append(
            {
                "submission_id": s.id,
                "title": s.title,
                "team_name": team.name if team else "Team",
                "team_avatar": team.avatar_url if team else None,
                "pts": pts,
                "reviewers": len(scores),
            }
        )
    rows.sort(key=lambda x: x["pts"], reverse=True)
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return rows


# ---------- public gallery (T1) ----------

@router.get("/gallery/{event_id}", response_model=list[schemas.GalleryCard])
def public_gallery(
    event_id: int,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every *submitted* project — visible to any logged-in user (public gallery).
    T3: counts come from VoteAllocation; when the voting window is active and
    results aren't published, counts are hidden (my_vote still reflects you).
    T3: order is randomised per voter (position-bias killer) — each user sees
    the gallery in a stable-but-unique order derived from their identity."""
    from app.routers.votes import results_visible
    ev = db.query(models.Event).get(event_id)
    show_counts = bool(ev) and results_visible(ev)
    subs = (
        db.query(models.Submission)
        .filter_by(event_id=event_id, status="submitted")
        .order_by(models.Submission.submitted_at.asc())
        .all()
    )
    # Stable per-voter shuffle: hash(user_id, submission_id) as the sort key.
    # Same voter → same order across reloads (no jarring reshuffle), different
    # voters → different orders → position bias cancels out in aggregate.
    import hashlib
    seed_tag = f"u:{current.id}"
    subs.sort(key=lambda s: hashlib.sha256(f"{seed_tag}|{event_id}|{s.id}".encode()).hexdigest())
    out = []
    for s in subs:
        team = db.query(models.Team).get(s.team_id)
        members = [
            r.name
            for r in db.query(models.Registration)
            .join(models.TeamMember, models.TeamMember.registration_id == models.Registration.id)
            .filter(models.TeamMember.team_id == s.team_id)
            .all()
        ]
        # T3: counts from VoteAllocation (schema superset), gated by visibility
        if show_counts:
            vote_count = sum(
                v for (v,) in db.query(models.VoteAllocation.votes)
                .filter_by(submission_id=s.id, event_id=event_id).all()
            ) if db.query(models.VoteAllocation).filter_by(submission_id=s.id, event_id=event_id).first() else 0
        else:
            vote_count = 0
        my_vote = (
            db.query(models.VoteAllocation)
            .filter_by(submission_id=s.id, event_id=event_id, voter_key=f"u:{current.id}")
            .first()
            is not None
        )
        out.append(
            schemas.GalleryCard(
                id=s.id,
                event_id=s.event_id,
                team_id=s.team_id,
                title=s.title,
                tagline=s.tagline,
                description=s.description,
                repo_url=s.repo_url,
                demo_video_url=s.demo_video_url,
                tech_stack=s.tech_stack,
                extra_links=[schemas.ExtraLink(**x) for x in (s.extra_links or [])],
                live_url=s.live_url,
                track=s.track,
                custom_answers=[schemas.CustomQA(**x) for x in (s.custom_answers or [])],
                has_thumbnail=bool(s.thumbnail_path and os.path.exists(s.thumbnail_path)),
                image_count=len(s.gallery_images or []),
                team_name=team.name if team else "Team",
                team_avatar=team.avatar_url if team else None,
                members=members,
                submitted_at=s.submitted_at,
                votes=vote_count,
                my_vote=my_vote,
                votes_hidden=not show_counts,
                file_name=s.file_name,
                file_type=s.file_type,
                has_file=bool(s.file_path),
            )
        )
    return out


# ================= ROUND-WISE DELIVERABLES =================
# A submission can carry one artifact PER event round — Round 1: PPT deck,
# Round 2: prototype video, Round 3: final build — each saved independently.
# Saving a round again UPDATES its row (no duplicates).


def _deadline_of(r: dict):
    """Parse a round deadline from the JSON blob (ISO string or None)."""
    raw = r.get("deadline") if isinstance(r, dict) else None
    if not raw:
        return None
    try:
        from datetime import datetime as _dt, timezone as _tz
        dl = _dt.fromisoformat(str(raw).replace("Z", "+00:00"))
        return dl.replace(tzinfo=None) if dl.tzinfo else dl
    except Exception:
        return None


def _rounds_meta(event: models.Event) -> list:
    out = []
    for i, r in enumerate(event.rounds or []):
        if isinstance(r, dict):
            dl = _deadline_of(r)
            out.append({
                "index": i,
                "name": r.get("name") or f"Round {i + 1}",
                "description": r.get("description") or "",
                "deliverable_kind": r.get("deliverable_kind") or "any",
                "accept": r.get("accept") or "",
                "deadline": dl.isoformat() if dl else None,
                "closed": bool(dl and _now() > dl),
            })
        else:
            out.append({"index": i, "name": str(r), "description": "",
                        "deliverable_kind": "any", "accept": "", "deadline": None, "closed": False})
    return out


def _deliverable_map(db: Session, submission_id: int) -> dict:
    rows = (
        db.query(models.RoundDeliverable)
        .filter_by(submission_id=submission_id)
        .order_by(models.RoundDeliverable.round_index.asc())
        .all()
    )
    return {r.round_index: schemas.RoundDeliverableOut.model_validate(r) for r in rows}


def _serialize_rounds(event: models.Event, sub, delmap: dict, locked: bool) -> schemas.MyRoundsOut:
    rounds = []
    for meta in _rounds_meta(event):
        rounds.append({**meta, "deliverable": delmap.get(meta["index"])})
    return schemas.MyRoundsOut(
        submission_id=sub.id if sub else None,
        locked=locked,
        rounds=rounds,
    )


@router.get("/rounds/mine/{event_id}", response_model=schemas.MyRoundsOut)
def my_rounds(event_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    """My team's per-round deliverable board for an event (team view)."""
    event = db.query(models.Event).get(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    reg, team = _my_team(db, event_id, user.id)
    if user.role != "admin" and not team:
        raise HTTPException(status_code=403, detail="Register and join a team for this event first")
    sub = None
    delmap = {}
    if team:
        sub = db.query(models.Submission).filter_by(event_id=event_id, team_id=team.id).first()
        if sub:
            delmap = _deliverable_map(db, sub.id)
    return _serialize_rounds(event, sub, delmap, _locked(event))


def _guard_round_write(event: models.Event, sub, idx: int, user, db: Session):
    """Only the owning team, only a real round, only before the code-freeze,
    and only before THIS round's own deadline (organizers may override)."""
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    reg, team = _my_team(db, sub.event_id, user.id)
    if user.role != "admin" and (not team or team.id != sub.team_id):
        raise HTTPException(status_code=403, detail="Only this team's members can manage round deliverables")
    if _locked(event):
        raise HTTPException(status_code=400, detail="Submissions are frozen — the event has ended")
    meta = _rounds_meta(event)
    if idx < 0 or idx >= len(meta):
        raise HTTPException(status_code=400, detail="No such round in this event")
    m = meta[idx]
    if m.get("closed") and user.role != "admin":
        raise HTTPException(status_code=400, detail=f"Deadline passed for '{m['name']}' ({m['deadline'][:16].replace('T', ' ')} UTC)")
    return m


_ALLOWED_KINDS = ("any", "link", "file")


def _check_file_rules(meta, filename: str):
    ext = os.path.splitext(filename or "")[1].lstrip(".").lower()
    if meta["deliverable_kind"] == "link":
        raise HTTPException(status_code=400, detail="This round takes a LINK, not a file upload")
    if meta["accept"]:
        allowed = [a.strip().lstrip(".").lower() for a in meta["accept"].split(",") if a.strip()]
        if allowed and ext not in allowed:
            raise HTTPException(status_code=400, detail=f"This round only accepts: {', '.join(allowed)} (you sent .{ext or 'unknown'})")


def _upsert_deliverable(db: Session, event: models.Event, sub, idx: int, meta) -> models.RoundDeliverable:
    d = (
        db.query(models.RoundDeliverable)
        .filter_by(submission_id=sub.id, round_index=idx)
        .first()
    )
    if not d:
        d = models.RoundDeliverable(
            submission_id=sub.id, event_id=event.id, team_id=sub.team_id,
            round_index=idx, created_at=_now(), updated_at=_now(),
        )
    d.round_name = meta["name"]
    d.updated_at = _now()
    db.add(d)
    return d


@router.post("/{sub_id}/rounds/{idx}", response_model=schemas.RoundDeliverableOut)
def save_round(sub_id: int, idx: int, data: schemas.RoundDeliverableIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    sub = db.query(models.Submission).get(sub_id)
    event = db.query(models.Event).get(sub.event_id) if sub else None
    meta = _guard_round_write(event, sub, idx, user, db)
    if data.link_url and data.link_url.strip() and meta["deliverable_kind"] == "file":
        raise HTTPException(status_code=400, detail="This round requires a FILE upload, not a link")
    d = _upsert_deliverable(db, event, sub, idx, meta)
    if data.link_url is not None:
        d.link_url = data.link_url.strip() or None
    if data.note is not None:
        d.note = data.note.strip() or None
    db.commit()
    db.refresh(d)
    return schemas.RoundDeliverableOut.model_validate(d)


@router.post("/{sub_id}/rounds/{idx}/file", response_model=schemas.RoundDeliverableOut)
async def upload_round_file(sub_id: int, idx: int, file: UploadFile = File(...), user=Depends(get_current_user), db: Session = Depends(get_db)):
    sub = db.query(models.Submission).get(sub_id)
    event = db.query(models.Event).get(sub.event_id) if sub else None
    meta = _guard_round_write(event, sub, idx, user, db)
    _check_file_rules(meta, file.filename or "")
    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > MAX_UPLOAD_MB:
        raise HTTPException(status_code=400, detail=f"File too large ({size_mb:.1f} MB > {MAX_UPLOAD_MB} MB limit)")
    base = os.path.basename(file.filename or "artifact").replace(" ", "_")
    safe_name = f"round_{sub_id}_{idx}_{int(_now().timestamp())}_{base}"
    with open(os.path.join(UPLOAD_DIR, safe_name), "wb") as fh:
        fh.write(contents)
    d = _upsert_deliverable(db, event, sub, idx, meta)
    d.file_path = safe_name
    d.file_name = file.filename or base
    db.commit()
    db.refresh(d)
    return schemas.RoundDeliverableOut.model_validate(d)


@router.get("/rounds/files/{del_id}")
def download_round_file(del_id: int, db: Session = Depends(get_db)):
    d = db.query(models.RoundDeliverable).get(del_id)
    if not d or not d.file_path:
        raise HTTPException(status_code=404, detail="File not found")
    pth = os.path.join(UPLOAD_DIR, d.file_path)
    if not os.path.exists(pth):
        raise HTTPException(status_code=404, detail="File missing on server")
    return FileResponse(pth, filename=d.file_name or "artifact")


@router.get("/{sub_id}/rounds", response_model=list[schemas.RoundDeliverableOut])
def view_rounds(sub_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    """Judge/organizer view: all saved round deliverables of a submission.
    Visible to the owning team, organizers, and ASSIGNED judges only."""
    sub = db.query(models.Submission).get(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    reg, team = _my_team(db, sub.event_id, user.id)
    assigned = (
        db.query(models.JudgeAssignment)
        .filter_by(judge_id=user.id, submission_id=sub_id)
        .first()
    )
    if not (team and team.id == sub.team_id) and user.role != "admin" and not assigned:
        raise HTTPException(status_code=403, detail="Not allowed to view these deliverables")
    return list(_deliverable_map(db, sub_id).values())
