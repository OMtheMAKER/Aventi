import csv
import io
import random
import statistics

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app import models, schemas
from app.auth import get_current_user, require_admin, hash_password

router = APIRouter(prefix="/api/judging", tags=["judging"])


def require_judge(user: models.User = Depends(get_current_user)):
    """Judge-or-organizer guard. The frontend hides it; the BACKEND enforces it."""
    if user.role not in ("judge", "admin"):
        raise HTTPException(status_code=403, detail="Judges only")
    return user


def require_organizer(user: models.User = Depends(get_current_user)):
    """Organizer = the admin role on this platform (single org account model)."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Organizers only")
    return user


# ---------- organizer: judge management ----------

@router.post("/judges", response_model=schemas.JudgeOut)
def invite_judge(
    data: schemas.JudgeCreateIn,
    organizer=Depends(require_organizer),
    db: Session = Depends(get_db),
):
    existing = db.query(models.User).filter(models.User.email == data.email).first()
    if existing:
        if existing.role == "judge":
            raise HTTPException(status_code=400, detail="Already a judge")
        existing.role = "judge"
        db.commit()
        return existing
    u = models.User(
        email=data.email,
        name=data.name,
        hashed_password=hash_password(data.password),
        role="judge",
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@router.get("/judges", response_model=list[schemas.JudgeOut])
def list_judges(organizer=Depends(require_organizer), db: Session = Depends(get_db)):
    """All platform judges with workload stats — powers the tap-to-select
    suggestion cards under the invite form."""
    judges = db.query(models.User).filter(models.User.role == "judge").all()
    out = []
    for j in judges:
        assignments = db.query(models.JudgeAssignment).filter_by(judge_id=j.id).count()
        scores = db.query(models.Score).filter_by(judge_id=j.id).count()
        events = (
            db.query(models.JudgeAssignment.event_id)
            .filter_by(judge_id=j.id).distinct().count()
        )
        out.append(schemas.JudgeOut(
            id=j.id, email=j.email, name=j.name, created_at=j.created_at,
            assignments=assignments, scores=scores, events=events,
        ))
    return out


@router.delete("/judges/{judge_id}")
def remove_judge(judge_id: int, organizer=Depends(require_organizer), db: Session = Depends(get_db)):
    j = db.query(models.User).get(judge_id)
    if not j or j.role != "judge":
        raise HTTPException(status_code=404, detail="Judge not found")
    db.query(models.JudgeAssignment).filter_by(judge_id=judge_id).delete()
    db.query(models.Score).filter_by(judge_id=judge_id).delete()
    db.delete(j)
    db.commit()
    return {"deleted": True}


@router.post("/assign")
def batch_assign(
    data: schemas.AssignIn,
    organizer=Depends(require_organizer),
    db: Session = Depends(get_db),
):
    """Randomly assign 'per_submission' reviewers to every submitted project."""
    if data.judge_ids:
        judges = (
            db.query(models.User)
            .filter(models.User.role == "judge", models.User.id.in_(data.judge_ids))
            .all()
        )
        if not judges:
            raise HTTPException(status_code=400, detail="Selected judges not found")
    else:
        judges = db.query(models.User).filter(models.User.role == "judge").all()
    if not judges:
        raise HTTPException(status_code=400, detail="Invite at least one judge first")
    subs = (
        db.query(models.Submission)
        .filter_by(event_id=data.event_id, status="submitted")
        .all()
    )
    if not subs:
        raise HTTPException(status_code=400, detail="No submitted projects in this event yet")
    per = max(1, min(data.per_submission, len(judges)))
    created = 0
    # wipe and re-assignment keeps it simple for the demo
    db.query(models.JudgeAssignment).filter_by(event_id=data.event_id).delete()
    for s in subs:
        pool = judges[:]
        random.shuffle(pool)
        for j in pool[:per]:
            db.add(
                models.JudgeAssignment(
                    event_id=data.event_id, judge_id=j.id, submission_id=s.id
                )
            )
            created += 1
    db.commit()
    return {"assigned": created, "per_submission": per, "judge_count": len(judges)}


@router.get("/assignments/{event_id}")
def list_assignments(event_id: int, organizer=Depends(require_organizer), db: Session = Depends(get_db)):
    rows = (
        db.query(models.JudgeAssignment)
        .filter_by(event_id=event_id)
        .join(models.User, models.User.id == models.JudgeAssignment.judge_id)
        .join(models.Submission, models.Submission.id == models.JudgeAssignment.submission_id)
        .add_columns(models.User.name.label("judge_name"), models.Submission.title.label("sub_title"))
        .all()
    )
    return [
        {
            "id": a.JudgeAssignment.id,
            "judge_name": a.judge_name,
            "submission_title": a.sub_title,
            "submission_id": a.JudgeAssignment.submission_id,
        }
        for a in rows
    ]


# ---------- rubric helpers (T2: organizer-configurable weights) ----------

def rubric_of(event: models.Event) -> list:
    """Effective rubric for an event — organizer's own or the platform default."""
    if event and event.rubric and isinstance(event.rubric, list) and event.rubric:
        return event.rubric
    return [dict(c) for c in schemas.DEFAULT_RUBRIC]


def rubric_total(rubric: list) -> int:
    return sum(int(c.get("weight", 0)) for c in rubric)


def validate_rubric(rubric: list) -> list:
    """Organizer-supplied rubric → cleaned rows, or HTTPException."""
    if not rubric:
        return None
    clean = []
    for c in rubric:
        # accept both pydantic models and plain dicts
        name = getattr(c, "name", None)
        weight = getattr(c, "weight", None)
        if name is None and isinstance(c, dict):
            name, weight = c.get("name"), c.get("weight")
        name = str(name or "").strip()
        try:
            w = int(weight or 0)
        except (TypeError, ValueError):
            w = 0
        if not name:
            raise HTTPException(status_code=400, detail="Every rubric criterion needs a name")
        if not (1 <= w <= 100):
            raise HTTPException(status_code=400, detail=f"Weight for '{name}' must be 1-100%")
        clean.append({"name": name, "weight": w})
    if len(clean) > 10:
        raise HTTPException(status_code=400, detail="Max 10 rubric criteria")
    if rubric_total(clean) != 100:
        raise HTTPException(status_code=400, detail=f"Rubric weights must sum to 100 (got {rubric_total(clean)})")
    names = [c["name"].lower() for c in clean]
    if len(set(names)) != len(names):
        raise HTTPException(status_code=400, detail="Criterion names must be unique")
    return clean


# ---------- judge: my queue + scoring ----------

@router.get("/preview-queue/{judge_id}", response_model=list[schemas.JudgeQueueItem])
def preview_queue(judge_id: int, organizer=Depends(require_organizer), db: Session = Depends(get_db)):
    """ORGANIZER ONLY: see the judge bench exactly as a chosen judge sees it
    (read-only preview — the admin 'View as Judge' panel)."""
    jt = db.query(models.User).get(judge_id)
    if not jt or jt.role != "judge":
        raise HTTPException(status_code=404, detail="Judge not found")
    return _queue_items_for(jt, db)


@router.get("/queue", response_model=list[schemas.JudgeQueueItem])
def my_queue(judge=Depends(require_judge), db: Session = Depends(get_db)):
    return _queue_items_for(judge, db)


def _queue_items_for(judge, db: Session):
    assigns = (
        db.query(models.JudgeAssignment)
        .filter_by(judge_id=judge.id)
        .order_by(models.JudgeAssignment.created_at.asc())
        .all()
    )
    items = []
    for a in assigns:
        s = db.query(models.Submission).get(a.submission_id)
        team = db.query(models.Team).get(s.team_id) if s else None
        event = db.query(models.Event).get(s.event_id) if s else None
        my_score = (
            db.query(models.Score)
            .filter_by(submission_id=s.id, judge_id=judge.id)
            .first()
        )
        # prefill: use the saved breakdown when present; LEGACY rows (four fixed
        # columns) map back onto the rubric's criterion names, case-insensitively
        prefill = None
        if my_score:
            if my_score.breakdown:
                prefill = my_score.breakdown
            else:
                legacy = {
                    "innovation": my_score.innovation,
                    "execution": my_score.execution,
                    "impact": my_score.impact,
                    "presentation": my_score.presentation,
                }
                prefill = {
                    c["name"]: legacy[c["name"].lower()]
                    for c in rubric_of(event)
                    if c["name"].lower() in legacy and legacy[c["name"].lower()] is not None
                } or None
        items.append(
            schemas.JudgeQueueItem(
                submission_id=s.id,
                event_id=s.event_id,
                title=s.title,
                tagline=s.tagline,
                team_name=team.name if team else None,
                repo_url=s.repo_url,
                demo_video_url=s.demo_video_url,
                tech_stack=s.tech_stack,
                description=s.description,
                rubric=rubric_of(event),
                my_breakdown=prefill,
                deliverables=[
                    {
                        "id": d.id,
                        "round_name": d.round_name,
                        "link_url": d.link_url,
                        "file_name": d.file_name,
                        "note": d.note,
                    }
                    for d in db.query(models.RoundDeliverable)
                    .filter_by(submission_id=s.id)
                    .order_by(models.RoundDeliverable.round_index.asc())
                    .all()
                ],
                scored=bool(my_score),
                my_score_id=my_score.id if my_score else None,
            )
        )
    return items


@router.post("/score/{submission_id}", response_model=schemas.ScoreOut)
def score(
    submission_id: int,
    data: schemas.ScoreIn,
    judge=Depends(require_judge),
    db: Session = Depends(get_db),
):
    # backend role isolation: only ASSIGNED judges may score a submission
    if judge.role != "admin":
        assigned = (
            db.query(models.JudgeAssignment)
            .filter_by(judge_id=judge.id, submission_id=submission_id)
            .first()
        )
        if not assigned:
            raise HTTPException(status_code=403, detail="This submission is not assigned to you")
    sub = db.query(models.Submission).get(submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")
    event = db.query(models.Event).get(sub.event_id)
    rubric = rubric_of(event)

    # canonicalize to a breakdown dict keyed by criterion name
    if data.breakdown is not None:
        breakdown = {}
        for c in rubric:
            v = data.breakdown.get(c["name"])
            if v is None:
                raise HTTPException(status_code=400, detail=f"Missing score for '{c['name']}'")
            try:
                iv = int(v)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f"'{c['name']}' must be a whole number 1-10")
            if not (1 <= iv <= 10):
                raise HTTPException(status_code=400, detail=f"'{c['name']}' must be 1-10")
            breakdown[c["name"]] = iv
    else:
        # legacy fixed four criteria, mapped onto the default rubric names
        if any(getattr(data, f) is None for f in ("innovation", "execution", "impact", "presentation")):
            raise HTTPException(status_code=400, detail="Score every rubric criterion")
        legacy = {
            "innovation": data.innovation,
            "execution": data.execution,
            "impact": data.impact,
            "presentation": data.presentation,
        }
        for k, v in legacy.items():
            if not (1 <= int(v) <= 10):
                raise HTTPException(status_code=400, detail=f"{k} must be 1-10")
        breakdown = {
            c["name"]: legacy.get(c["name"].lower(), data.innovation) for c in rubric
        }

    # legacy mirror columns: match when criterion has this exact legacy name,
    # else 0 (old DBs have NOT NULL on these; weighted() uses breakdown anyway)
    mirrors = {
        "innovation": breakdown.get("Innovation", 0),
        "execution": breakdown.get("Execution", 0),
        "impact": breakdown.get("Impact", 0),
        "presentation": breakdown.get("Presentation", 0),
    }
    existing = (
        db.query(models.Score)
        .filter_by(submission_id=submission_id, judge_id=judge.id)
        .first()
    )
    if existing:
        existing.breakdown = breakdown
        existing.rubric_snapshot = rubric
        for k, v in mirrors.items():
            setattr(existing, k, v)
        existing.comment = data.comment
        db.commit()
        db.refresh(existing)
        out = schemas.ScoreOut.model_validate(existing)
        out.judge_name = judge.name
        _fire_score(db, event.id, existing, judge)
        return out
    s = models.Score(
        submission_id=submission_id,
        judge_id=judge.id,
        breakdown=breakdown,
        rubric_snapshot=rubric,
        **mirrors,
        comment=data.comment,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    out = schemas.ScoreOut.model_validate(s)
    out.judge_name = judge.name
    _fire_score(db, event.id, s, judge)
    return out


def _fire_score(db: Session, event_id: int, sc: models.Score, judge):
    """T4: score.created webhook."""
    from app.t4webhooks import fire
    from app.antifraud import audit
    fire(db, event_id, "score.created", {
        "score_id": sc.id, "submission_id": sc.submission_id, "judge": judge.email,
        "breakdown": sc.breakdown, "comment": sc.comment,
    }, audit)


def weighted(s: models.Score) -> float:
    """Weighted total (0-10) from a score row against its saved rubric snapshot."""
    if s.breakdown:
        rubric = s.rubric_snapshot or [c for c in getattr(s, "rubric_snapshot", None) or []]
        if not rubric:
            # fall back to equal weights across whatever was scored
            keys = list(s.breakdown.keys())
            if not keys:
                return 0.0
            return round(sum(float(s.breakdown[k]) for k in keys) / len(keys), 3)
        tot = 0.0
        for c in rubric:
            v = s.breakdown.get(c["name"])
            if v is not None:
                tot += float(v) * (float(c["weight"]) / 100.0)
        return round(tot, 3)
    # legacy fixed-criteria rows (seeded/old): 30/30/20/20
    if s.innovation is None:
        return 0.0
    return round(
        s.innovation * 0.3 + s.execution * 0.3 + s.impact * 0.2 + s.presentation * 0.2, 3
    )


def normalized_leaderboard(db: Session, event_id: int):
    """Cross-judge normalization: z-score each judge's marks, average per submission."""
    subs = (
        db.query(models.Submission)
        .filter_by(event_id=event_id, status="submitted")
        .all()
    )
    rows = []
    for s in subs:
        team = db.query(models.Team).get(s.team_id)
        scores = db.query(models.Score).filter_by(submission_id=s.id).all()
        rows.append((s, team, scores))

    # z-score across this event's judge pools
    by_judge = {}
    for _, _, scores in rows:
        for sc in scores:
            by_judge.setdefault(sc.judge_id, []).append(weighted(sc))
    judge_stats = {
        j: (statistics.mean(vals), statistics.pstdev(vals) or 1)
        for j, vals in by_judge.items()
    }

    out = []
    for s, team, scores in rows:
        per_judge = []
        for sc in scores:
            mean, sd = judge_stats[sc.judge_id]
            w = weighted(sc)
            per_judge.append({"judge_id": sc.judge_id, "raw": round(w, 2), "z": round((w - mean) / sd, 3)})
        avg_raw = round(sum(p["raw"] for p in per_judge) / len(per_judge), 2) if per_judge else 0
        avg_z = round(sum(p["z"] for p in per_judge) / len(per_judge), 3) if per_judge else 0
        out.append(
            {
                "submission_id": s.id,
                "title": s.title,
                "team_name": team.name if team else None,
                "reviewers": len(per_judge),
                "avg_raw": avg_raw,
                "avg_normalized": avg_z,
                "per_judge": per_judge,
            }
        )
    out.sort(key=lambda x: x["avg_normalized"], reverse=True)
    for i, r in enumerate(out):
        r["rank"] = i + 1
    return out


@router.get("/leaderboard/{event_id}")
def leaderboard(event_id: int, organizer=Depends(require_organizer), db: Session = Depends(get_db)):
    return normalized_leaderboard(db, event_id)


@router.get("/export/{event_id}.csv")
def export_csv(event_id: int, organizer=Depends(require_organizer), db: Session = Depends(get_db)):
    lb = normalized_leaderboard(db, event_id)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["rank", "submission_id", "title", "team_name", "reviewers", "avg_raw", "avg_normalized_z"])
    for r in lb:
        w.writerow([r["rank"], r["submission_id"], r["title"], r["team_name"], r["reviewers"], r["avg_raw"], r["avg_normalized"]])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=event-{event_id}-results.csv"},
    )
