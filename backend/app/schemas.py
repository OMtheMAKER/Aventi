from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict


class UserCreate(BaseModel):
    email: str
    name: str
    password: str
    role: str = "user"


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class LoginIn(BaseModel):
    email: str
    password: str
    role: Optional[str] = None


class AdminCreate(BaseModel):
    name: str
    email: str
    password: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None  # if set ("admin"/"user"), the account's role must match


class SocialIn(BaseModel):
    provider: str


# Default registration form: just the essentials (name is locked on), plus the
# contact handles organizers actually need — WhatsApp number, email, Discord ID
# and the professional IDs (GitHub / LinkedIn). Creators can switch anything
# else on per event.
DEFAULT_FORM_FIELDS = {
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
    # submission-level: creator decides whether teams must give their project's
    # GitHub repo link — it then shows below the project in the gallery
    "project_repo": True,
}

DISPLAY_STYLES = {
    "treasure_map",
    "desert_map",
    "world_map",
    "board_map",
    "town_map",
    "quest_map",
    "timeline",
}


class EventRound(BaseModel):
    name: str
    description: str = ""
    deliverable_kind: str = "any"          # any | link | file — what this round takes
    accept: str = ""                       # comma-separated extensions, e.g. "ppt,pptx,pdf"
    deadline: Optional[datetime] = None    # per-round cutoff (UTC); organizer-set


class RubricCriterion(BaseModel):
    name: str
    weight: int  # percentage; all criteria weights must sum to 100


class EventCreate(BaseModel):
    title: str
    tagline: Optional[str] = None
    description: Optional[str] = None
    about: Optional[str] = None
    rules: List[str] = []
    rounds: List[EventRound] = []
    eligibility: Optional[str] = None
    judging_criteria: List[str] = []
    contact_email: Optional[str] = None
    whatsapp_group: Optional[str] = None
    discord_group: Optional[str] = None
    min_team_size: int = 1
    max_team_size: int = 4
    mode: str = "Online"
    location: Optional[str] = None
    start_date: datetime
    end_date: datetime
    registration_deadline: Optional[datetime] = None
    prize_pool: Optional[str] = None
    tracks: List[dict] = []
    cover: str = "#6366f1"
    display_style: str = "treasure_map"
    form_fields: dict = {}
    submission_questions: List[str] = []  # organizer-defined custom questions (T1)
    rubric: Optional[List[RubricCriterion]] = None  # custom weighted rubric (T2)


class EventOut(BaseModel):
    id: int
    slug: str
    title: str
    tagline: Optional[str]
    description: Optional[str]
    about: Optional[str] = None
    rules: Any = []
    rounds: Any = []
    eligibility: Optional[str] = None
    judging_criteria: Any = []
    contact_email: Optional[str] = None
    whatsapp_group: Optional[str] = None
    discord_group: Optional[str] = None
    min_team_size: int = 1
    max_team_size: int = 4
    mode: str
    location: Optional[str]
    start_date: datetime
    end_date: datetime
    registration_deadline: Optional[datetime]
    prize_pool: Optional[str]
    tracks: Any = []
    cover: str
    display_style: str = "treasure_map"
    form_fields: dict = {}
    submission_questions: Any = []
    rubric: Any = None  # effective rubric [{name, weight}]; falls back to DEFAULT_RUBRIC in responses
    created_at: datetime
    status: str = ""
    model_config = ConfigDict(from_attributes=True)


class RegistrationIn(BaseModel):
    event_id: int
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    institution: Optional[str] = None
    college_year: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp_invite: Optional[str] = None
    discord_invite: Optional[str] = None
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    skills: Optional[str] = None
    portfolio_url: Optional[str] = None
    team_name: Optional[str] = None
    invite_code: Optional[str] = None


class RegistrationOut(BaseModel):
    id: int
    event_id: int
    user_id: int
    name: str
    age: Optional[int]
    gender: Optional[str] = None
    institution: Optional[str]
    college_year: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    whatsapp_invite: Optional[str]
    discord_invite: Optional[str]
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    skills: Optional[str] = None
    portfolio_url: Optional[str] = None
    team_id: Optional[int]
    team_code: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)





class AdminRegistrationRow(RegistrationOut):
    user_email: Optional[str] = None
    team_name: Optional[str] = None


class AddMemberIn(BaseModel):
    user_email: str


class TeamOut(BaseModel):
    id: int
    event_id: int
    name: str
    tagline: Optional[str] = None
    avatar_url: Optional[str] = None
    is_open: int = 1
    max_members: int = 4
    invite_code: str
    created_by: int
    has_thumbnail: bool = False
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    tagline: Optional[str] = None
    avatar_url: Optional[str] = None
    is_open: Optional[bool] = None
    max_members: Optional[int] = None


class TeamCardOut(BaseModel):
    """Public-ish card for the team hub — one team's summary."""
    id: int
    event_id: int
    name: str
    tagline: Optional[str] = None
    avatar_url: Optional[str] = None
    has_thumbnail: bool = False
    is_open: int = 1
    max_members: int = 4
    member_count: int = 0
    members: List[dict] = []
    created_by: int
    created_at: Optional[datetime] = None


class ContestantRow(BaseModel):
    user_id: int
    name: str
    email: str
    last_login: Optional[datetime]
    events: List[str] = []
    registrations: int = 0


# ---------- Submissions (T1) ----------
class ExtraLink(BaseModel):
    label: str
    url: str


class CustomQA(BaseModel):
    question: str
    answer: str


class SubmissionIn(BaseModel):
    title: str
    tagline: Optional[str] = None
    description: Optional[str] = None
    repo_url: Optional[str] = None
    demo_video_url: Optional[str] = None
    tech_stack: Optional[str] = None
    extra_links: List[ExtraLink] = []
    # T1 field set: live link, track choice, organizer's custom questions
    live_url: Optional[str] = None
    track: Optional[str] = None
    custom_answers: List[CustomQA] = []


class SubmissionOut(SubmissionIn):
    id: int
    event_id: int
    team_id: int
    team_name: Optional[str] = None
    team_avatar: Optional[str] = None
    status: str
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    has_thumbnail: bool = False
    image_count: int = 0
    submitted_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class GalleryCard(BaseModel):
    id: int
    event_id: int
    team_id: int
    title: str
    tagline: Optional[str]
    description: Optional[str]
    repo_url: Optional[str]
    demo_video_url: Optional[str]
    tech_stack: Optional[str]
    extra_links: List[ExtraLink] = []
    live_url: Optional[str] = None
    track: Optional[str] = None
    custom_answers: List[CustomQA] = []
    has_thumbnail: bool = False
    image_count: int = 0
    team_name: str
    team_avatar: Optional[str]
    members: List[str] = []
    submitted_at: Optional[datetime]
    votes: int = 0
    my_vote: bool = False
    votes_hidden: bool = False   # T3: tallies hidden while the voting window is live
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    has_file: bool = False


class VoteOut(BaseModel):
    votes: int
    my_vote: bool


# ---------- T3: community voting ----------
class VotingConfigIn(BaseModel):
    vote_access: Optional[str] = None        # open | email | authenticated
    vote_mode: Optional[str] = None          # simple | quadratic
    max_picks: Optional[int] = None          # simple: max projects a ballot may pick
    vote_credits: Optional[int] = None       # quadratic: credits per ballot
    voting_open_at: Optional[datetime] = None
    voting_close_at: Optional[datetime] = None


class VotingConfigOut(BaseModel):
    vote_access: str = "authenticated"
    vote_mode: str = "simple"
    max_picks: int = 3
    vote_credits: int = 9
    voting_open_at: Optional[datetime] = None
    voting_close_at: Optional[datetime] = None
    results_published: int = 0
    voting_open: bool = False                # computed: window currently active
    results_visible: bool = False            # computed: published OR window closed


class BallotAllocation(BaseModel):
    submission_id: int
    votes: int = 1                           # simple mode always 1


class BallotIn(BaseModel):
    allocations: List[BallotAllocation] = []  # full replacement of the voter's ballot
    email: Optional[str] = None              # required when access == email
    email_token: Optional[str] = None        # the session token returned after code confirm


class BallotOut(BaseModel):
    voter_key: str
    access_mode: str
    mode: str
    credits_total: int
    credits_spent: int
    picks_used: int
    max_picks: int
    allocations: List[BallotAllocation] = []


class VerifyRequestIn(BaseModel):
    email: str


class VerifyRequestOut(BaseModel):
    ok: bool
    dev_code: Optional[str] = None           # self-hosted: no SMTP — code shown to organiser/dev flow
    detail: str = ""


class VerifyConfirmIn(BaseModel):
    email: str
    code: str


class VerifyConfirmOut(BaseModel):
    ok: bool
    email_token: Optional[str] = None        # present this with every ballot write


class TallyRow(BaseModel):
    submission_id: int
    title: str
    team_name: Optional[str] = None
    votes: int = 0                           # total vote-units (quadratic: sum of allocations)
    ballots: int = 0                         # number of distinct voters supporting it


class ResultsOut(BaseModel):
    event_id: int
    published: bool
    tally: List[TallyRow] = []
    voters: int = 0                          # distinct voter_keys in the event


class AuditRow(BaseModel):
    id: int
    event_id: Optional[int]
    actor_key: str
    action: str
    detail: Optional[str] = None
    meta: Any = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class CommentIn(BaseModel):
    body: str


class CommentOut(BaseModel):
    id: int
    body: str
    user_name: str
    user_id: Optional[int] = None   # lets the UI show a delete button to the author
    removed: int = 0                # organiser-moderated (kept for audit, hidden from public)
    created_at: datetime


# ---------- Judging (T2) ----------
class JudgeCreateIn(BaseModel):
    email: str
    name: str
    password: str


class JudgeOut(BaseModel):
    id: int
    email: str
    name: str
    created_at: datetime
    assignments: int = 0   # total review jobs ever assigned
    scores: int = 0        # total projects scored
    events: int = 0        # distinct events judged in
    model_config = ConfigDict(from_attributes=True)


class AssignIn(BaseModel):
    event_id: int
    per_submission: int = 2        # reviewers per project
    judge_ids: Optional[list[int]] = None  # optional shortlist — unset = all judges


class ScoreIn(BaseModel):
    """T2: judge sends values keyed by rubric criterion NAME.
    Legacy callers may send the four fixed fields instead — both are accepted."""
    breakdown: Optional[dict] = None       # {criterion_name: 1-10}
    innovation: Optional[int] = None       # legacy
    execution: Optional[int] = None        # legacy
    impact: Optional[int] = None           # legacy
    presentation: Optional[int] = None     # legacy
    comment: Optional[str] = None


# (RubricCriterion is defined near EventRound at the top so EventCreate can use it)


class ScoreOut(BaseModel):
    id: int
    submission_id: int
    judge_id: int
    judge_name: Optional[str] = None
    breakdown: Optional[dict] = None
    rubric_snapshot: Optional[list] = None
    innovation: Optional[int] = None
    execution: Optional[int] = None
    impact: Optional[int] = None
    presentation: Optional[int] = None
    comment: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class JudgeQueueItem(BaseModel):
    submission_id: int
    event_id: int
    title: str
    tagline: Optional[str]
    team_name: Optional[str]
    repo_url: Optional[str]
    demo_video_url: Optional[str]
    tech_stack: Optional[str]
    description: Optional[str]
    rubric: list = []  # this event's effective rubric: [{name, weight}]
    my_breakdown: Optional[dict] = None  # prefill when re-scoring
    deliverables: list = []              # per-round artifacts: [{round_name, link_url, file_name, note}]
    scored: bool = False
    my_score_id: Optional[int] = None


# default judging rubric — organizer can override per event (T2)
DEFAULT_RUBRIC = [
    {"name": "Innovation", "weight": 30},
    {"name": "Execution", "weight": 30},
    {"name": "Impact", "weight": 20},
    {"name": "Presentation", "weight": 20},
]


class TeamInviteIn(BaseModel):
    # one of these — leader picks how they invite
    email: Optional[str] = None
    username: Optional[str] = None


# ---------- round-wise deliverables ----------
class RoundDeliverableIn(BaseModel):
    link_url: Optional[str] = None
    note: Optional[str] = None


class RoundDeliverableOut(BaseModel):
    id: int
    round_index: int
    round_name: Optional[str] = None
    link_url: Optional[str] = None
    note: Optional[str] = None
    file_name: Optional[str] = None
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class MyRoundsOut(BaseModel):
    submission_id: Optional[int] = None
    locked: bool = False
    rounds: list   # [{index, name, description, deliverable: RoundDeliverableOut|None}]
