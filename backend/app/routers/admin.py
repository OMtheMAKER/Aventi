import random
import re
import string

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app import models, schemas
from app.auth import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


def gen_code(n=6):
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))


def make_slug(title: str, db: Session) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-") or "event"
    base, i = slug, 2
    while db.query(models.Event).filter_by(slug=slug).first():
        slug = f"{base}-{i}"
        i += 1
    return slug


@router.get("/stats")
def stats(admin=Depends(require_admin), db: Session = Depends(get_db)):
    return {
        "users": db.query(models.User).filter(models.User.role == "user").count(),
        "admins": db.query(models.User).filter(models.User.role == "admin").count(),
        "events": db.query(models.Event).count(),
        "registrations": db.query(models.Registration).count(),
        "teams": db.query(models.Team).count(),
    }


@router.get("/events")
def admin_events(admin=Depends(require_admin), db: Session = Depends(get_db)):
    out = []
    for e in db.query(models.Event).order_by(models.Event.start_date.desc()).all():
        regs = db.query(models.Registration).filter_by(event_id=e.id).count()
        out.append(
            {
                "id": e.id,
                "title": e.title,
                "slug": e.slug,
                "mode": e.mode,
                "display_style": e.display_style,
                "registrations": regs,
                "start_date": e.start_date,
                "end_date": e.end_date,
            }
        )
    return out


@router.post("/events", response_model=schemas.EventOut)
def create_event(
    data: schemas.EventCreate,
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    if data.end_date <= data.start_date:
        raise HTTPException(status_code=400, detail="End date must be after start date")
    if data.display_style not in schemas.DISPLAY_STYLES:
        raise HTTPException(status_code=400, detail="Unknown display style")
    fields = {**schemas.DEFAULT_FORM_FIELDS, **(data.form_fields or {})}
    fields["name"] = True  # name is always required
    min_sz = max(1, int(data.min_team_size or 1))
    max_sz = max(min_sz, int(data.max_team_size or 4))
    # T2: organizer-configurable weighted rubric (None → platform default)
    from app.routers.judging import validate_rubric
    rubric = validate_rubric([r.model_dump() for r in (data.rubric or [])] or None)
    # Convenience: criteria named at creation time automatically become the
    # weighted rubric (equal split summing to 100) so organizers never type a
    # criterion twice — weights stay editable afterwards in the Judging tab.
    crit_names = [c.strip() for c in (data.judging_criteria or []) if c and c.strip()][:10]
    if not rubric and crit_names:
        base, rem = divmod(100, len(crit_names))
        rubric = [{"name": n, "weight": base + (1 if i < rem else 0)} for i, n in enumerate(crit_names)]
    e = models.Event(
        slug=make_slug(data.title, db),
        title=data.title,
        created_by=admin.id,
        tagline=data.tagline,
        description=data.description,
        about=data.about,
        rules=[r for r in (data.rules or []) if r and r.strip()],
        rounds=[r.model_dump(mode="json") for r in (data.rounds or []) if r.name and r.name.strip()],
        eligibility=data.eligibility,
        judging_criteria=[c for c in (data.judging_criteria or []) if c and c.strip()],
        contact_email=data.contact_email,
        whatsapp_group=data.whatsapp_group,
        discord_group=data.discord_group,
        min_team_size=min_sz,
        max_team_size=max_sz,
        mode=data.mode,
        location=data.location,
        start_date=data.start_date,
        end_date=data.end_date,
        registration_deadline=data.registration_deadline,
        prize_pool=data.prize_pool,
        tracks=data.tracks or [],
        cover=data.cover,
        display_style=data.display_style,
        form_fields=fields,
        submission_questions=[q for q in (data.submission_questions or []) if q and str(q).strip()],
        rubric=rubric,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    out = schemas.EventOut.model_validate(e)
    return out


@router.delete("/events/{event_id}")
def delete_event(event_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    e = db.query(models.Event).get(event_id)
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    # cascade: remove submissions (+votes/comments/assignments/scores), teams, members, registrations
    for s in db.query(models.Submission).filter_by(event_id=event_id).all():
        db.query(models.Vote).filter_by(submission_id=s.id).delete()
        db.query(models.Comment).filter_by(submission_id=s.id).delete()
        db.query(models.JudgeAssignment).filter_by(submission_id=s.id).delete()
        db.query(models.Score).filter_by(submission_id=s.id).delete()
        db.delete(s)
    db.query(models.JudgeAssignment).filter_by(event_id=event_id).delete()
    for t in db.query(models.Team).filter_by(event_id=event_id).all():
        db.query(models.TeamMember).filter_by(team_id=t.id).delete()
        db.delete(t)
    db.query(models.Registration).filter_by(event_id=event_id).delete()
    db.delete(e)
    db.commit()
    return {"deleted": True}


@router.get("/events/{event_id}/registrations", response_model=list[schemas.AdminRegistrationRow])
def event_registrations_full(
    event_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)
):
    rows = []
    regs = db.query(models.Registration).filter_by(event_id=event_id).all()
    for r in regs:
        row = schemas.AdminRegistrationRow.model_validate(r)
        u = db.query(models.User).get(r.user_id)
        row.user_email = u.email if u else None
        if r.team_id:
            t = db.query(models.Team).get(r.team_id)
            if t:
                row.team_name = t.name
                row.team_code = t.invite_code
        rows.append(row)
    return rows


@router.post("/events/{event_id}/members", response_model=schemas.AdminRegistrationRow)
def add_member(
    event_id: int,
    data: schemas.AddMemberIn,
    admin=Depends(require_admin),
    db: Session = Depends(get_db),
):
    event = db.query(models.Event).get(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    user = db.query(models.User).filter(models.User.email == data.user_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="No user with that email")
    if db.query(models.Registration).filter_by(event_id=event_id, user_id=user.id).first():
        raise HTTPException(status_code=400, detail="User already registered in this event")
    reg = models.Registration(
        event_id=event_id,
        user_id=user.id,
        name=user.name,
        email=user.email,
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)
    row = schemas.AdminRegistrationRow.model_validate(reg)
    row.user_email = user.email
    return row


@router.delete("/registrations/{registration_id}")
def remove_member(
    registration_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)
):
    reg = db.query(models.Registration).get(registration_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")
    if reg.team_id:
        db.query(models.TeamMember).filter_by(registration_id=reg.id).delete()
        remaining = db.query(models.TeamMember).filter_by(team_id=reg.team_id).count()
        if remaining == 0:
            t = db.query(models.Team).get(reg.team_id)
            if t:
                db.delete(t)
    db.delete(reg)
    db.commit()
    return {"deleted": True}


@router.get("/contestants/{user_id}/detail")
def contestant_detail(user_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    """Everything a participant ever submitted — profile across all events."""
    u = db.query(models.User).get(user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    last = (
        db.query(models.LoginLog)
        .filter_by(user_id=user_id)
        .order_by(models.LoginLog.login_at.desc())
        .first()
    )
    regs = []
    for r in db.query(models.Registration).filter_by(user_id=user_id).all():
        ev = db.query(models.Event).get(r.event_id)
        team = db.query(models.Team).get(r.team_id) if r.team_id else None
        row = schemas.RegistrationOut.model_validate(r).model_dump()
        row["event_title"] = ev.title if ev else None
        row["event_slug"] = ev.slug if ev else None
        row["team_name"] = team.name if team else None
        regs.append(row)
    return {
        "user": {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role,
            "created_at": u.created_at,
        },
        "last_login": last.login_at if last else None,
        "registrations": regs,
    }


@router.get("/contestants", response_model=list[schemas.ContestantRow])
def contestants(admin=Depends(require_admin), db: Session = Depends(get_db)):
    rows = []
    for u in db.query(models.User).filter(models.User.role == "user").all():
        last = (
            db.query(models.LoginLog)
            .filter_by(user_id=u.id)
            .order_by(models.LoginLog.login_at.desc())
            .first()
        )
        regs = db.query(models.Registration).filter_by(user_id=u.id).all()
        evs = []
        for r in regs:
            e = db.query(models.Event).get(r.event_id)
            if e:
                evs.append(e.title)
        rows.append(
            schemas.ContestantRow(
                user_id=u.id,
                name=u.name,
                email=u.email,
                last_login=last.login_at if last else None,
                events=evs,
                registrations=len(regs),
            )
        )
    return rows


# ---------- T2: CSV export at EVERY stage ----------

import csv
import io
from fastapi.responses import Response


def _csv_response(rows, header, filename):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow(r)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/registrations/{event_id}.csv")
def export_registrations(event_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    """Stage 1: who registered for this event."""
    regs = db.query(models.Registration).filter_by(event_id=event_id).all()
    rows = []
    for r in regs:
        team = db.query(models.Team).get(r.team_id) if r.team_id else None
        rows.append([
            r.id, r.user_id, r.name, r.email or "", r.institution or "",
            r.phone or "", r.github_url or "",
            team.name if team else "(no team)", r.created_at.isoformat(),
        ])
    return _csv_response(
        rows,
        ["registration_id", "user_id", "name", "email", "institution",
         "phone", "github_url", "team", "registered_at"],
        f"event-{event_id}-registrations.csv",
    )


@router.get("/export/submissions/{event_id}.csv")
def export_submissions(event_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    """Stage 2: every project submission (drafts + submitted)."""
    subs = db.query(models.Submission).filter_by(event_id=event_id).all()
    rows = []
    for s in subs:
        team = db.query(models.Team).get(s.team_id)
        votes = db.query(models.Vote).filter_by(submission_id=s.id).count()
        rows.append([
            s.id, s.title, team.name if team else "", s.track or "",
            s.status, s.repo_url or "", s.live_url or "", s.demo_video_url or "",
            s.tech_stack or "", votes,
            s.submitted_at.isoformat() if s.submitted_at else "",
        ])
    return _csv_response(
        rows,
        ["submission_id", "title", "team", "track", "status", "repo_url",
         "live_url", "demo_video_url", "tech_stack", "votes", "submitted_at"],
        f"event-{event_id}-submissions.csv",
    )


@router.get("/export/scores/{event_id}.csv")
def export_scores(event_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    """Stage 3: RAW per-criterion scores, one row per judge×submission (audit trail)."""
    scores = (
        db.query(models.Score)
        .join(models.Submission, models.Submission.id == models.Score.submission_id)
        .filter(models.Submission.event_id == event_id)
        .all()
    )
    # collect all criterion names across rubrics used in this event
    crit_names = []
    for sc in scores:
        for c in (sc.rubric_snapshot or []):
            if c["name"] not in crit_names:
                crit_names.append(c["name"])
    if not crit_names:
        crit_names = ["Innovation", "Execution", "Impact", "Presentation"]
    from app.routers.judging import weighted
    header = ["score_id", "submission", "judge"] + crit_names + ["weighted_total", "comment", "scored_at"]
    rows = []
    for sc in scores:
        sub = db.query(models.Submission).get(sc.submission_id)
        judge = db.query(models.User).get(sc.judge_id)
        breakdown = sc.breakdown or {}
        legacy = {"Innovation": sc.innovation, "Execution": sc.execution,
                  "Impact": sc.impact, "Presentation": sc.presentation}
        row = [sc.id, sub.title if sub else "", judge.name if judge else ""]
        for name in crit_names:
            v = breakdown.get(name, legacy.get(name))
            row.append(v if v is not None else "")
        row += [weighted(sc), (sc.comment or "").replace("\n", " "), sc.created_at.isoformat()]
        rows.append(row)
    return _csv_response(rows, header, f"event-{event_id}-raw-scores.csv")


@router.get("/export/judges/{event_id}.csv")
def export_judges_progress(event_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    """Stage 4: judges, their assignment counts, and how much they've finished."""
    judges = db.query(models.User).filter(models.User.role == "judge").all()
    assigns = db.query(models.JudgeAssignment).filter_by(event_id=event_id).all()
    rows = []
    for j in judges:
        my = [a for a in assigns if a.judge_id == j.id]
        scored = sum(
            1 for a in my
            if db.query(models.Score).filter_by(submission_id=a.submission_id, judge_id=j.id).first()
        )
        rows.append([j.id, j.name, j.email, len(my), scored,
                     f"{(scored / len(my) * 100) if my else 0:.0f}%"])
    return _csv_response(
        rows,
        ["judge_id", "name", "email", "assigned", "scored", "completion"],
        f"event-{event_id}-judges.csv",
    )


@router.get("/export/votes/{event_id}.csv")
def export_votes(event_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    """Stage 5: community votes + comments for the public gallery."""
    subs = db.query(models.Submission).filter_by(event_id=event_id).all()
    rows = []
    for s in subs:
        team = db.query(models.Team).get(s.team_id)
        votes = db.query(models.Vote).filter_by(submission_id=s.id).count()
        comments = db.query(models.Comment).filter_by(submission_id=s.id).count()
        rows.append([s.id, s.title, team.name if team else "", votes, comments])
    return _csv_response(
        rows,
        ["submission_id", "title", "team", "votes", "comments"],
        f"event-{event_id}-votes.csv",
    )
