from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app import models, schemas
from app.auth import get_current_user

router = APIRouter(prefix="/api/events", tags=["events"])


def status_of(e: models.Event) -> str:
    now = datetime.utcnow()
    if now < e.start_date:
        return "upcoming"
    if now > e.end_date:
        return "past"
    return "ongoing"


@router.get("", response_model=list[schemas.EventOut])
def list_events(db: Session = Depends(get_db)):
    out = []
    for e in db.query(models.Event).order_by(models.Event.start_date.desc()).all():
        d = schemas.EventOut.model_validate(e)
        d.status = status_of(e)
        out.append(d)
    return out


@router.get("/{slug}", response_model=schemas.EventOut)
def get_event(slug: str, db: Session = Depends(get_db)):
    e = db.query(models.Event).filter(models.Event.slug == slug).first()
    if not e:
        raise HTTPException(status_code=404, detail="Event not found")
    d = schemas.EventOut.model_validate(e)
    d.status = status_of(e)
    return d
