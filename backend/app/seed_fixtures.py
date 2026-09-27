# DOGFOOD 2026 — acceptance fix #1: load the official fixtures.json into the
# portal at every boot (idempotent). The official acceptance checker (run.py)
# pokes this data; the fixture event's submission close date is in the past,
# so late submissions must be refused — which the fixture event proves.
#
# Layout this code expects to find fixtures.json:
#   - local dev: <repo>/fixtures.json            (this file = <repo>/backend/app/seed_fixtures.py)
#   - docker:    /app/fixtures.json              (Dockerfile copies it next to /app/app)
import os
import json
import datetime

_HERE = os.path.abspath(__file__)
_FIXTURE_CANDIDATES = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(_HERE))), "fixtures.json"),
    os.path.join(os.path.dirname(os.path.dirname(_HERE)), "fixtures.json"),
    "/fixtures.json",
]

# Deterministic ids so pre-minted checker tokens in .dogfood.toml stay valid
# on every machine (fresh seed or self-healed existing db).
ORG_ID, PARTICIPANT_ID = 9001, 9002
JUDGE_BASE, MEMBER_BASE, REG_BASE = 9100, 9200, 9300
TEAM_BASE, TM_BASE, PROJ_BASE = 9400, 9500, 9600
SCORE_BASE, ASSIGN_BASE = 9700, 9800
EVENT_ID = 9000
EVENT_SLUG = "dogfood-fixture-sprint"


def _find_fixtures():
    for c in _FIXTURE_CANDIDATES:
        if os.path.isfile(c):
            return c
    return None


def _iso(ts):
    return datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)


def import_dogfood_fixtures(db, models, hash_password):
    """Idempotent: does nothing once the fixture event exists."""
    if db.query(models.Event).filter_by(id=EVENT_ID).first():
        return False
    path = _find_fixtures()
    if not path:
        return False
    with open(path, encoding="utf-8") as f:
        fx = json.load(f)

    fxe = fx.get("event", {})
    close = _iso(fxe.get("submissions_close", "2026-03-01T18:00:00Z"))
    tracks = fx.get("tracks") or []
    judges = fx.get("judges") or []
    teams = fx.get("teams") or []
    projects = fx.get("projects") or []
    scores = fx.get("scores") or []

    def ensure_user(uid, email, name, role="user"):
        u = db.query(models.User).filter_by(id=uid).first()
        if not u:
            u = models.User(id=uid, email=email, name=name, role=role,
                            hashed_password=hash_password("fixture123"))
            db.add(u)
            db.flush()
        return u

    org = ensure_user(ORG_ID, "organizer@dogfood.dev", "Fixture Organizer", "admin")
    ensure_user(PARTICIPANT_ID, "participant@dogfood.dev", "Fixture Participant", "user")

    ev = models.Event(
        id=EVENT_ID, slug=EVENT_SLUG, created_by=org.id,
        title=fxe.get("name", "Sample Hack 2026"),
        tagline="DOGFOOD 2026 acceptance fixtures — the same data every portal is checked against.",
        description="Seeded automatically from the official fixtures.json. This event's submission window is closed (per the fixtures), so it double-serves as proof that deadline enforcement holds.",
        about="Fixture event for the DOGFOOD acceptance checker (run.py).",
        tracks=[t.get("name", "") for t in tracks],
        mode="Online",
        start_date=close - datetime.timedelta(days=3),
        end_date=close,
        registration_deadline=close - datetime.timedelta(days=1),
        prize_pool="Fixture badges",
        display_style="treasure_map",
    )
    db.add(ev)

    judge_ids = {}
    for i, j in enumerate(judges):
        uid = JUDGE_BASE + 1 + i
        ensure_user(uid, j.get("email", f"judge{i}@fixtures.dev"), j.get("name", f"Judge {i}"), "judge")
        judge_ids[j.get("id")] = uid

    member_by_email = {}
    member_seq = 0
    def member_user(email):
        nonlocal member_seq
        email = email or f"anon{member_seq}@fixtures.dev"
        if email not in member_by_email:
            uid = MEMBER_BASE + 1 + member_seq
            member_seq += 1
            member_by_email[email] = uid
            ensure_user(uid, email, email.split("@")[0].replace(".", " ").title(), "user")
        return member_by_email[email]

    team_ids = {}
    for i, t in enumerate(teams):
        members = t.get("members") or []
        captain_id = member_user(members[0] if members else None)
        tid = TEAM_BASE + 1 + i
        reg = models.Registration(id=REG_BASE + 1 + i, event_id=EVENT_ID,
                                  user_id=captain_id,
                                  name=db.query(models.User).get(captain_id).name,
                                  team_id=tid, team_code=f"FIXTURE{i:03d}")
        db.add(reg)
        db.add(models.Team(id=tid, event_id=EVENT_ID, name=t.get("name", f"Team {i}"),
                           tagline="fixture team", invite_code=f"FIXTURE{i:03d}",
                           created_by=captain_id))
        db.add(models.TeamMember(id=TM_BASE + 1 + i, team_id=tid,
                                 registration_id=REG_BASE + 1 + i))
        team_ids[t.get("id")] = tid

    track_names = {t.get("id"): t.get("name") for t in tracks}
    project_ids = {}
    for i, p in enumerate(projects):
        sid = PROJ_BASE + 1 + i
        sub = models.Submission(
            id=sid, event_id=EVENT_ID, team_id=team_ids.get(p.get("team")),
            title=p.get("title", f"Project {i}"),
            tagline=p.get("summary", ""),
            description=p.get("summary", ""),
            repo_url=p.get("repo_url"),
            track=track_names.get(p.get("track")),
            status="submitted",
            submitted_at=_iso(p["submitted_at"]) if p.get("submitted_at") else close - datetime.timedelta(hours=4),
        )
        db.add(sub)
        project_ids[p.get("id")] = sid

    assign_seq = 0
    seen_assign = set()
    for i, s in enumerate(scores):
        jid = judge_ids.get(s.get("judge"))
        sid = project_ids.get(s.get("project"))
        if not jid or not sid:
            continue
        if (jid, sid) not in seen_assign:
            seen_assign.add((jid, sid))
            db.add(models.JudgeAssignment(id=ASSIGN_BASE + 1 + assign_seq,
                                          event_id=EVENT_ID, judge_id=jid,
                                          submission_id=sid))
            assign_seq += 1
        db.add(models.Score(id=SCORE_BASE + 1 + i, submission_id=sid, judge_id=jid,
                            breakdown=s.get("criteria") or {},
                            comment=s.get("comment") or ""))

    db.commit()
    print(f"[seed] DOGFOOD fixtures loaded from {path}: "
          f"{len(projects)} projects, {len(judges)} judges, {len(scores)} scores")
    return True
