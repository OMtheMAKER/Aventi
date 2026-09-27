import datetime
import os
import random
import string

from app.db import engine, SessionLocal
from app import models
from app.auth import hash_password


def gen_code(n=6):
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))


def _migrate(engine_):
    """Tiny additive auto-migration: create_all won't ALTER existing tables,
    so add any newly-introduced columns by hand (SQLite: ALTER ADD COLUMN)."""
    additions = {
        "submissions": {
            "thumbnail_path": "VARCHAR",
            "gallery_images": "JSON",
            "track": "VARCHAR",
            "live_url": "VARCHAR",
            "custom_answers": "JSON",
        },
        "events": {
            "submission_questions": "JSON",
            "rubric": "JSON",
            # T3 community-voting config
            "vote_access": "VARCHAR DEFAULT 'authenticated'",
            "vote_mode": "VARCHAR DEFAULT 'simple'",
            "max_picks": "INTEGER DEFAULT 3",
            "vote_credits": "INTEGER DEFAULT 9",
            "voting_open_at": "DATETIME",
            "voting_close_at": "DATETIME",
            "results_published": "INTEGER DEFAULT 0",
        },
        "comments": {
            "removed": "INTEGER DEFAULT 0",
        },
        "scores": {
            "breakdown": "JSON",
            "rubric_snapshot": "JSON",
        },
        "chat_messages": {
            "team_id": "INTEGER",
        },
        "teams": {
            "thumbnail_path": "VARCHAR",
        },
    }
    from sqlalchemy import inspect, text
    insp = inspect(engine_)
    for table, cols in additions.items():
        if not insp.has_table(table):
            continue
        existing = {c["name"] for c in insp.get_columns(table)}
        with engine_.begin() as conn:
            for col, typ in cols.items():
                if col not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {typ}"))
    models.Base.metadata.create_all(bind=engine_)  # idempotent: also picks up
    #                                        # newer tables (chat_*, t4) on boot
    # T4 tables (webhooks, deliveries, certificates) — create_all won't touch
    # existing DBs' schemas, so make sure the new tables exist:
    from app.db import Base
    import app.models as _m
    for t in ("webhooks", "webhook_deliveries", "certificates"):
        if not insp.has_table(t):
            Base.metadata.tables[t].create(bind=engine_)


def seed():
    models.Base.metadata.create_all(bind=engine)
    _migrate(engine)
    db = SessionLocal()
    try:
        if db.query(models.User).first():
            # Demo events roll forward: if the seeded voting window has fully
            # closed, reopen it around "now" so the platform is always demoable
            # (idempotent — a live event mid-window is left untouched).
            now_r = datetime.datetime.utcnow()
            for ev in db.query(models.Event).all():
                if ev.voting_close_at and ev.voting_close_at < now_r:
                    ev.voting_open_at = now_r - datetime.timedelta(hours=2)
                    ev.voting_close_at = now_r + datetime.timedelta(days=7)
                    ev.results_published = 0
            db.commit()
            return  # already seeded

        now = datetime.datetime.utcnow()

        admin = models.User(
            email="admin@platform.dev",
            name="Platform Admin",
            hashed_password=hash_password("admin123"),
            role="admin",
        )
        db.add(admin)

        # a demo judge so the judging flow is testable out of the box
        judge = models.User(
            email="judge@demo.dev",
            name="Judge Dana",
            hashed_password=hash_password("judge123"),
            role="judge",
        )
        db.add(judge)

        demo_users = []
        for email, name in [
            ("alice@demo.dev", "Alice Sharma"),
            ("bob@demo.dev", "Bob Verma"),
            ("carol@demo.dev", "Carol Singh"),
            ("dave@demo.dev", "Dave Rao"),
        ]:
            u = models.User(
                email=email,
                name=name,
                hashed_password=hash_password("password123"),
                role="user",
            )
            db.add(u)
            demo_users.append(u)
        db.commit()

        events = [
            models.Event(
                slug="genai-sprint-2026",
                title="GenAI Sprint 2026",
                tagline="48-hour build sprint for AI builders",
                description=(
                    "A fast-paced online hackathon for teams building generative-AI "
                    "products. Ship a working demo, present to judges, and win prizes."
                ),
                about=(
                    "GenAI Sprint is our flagship online hackathon for builders working with "
                    "generative AI — agents, RAG pipelines, copilots, creative tools, evals "
                    "and everything in between.\n\nOver 48 hours you go from a blank repo to a "
                    "working demo. Mentors from our sponsor network hang out on Discord the "
                    "whole weekend, and every team that submits gets written judge feedback "
                    "within a week.\n\nWhether this is your first hackathon or your fifteenth, "
                    "the sprint format is designed to be welcoming: form a team of 1-4, pick a "
                    "track, and build something you'd actually use."
                ),
                rules=[
                    "Teams of 1-4 people; one submission per team.",
                    "Projects must be built during the hackathon — frameworks, libraries and AI tools are fine, pre-existing projects are not.",
                    "Your code must be in a public repository with an OSI-approved license (MIT/Apache-2.0).",
                    "The submission deadline is hard — late submissions are not judged.",
                    "Be respectful: code of conduct violations mean instant disqualification.",
                    "Judges' decisions are final.",
                ],
                rounds=[
                    {"name": "Round 1 — Idea & Team", "description": "Register, form your team (1-4 members), and lock your track choice. Mentors help you scope the idea to 48 hours."},
                    {"name": "Round 2 — Build Sprint", "description": "The 48-hour build window. Two mentor check-ins and one mid-sprint demo keep you on track. Push code to your public repo as you go."},
                    {"name": "Round 3 — Submit & Demo", "description": "Freeze code, submit your repo + 3-minute demo video, and present to the judges. Winners are announced at the closing ceremony."},
                ],
                eligibility="Open to students and professionals worldwide, solo or in a team of up to 4.",
                judging_criteria=[
                    "Innovation — is the idea fresh and useful?",
                    "Execution — does the demo actually work?",
                    "Impact — who benefits and how much?",
                    "Presentation — clarity of the video and demo.",
                ],
                contact_email="genai@raptors.dev",
                whatsapp_group="https://chat.whatsapp.com/genai-sprint-2026",
                discord_group="https://discord.gg/raptors-genai",
                min_team_size=1,
                max_team_size=4,
                mode="Online",
                start_date=now - datetime.timedelta(days=1),
                end_date=now + datetime.timedelta(days=2),
                registration_deadline=now + datetime.timedelta(hours=12),
                prize_pool="$5,000",
                tracks=[
                    {"name": "Best AI Agent", "prize": "$2,000"},
                    {"name": "Best Use of RAG", "prize": "$1,500"},
                    {"name": "People's Choice", "prize": "$1,500"},
                ],
                submission_questions=[
                    "What makes your project stand out from existing tools?",
                    "Which LLM / model did you use, and why?",
                    "What's the hardest technical problem you solved?",
                ],
                cover="#6366f1",
                display_style="treasure_map",
            ),
            models.Event(
                slug="web3-builders-meet",
                title="Web3 Builders Meet",
                tagline="On-chain apps hackathon",
                description=(
                    "Hybrid event in Mumbai for builders creating decentralized "
                    "applications. Mentors from leading protocols on site."
                ),
                about=(
                    "A 3-day hybrid hackathon for anyone shipping on-chain products — "
                    "DeFi, wallets, infra, consumer crypto.\n\nDay 1 is workshops and team "
                    "formation; days 2-3 are pure build time with protocol mentors on site in "
                    "Mumbai and online."
                ),
                rules=[
                    "Teams of 2-4; solo entries allowed but pairing up is encouraged.",
                    "Code must be written at the event; smart-contract boilerplates are permitted.",
                    "Deploy to a public testnet by the deadline and link it in your submission.",
                ],
                rounds=[
                    {"name": "Round 1 — Workshops", "description": "Hands-on sessions: wallets, contracts, indexing. Pick your problem statement here."},
                    {"name": "Round 2 — Build", "description": "48 hours of building with mentors from leading protocols."},
                    {"name": "Round 3 — Pitch", "description": "5-minute pitches to the investor-judge panel."},
                ],
                eligibility="Anyone 16+. Mumbai venue on request; fully remote is fine too.",
                judging_criteria=["Technical depth", "On-chain correctness", "User experience"],
                contact_email="web3@raptors.dev",
                discord_group="https://discord.gg/raptors-web3",
                min_team_size=2,
                max_team_size=4,
                mode="Hybrid",
                location="Mumbai, IN",
                start_date=now + datetime.timedelta(days=6),
                end_date=now + datetime.timedelta(days=8),
                registration_deadline=now + datetime.timedelta(days=5),
                prize_pool="$3,000",
                tracks=[{"name": "Best DeFi", "prize": "$1,500"}],
                cover="#0ea5e9",
                display_style="quest_map",
            ),
            models.Event(
                slug="cloud-native-jam",
                title="Cloud Native Jam",
                tagline="Last edition — recap",
                description=(
                    "Our previous edition focused on scalable, cloud-native "
                    "architectures. Results are published; registrations are closed."
                ),
                about="A past edition of our infra-focused jam. Browse the archive.",
                rules=["Results are final.", "Winners have been paid out."],
                rounds=[
                    {"name": "Round 1 — Design", "description": "Architecture proposals."},
                    {"name": "Round 2 — Ship", "description": "Production-ready deployments."},
                ],
                eligibility="Closed edition.",
                min_team_size=1,
                max_team_size=4,
                mode="Online",
                start_date=now - datetime.timedelta(days=20),
                end_date=now - datetime.timedelta(days=18),
                registration_deadline=now - datetime.timedelta(days=22),
                prize_pool="$2,000",
                tracks=[{"name": "Best Scalability", "prize": "$800"}],
                cover="#f59e0b",
                display_style="timeline",
            ),
        ]
        for e in events:
            db.add(e)
        db.commit()

        # Trial event — LIVE right now; Round 1 (PPT submission) closes TODAY.
        trial = models.Event(
            slug="trial-round-1-ppt",
            title="Trial Sprint — PPT Round LIVE",
            tagline="First round: upload your deck by end of today",
            description=(
                "A live trial hackathon to test the full submission flow. Today is Round 1: "
                "upload a PPT (or PDF/video) of your idea. Rounds 2+ update daily."
            ),
            about=(
                "This is a live trial event created to test the end-to-end pipeline: register, form a team, upload deliverables, get judged.\n\nRound 1 is a PPT-only round — tonight's submissions lock at midnight. Judges score decks tomorrow; the public leaderboard on this page updates as scores arrive."
            ),
            rules=[
                "Teams of 1-4 persons.",
                "Round 1: PPT/PDF only — max 50 MB, uploaded via the Submit panel on this page.",
                "Submissions lock at the event end time.",
            ],
            rounds=[
                {"name": "Round 1 — PPT Submission (TODAY)", "description": "Upload your pitch-deck (PPT/PPTX/PDF, ≤50 MB) from the Submit panel below your team. Judges get decks tonight."},
                {"name": "Round 2 — Prototype Build", "description": "48-hour build window once Round 1 results drop."},
                {"name": "Round 3 — Final Demo", "description": "Live demo to the judge panel."},
            ],
            eligibility="Open to anyone testing the platform",
            judging_criteria=["Clarity of idea (30%)", "Feasibility (30%)", "Impact (20%)", "Presentation (20%)"],
            contact_email="trial@raptors.dev",
            discord_group="https://discord.gg/raptors-trial",
            min_team_size=1,
            max_team_size=4,
            mode="Online",
            start_date=now - datetime.timedelta(hours=2),
            end_date=now + datetime.timedelta(hours=22),
            registration_deadline=now + datetime.timedelta(hours=10),
            prize_pool="Trial badges 🏅",
            tracks=[{"name": "Best Deck", "prize": "🏅 Badge"}],
            cover="#e11d48",
            display_style="board_map",
        )
        db.add(trial)
        db.commit()

        # Sample registration + team on the live event
        reg = models.Registration(
            event_id=events[0].id,
            user_id=demo_users[0].id,
            name="Alice Sharma",
            age=21,
            gender="female",
            institution="IIT Bombay",
            college_year="3rd Year",
            email="alice@demo.dev",
            phone="9000000001",
            whatsapp_invite="+91 90000 00001",
            discord_invite="alice_sharma#0001",
            github_url="https://github.com/alice-sharma",
            linkedin_url="https://linkedin.com/in/alice-sharma",
            skills="Python, FastAPI, React, LLMs",
            portfolio_url="https://alice.dev",
        )
        db.add(reg)
        db.commit()

        team = models.Team(
            event_id=events[0].id,
            name="Neural Knights",
            tagline="We fine-tune until it works",
            avatar_url="🧠",
            is_open=1,
            max_members=4,
            invite_code=gen_code(),
            created_by=demo_users[0].id,
        )
        db.add(team)
        db.commit()

        reg.team_id = team.id
        db.add(models.TeamMember(team_id=team.id, registration_id=reg.id))

        # A second team with an open slot, for the team hub demo
        reg2 = models.Registration(
            event_id=events[0].id,
            user_id=demo_users[1].id,
            name="Bob Verma",
            age=22,
            gender="male",
            institution="BITS Pilani",
            college_year="4th Year",
            email="bob@demo.dev",
            phone="9000000002",
        )
        db.add(reg2)
        db.commit()
        team2 = models.Team(
            event_id=events[0].id,
            name="Prompt Pirates",
            tagline="Sailing the latent space 🏴‍☠️",
            avatar_url="🏴‍☠️",
            is_open=1,
            max_members=4,
            invite_code=gen_code(),
            created_by=demo_users[1].id,
        )
        db.add(team2)
        db.commit()
        reg2.team_id = team2.id
        reg2.team_code = team2.invite_code
        db.add(models.TeamMember(team_id=team2.id, registration_id=reg2.id))

        # Demo team cover thumbnails (copied from the bundled stock library).
        import os as _os, shutil as _sh
        for _team, _asset in [(team, "brain.jpg"), (team2, "cybercity.jpg")]:
            _src = _os.path.join(_os.path.dirname(__file__), "stock_thumbs", _asset)
            _dst_dir = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), "data", "uploads")
            _os.makedirs(_dst_dir, exist_ok=True)
            _dst = _os.path.join(_dst_dir, f"team_thumb_{_team.id}.jpg")
            _sh.copy(_src, _dst)
            _team.thumbnail_path = _dst

        # One submitted sample project per team so the gallery & judging flows
        # are visible immediately.
        sub1 = models.Submission(
            event_id=events[0].id,
            team_id=team.id,
            title="RAGatouille",
            tagline="Grounded answers from your messy docs",
            description=(
                "An agentic RAG platform that ingests a team's scattered docs and returns "
                "answers with citations. Built in 48 hours with FastAPI + React.\n\n"
                "Highlights: hybrid retrieval, citation tracing, one-command docker run."
            ),
            repo_url="https://github.com/neural-knights/RAGatouille",
            demo_video_url="https://example.com/demo/ragatouille.mp4",
            tech_stack="Python, FastAPI, React, SQLite, FAISS",
            live_url="https://ragatouille.example.dev",
            track="Best Use of RAG",
            extra_links=[{"label": "Architecture notes", "url": "https://ragatouille.example.dev/arch"}],
            custom_answers=[
                {"question": "What makes your project stand out from existing tools?",
                 "answer": "Every answer links back to the exact doc snippet it came from — verifiable citations, no hallucinated sources."},
                {"question": "Which LLM / model did you use, and why?",
                 "answer": "A local 7B model for privacy, with FAISS hybrid retrieval in front."},
                {"question": "What's the hardest technical problem you solved?",
                 "answer": "Citation tracing through multi-hop retrieval without leaking context windows."},
            ],
            status="submitted",
            submitted_at=now - datetime.timedelta(hours=5),
        )
        db.add(sub1)
        sub2 = models.Submission(
            event_id=events[0].id,
            team_id=team2.id,
            title="PromptShip",
            tagline="Ship your prompts like code",
            description=(
                "A prompt-versioning and eval platform: commit prompts, run evals, diff "
                "versions, roll back when it regresses.\n\n"
                "One-command local docker compose; evals run fully offline."
            ),
            repo_url="https://github.com/prompt-pirates/PromptShip",
            demo_video_url="https://example.com/demo/promptship.mp4",
            tech_stack="Python, FastAPI, React, SQLite",
            live_url="https://promptship.example.dev",
            track="Best AI Agent",
            custom_answers=[
                {"question": "Which LLM / model did you use, and why?",
                 "answer": "Model-agnostic — CI-style evals run against any endpoint."},
            ],
            extra_links=[],
            status="submitted",
            submitted_at=now - datetime.timedelta(hours=3),
        )
        db.add(sub2)
        db.commit()

        # T1 demo: attach bundled cover thumbnails to the two sample projects
        # (seed_assets/ ships inside the repo — copy to the uploads dir)
        import shutil
        ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed_assets")
        UPLOADS = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "data", "uploads"
        )
        os.makedirs(UPLOADS, exist_ok=True)
        for sub, asset in ((sub1, "ragatouille.png"), (sub2, "promptship.png")):
            src = os.path.join(ASSETS, asset)
            if os.path.exists(src):
                dst = os.path.abspath(os.path.join(UPLOADS, f"thumb_{sub.id}.png"))
                shutil.copyfile(src, dst)
                sub.thumbnail_path = dst
        db.commit()

        # Give the demo judge both submissions assigned with one reviewed score
        db.add(models.JudgeAssignment(event_id=events[0].id, judge_id=judge.id, submission_id=sub1.id))
        db.add(models.JudgeAssignment(event_id=events[0].id, judge_id=judge.id, submission_id=sub2.id))
        db.add(
            models.Score(
                submission_id=sub1.id,
                judge_id=judge.id,
                innovation=8,
                execution=9,
                impact=7,
                presentation=8,
                comment="Clean RAG answer-tracing. Solid 48h demo.",
            )
        )

        # ---- T3 demo: community voting on GenAI Sprint 2026 ----
        # Quadratic mode, authenticated access, window open for a week.
        ev = events[0]
        ev.vote_access = "authenticated"
        ev.vote_mode = "quadratic"
        ev.vote_credits = 9
        ev.max_picks = 3
        ev.voting_open_at = now - datetime.timedelta(hours=2)
        ev.voting_close_at = now + datetime.timedelta(days=7)
        # Reviews from a few demo users (not their own team) — makes results visible
        from app.antifraud import audit as _audit
        demo_ballots = [
            (demo_users[2].id, sub2.id, 2),   # carol → PromptShip ×2 (cost 4)
            (demo_users[2].id, sub1.id, 2),   # carol → RAGatouille ×2 (cost 4) = 8/9
            (demo_users[1].id, sub1.id, 1),   # bob → RAGatouille ×1
        ]
        for uid, sid, v in demo_ballots:
            if not db.query(models.VoteAllocation).filter_by(event_id=ev.id, submission_id=sid, voter_key=f"u:{uid}").first():
                db.add(models.VoteAllocation(event_id=ev.id, submission_id=sid, voter_key=f"u:{uid}", votes=v))
        db.commit()
        _audit(db, ev.id, "system", "voting.config", "seeded: quadratic, 9 credits, window open")
        if demo_users[2].id:
            _audit(db, ev.id, f"u:{demo_users[2].id}", "vote.cast", "2 allocation(s)", {"scripted_seed": True})
            _audit(db, ev.id, f"u:{demo_users[1].id}", "vote.cast", "1 allocation(s)", {"scripted_seed": True})
        db.commit()
    finally:
        db.close()
