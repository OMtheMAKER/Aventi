import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from app.db import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    # user (participant) | admin (organizer) | judge
    # team-lead and viewer exist as relations, not roles: a participant with
    # teams.created_by == their id is a team leader; an anonymous guest is a viewer.
    role = Column(String, default="user")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class LoginLog(Base):
    __tablename__ = "login_logs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    login_at = Column(DateTime, default=datetime.datetime.utcnow)
    ip = Column(String, nullable=True)


class Event(Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # which admin made it
    tagline = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    # rich briefing — creator-controlled
    about = Column(Text, nullable=True)           # "About the hackathon" long text
    rules = Column(JSON, default=lambda: [])      # list[str]
    rounds = Column(JSON, default=lambda: [])     # list[{name, description}]
    eligibility = Column(String, nullable=True)
    judging_criteria = Column(JSON, default=lambda: [])  # list[str]
    # contact / community — creator inputs at creation time
    contact_email = Column(String, nullable=True)
    whatsapp_group = Column(String, nullable=True)  # group invite link
    discord_group = Column(String, nullable=True)   # server invite link
    # team constraints the organizer wants
    min_team_size = Column(Integer, default=1)
    max_team_size = Column(Integer, default=4)
    mode = Column(String, default="Online")  # Online | Offline | Hybrid
    location = Column(String, nullable=True)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    registration_deadline = Column(DateTime, nullable=True)
    prize_pool = Column(String, nullable=True)
    tracks = Column(JSON, default=lambda: [])
    cover = Column(String, default="#6366f1")
    # how the event page is displayed: treasure_map | quest_map | timeline
    display_style = Column(String, default="treasure_map")
    # which fields the event's registration form asks for
    form_fields = Column(
        JSON,
        default=lambda: {
            "name": True,
            "age": False,
            "gender": True,
            "institution": False,
            "college_year": False,
            "email": True,
            "phone": False,
            "whatsapp_invite": True,
            "discord_invite": True,
            "github_url": True,
            "linkedin_url": True,
            "skills": False,
            "portfolio_url": False,
        },
    )
    # organizer-defined custom questions for the SUBMISSION form (T1):
    # e.g. "What makes your project unique?" — answered by teams in the editor
    submission_questions = Column(JSON, default=lambda: [])  # list[str]
    # organizer-configurable weighted judging rubric (T2):
    # list of {"name": str, "weight": int} where weights sum to 100
    rubric = Column(JSON, default=lambda: None)  # None → default 30/30/20/20
    # T3: community voting configuration
    vote_access = Column(String, default="authenticated")  # open | email | authenticated
    vote_mode = Column(String, default="simple")           # simple | quadratic
    max_picks = Column(Integer, default=3)                 # simple mode: max projects a voter may support
    vote_credits = Column(Integer, default=9)              # quadratic mode: total credits per ballot
    voting_open_at = Column(DateTime, nullable=True)       # voting window start (None = now)
    voting_close_at = Column(DateTime, nullable=True)      # voting window end (None = open-ended)
    results_published = Column(Integer, default=0)         # 1 → results public even during window
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Registration(Base):
    __tablename__ = "registrations"
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    age = Column(Integer, nullable=True)
    gender = Column(String, nullable=True)  # male | female | other / prefer not to say
    institution = Column(String, nullable=True)
    college_year = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    whatsapp_invite = Column(String, nullable=True)  # participant's WhatsApp number
    discord_invite = Column(String, nullable=True)   # participant's Discord ID
    github_url = Column(String, nullable=True)
    linkedin_url = Column(String, nullable=True)
    skills = Column(String, nullable=True)
    portfolio_url = Column(String, nullable=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    team_code = Column(String, nullable=True)  # cached invite code so members see their team instantly
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Team(Base):
    __tablename__ = "teams"
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    tagline = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)  # emoji or image URL
    thumbnail_path = Column(String, nullable=True)  # uploaded team cover image
    is_open = Column(Integer, default=1)  # 1 = others can request to join
    max_members = Column(Integer, default=4)
    invite_code = Column(String, unique=True, index=True, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class TeamMember(Base):
    __tablename__ = "team_members"
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False, index=True)
    registration_id = Column(Integer, ForeignKey("registrations.id"), nullable=False)
    joined_at = Column(DateTime, default=datetime.datetime.utcnow)


# ---------- T1: submissions (fixed field set), gallery ----------
class Submission(Base):
    __tablename__ = "submissions"
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False, index=True)
    # fixed, spec-defined field set — organizers configure NOTHING here
    title = Column(String, nullable=False)
    tagline = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    repo_url = Column(String, nullable=True)
    demo_video_url = Column(String, nullable=True)
    tech_stack = Column(String, nullable=True)
    extra_links = Column(JSON, default=lambda: [])  # list[{label, url}]
    # optional file the team uploaded from their desktop (mp4/ppt/pdf/zip/…)
    file_path = Column(String, nullable=True)   # server-side storage path
    file_name = Column(String, nullable=True)   # original upload name
    file_type = Column(String, nullable=True)   # mp4 | ppt | pdf | zip | other
    # T1 field-set completion: thumbnail, image gallery, live link, track, custom Q&A
    thumbnail_path = Column(String, nullable=True)      # card cover image (uploaded)
    gallery_images = Column(JSON, default=lambda: [])   # list[str] of uploaded screenshot paths
    track = Column(String, nullable=True)               # one of event.tracks[].name
    live_url = Column(String, nullable=True)            # deployed app / live demo link
    custom_answers = Column(JSON, default=lambda: [])   # list[{question, answer}]
    status = Column(String, default="draft")  # draft | submitted
    submitted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)


# ---------- T2: judging ----------
class JudgeAssignment(Base):
    __tablename__ = "judge_assignments"
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)
    judge_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Score(Base):
    __tablename__ = "scores"
    id = Column(Integer, primary_key=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False, index=True)
    judge_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # legacy fixed criteria (kept for old rows; mirrored from breakdown when saved)
    innovation = Column(Integer, nullable=True)
    execution = Column(Integer, nullable=True)
    impact = Column(Integer, nullable=True)
    presentation = Column(Integer, nullable=True)
    # T2: per-criterion values matching the event rubric — {name: 1-10}
    breakdown = Column(JSON, default=lambda: None)
    # snapshot of the rubric used at scoring time (so results stay explainable
    # even if the organizer edits the rubric later)
    rubric_snapshot = Column(JSON, default=lambda: None)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)


# ---------- T3: public vote + comments ----------
class Vote(Base):
    """Legacy T2-era table kept for schema history. T3 voting lives in
    VoteAllocation (identity-flexible: auth user / verified e-mail / IP fallback)."""
    __tablename__ = "votes"
    id = Column(Integer, primary_key=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class VoteAllocation(Base):
    """One row per (ballot, submission): the voter's allocation to that project.
    voter_key identifies the ballot according to the event's vote_access mode:
      authenticated → "u:{user_id}"      (bound to the account)
      email        → "e:{normalized_email}" (verified by magic-link style token)
      open         → "ip:{sha256(ip|ua|salt)}" (best-effort, rate-limited)
    `votes` = number of votes allocated (simple mode: always 1).
    """
    __tablename__ = "vote_allocations"
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False, index=True)
    voter_key = Column(String, nullable=False, index=True)
    votes = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class VoteVerifyToken(Base):
    """Email-gated access: one-time code sent to (or shown for) an email address.
    Self-hosted/offline first — no SMTP required: the code is returned in dev
    mode and can optionally be relayed by the organiser. Hash-stored, one-shot,
    expiring."""
    __tablename__ = "vote_verify_tokens"
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)
    email_norm = Column(String, nullable=False, index=True)  # canonicalised email
    code_hash = Column(String, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Comment(Base):
    __tablename__ = "comments"
    id = Column(Integer, primary_key=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    body = Column(Text, nullable=False)
    removed = Column(Integer, default=0)  # organiser moderation toggle, keeps row for audit
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class AuditLog(Base):
    """Append-only event feed an organiser can read in the UI — the T3
    'audit trail without a database client'. action convention:
    vote.cast / vote.update / comment.create / comment.remove /
    results.publish / results.hide / voting.config / abuse.flag ..."""
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True, index=True)  # None = platform-level
    actor_key = Column(String, nullable=False)   # who did it: "u:4" / "e:foo@x" / "ip:h3lp" / "system"
    action = Column(String, nullable=False, index=True)
    detail = Column(String, nullable=True)       # human-readable summary
    meta = Column(JSON, default=lambda: None)    # machine-readable extras
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# ---------- event chat (community feature) ----------
class ChatMessage(Base):
    """Per-event community lounge. channel='general' — every registered
    participant can post; channel='announce' — only organizer/admin/judges
    post, everyone reads & reacts. removed keeps the row for the audit trail."""
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)
    channel = Column(String, default="general")  # general | announce | team
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True, index=True)  # set only for channel=team
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    body = Column(Text, nullable=False)
    removed = Column(Integer, default=0)         # moderator soft-delete; row kept
    reported = Column(Integer, default=0)        # participant flag for moderators
    report_reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ChatReaction(Base):
    """Emoji reactions on a chat message — one row per (message, user, emoji)."""
    __tablename__ = "chat_reactions"
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)
    message_id = Column(Integer, ForeignKey("chat_messages.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    emoji = Column(String, nullable=False)       # 👍 ❤️ 😂 🎉 🔥
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ChatBan(Base):
    """Moderator-mute: banned users can read but not post to general."""
    __tablename__ = "chat_bans"
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    reason = Column(String, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# ---------- T4: webhooks + certificates ----------
class Webhook(Base):
    """Organiser-registered outbound HTTP hook. `events` = JSON list of the
    event types it fires on (e.g. ["registration.created", "score.created"]).
    Secret signs every delivery (X-Platform-Signature: sha256=HMAC)."""
    __tablename__ = "webhooks"
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)
    url = Column(String, nullable=False)
    secret = Column(String, nullable=False)      # HMAC key for signatures
    events = Column(JSON, default=lambda: [])    # list[str]; empty = subscribe to all
    active = Column(Integer, default=1)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class WebhookDelivery(Base):
    """Delivery log per (webhook, event) — visible in the UI; the 'did it
    fire?' answer without a DB client."""
    __tablename__ = "webhook_deliveries"
    id = Column(Integer, primary_key=True)
    webhook_id = Column(Integer, ForeignKey("webhooks.id"), nullable=False, index=True)
    event_type = Column(String, nullable=False)
    payload = Column(JSON, nullable=True)
    status_code = Column(Integer, nullable=True)   # remote HTTP status (or None=network fail)
    response_excerpt = Column(String, nullable=True)
    attempts = Column(Integer, default=1)
    ok = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Certificate(Base):
    """Printable, publicly verifiable record: participation / winner / judge.
    cert_code is unguessable&short; verify endpoint is public (no login)."""
    __tablename__ = "certificates"
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)        # participation | winner | judge
    cert_code = Column(String, unique=True, index=True, nullable=False)
    meta = Column(JSON, default=lambda: None)    # payload shown on the cert + verifier
    signature = Column(String, nullable=False)   # hmac over canonical payload
    revoked = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class RoundDeliverable(Base):
    """Per-round artifact a team attaches to its submission — Round 1 might be a
    PPT deck, Round 2 a prototype video, etc. One row per (submission, round_index);
    re-saving a round UPDATES that row (no duplicates)."""
    __tablename__ = "round_deliverables"
    id = Column(Integer, primary_key=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False, index=True)
    round_index = Column(Integer, nullable=False)     # position inside event.rounds[]
    round_name = Column(String, nullable=True)        # snapshot (survives later renames)
    link_url = Column(String, nullable=True)          # drive / youtube / figma / anything
    note = Column(Text, nullable=True)                # "what changed in this round"
    file_path = Column(String, nullable=True)         # stored upload (optional)
    file_name = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False)
    updated_at = Column(DateTime, nullable=False)
