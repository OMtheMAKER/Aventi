# ⚡ Aventi Platform

**Where the Future is Built** — an open-source, self-hostable **full-lifecycle hackathon platform**.
Registration → Teams → Round-wise Deliverables → Judging → Community Voting → Results → Certificates — in **one** app, with **one** command.

🌐 **Live demo (try it now):** https://aventi-dz0q.onrender.com &nbsp;·&nbsp; 🎬 **Demo video (2:50):** https://youtu.be/ZOX9ZrZ9x4E
*(free-tier demo sleeps when idle — first load ~30s)*

| | |
|---|---|
| **Stack** | FastAPI (Python) + React (Vite) + Tailwind + SQLite — no cloud, no external DB, no paid APIs |
| **Run it** | `docker compose up --build` → http://localhost:8000 |
| **Verify it** | **152/152 acceptance checks passing** (5 runnable suites in `tests/`) |
| **Host it** | Runs fully offline after the image is built |

---

## 📑 Table of contents

1. [What Aventi is (and why)](#-what-aventi-is-and-why)
2. [The full lifecycle — how everything works](#-the-full-lifecycle--how-everything-works)
3. [Feature tour by role](#-feature-tour-by-role)
4. [Judging & fairness (the math)](#-judging--fairness-the-math)
5. [Community voting engine](#-community-voting-engine)
6. [Round-wise deliverables & file rules](#-round-wise-deliverables--file-rules)
7. [Event Lounge (community chat)](#-event-lounge-community-chat)
8. [Platform APIs — webhooks, certificates, widget](#-platform-apis--webhooks-certificates-widget)
9. [Architecture](#-architecture)
10. [Data model](#-data-model)
11. [Security model](#-security-model)
12. [How to run (Docker / Windows / local dev)](#-how-to-run)
13. [Demo accounts & 3-minute tour](#-demo-accounts--3-minute-tour)
14. [Configuration (env vars)](#-configuration-env-vars)
15. [Test suite](#-test-suite)
16. [Project structure](#-project-structure)
17. [Troubleshooting & FAQ](#-troubleshooting--faq)
18. [Roadmap & license](#-roadmap--license)

---

## 🎯 What Aventi is (and why)

Running a hackathon today means gluing together 6+ tools: Google Forms for registration, spreadsheets for teams, Drive folders for submissions, rubric sheets for judges, Discord for community, and a manual mail-merge for certificates. Data gets lost, judging is biased by each judge's personal strictness, and organisers have no audit trail.

**Aventi replaces all of it with one self-hosted app:**

- **Organizers** build the event (rules, rounds, registration form, theme, prizes) in minutes and watch stats live.
- **Participants** register, form/join teams with invite codes, and deliver work **round by round** with enforced file rules and deadlines.
- **Judges** get a personal bench with rubric scoring and full round context.
- **The community** gets a public gallery with fair (shuffled) ordering, comments, and a configurable ballot engine.
- **Everyone** gets verifiable, printable, HMAC-signed certificates at the end.

Everything works **offline**, persists in a single SQLite file, and every UI action maps 1:1 to a REST endpoint.

---

## 🔁 The full lifecycle — how everything works

```
ORGANIZER                          PARTICIPANT                     JUDGE / COMMUNITY
─────────                          ───────────                     ─────────────────

1. Create event
   (name, theme, prizes,
    dates, team rules)
2. Design rounds
   (artifact type, file
    rules, per-round deadline)
3. Pick registration
   fields (custom form)      →    4. Register (+ answers to custom fields)
                                  5. Create team / join by invite code
                                  6. Team hub: open slots, squad chat
7. Invite judges,
   batch-assign N
   reviewers per project
                                  8. Round-by-round deliverables
                                     (upload/link per round, rules enforced)
                                  9. Final submit → locked, published
                                                                ↓
                                  10. Lounge chat, reactions  ←  PUBLIC GALLERY (shuffled)
                                                                 community votes + comments
                                                               11. Judges score on rubric
                                                                   (weighted criteria)
12. Z-normalized leaderboard
    (fair across judges)
13. Publish results + certificates
    (HMAC-signed, verifiable URL)
14. Export everything (7 CSVs + JSON)
```

Two hard clocks own the flow — **registration deadline** and **event end** — and both are enforced **in the backend** (`POST /registrations` 403s after the deadline; submission writes 403 after `end_date`). The UI countdowns are decoration; the store owns time.

---

## 👥 Feature tour by role

### 🛠 Organizer (Admin Console)
- **Event builder** — name, tagline, description, deep-brief, mode (online/hybrid), location, prize pool, start/end dates, registration deadline, min/max team size, eligibility.
- **Round builder** — unlimited rounds; each round gets: title, description ("what must the team deliver"), **required artifact** (`any` / `link only` / `file only`), **accepted file types** (e.g. `ppt,pptx,pdf`), and its **own deadline**.
- **Branding themes** — 7 full-screen event display styles (Treasure Map, Desert Voyage, World Realm, Board Sprint, Little Town, Quest Map, Briefing Timeline) — the event page becomes an interactive "journey map" where each pin reveals a round.
- **Registration-form designer** — checkboxes decide exactly which fields the registration asks (name, email, age, gender, institution, college year, phone, WhatsApp, Discord ID, GitHub, LinkedIn, skills, portfolio…).
- **Dashboard** — participants/admins/events/registrations/teams counters, recent logins, events-at-a-glance; click any number for its full list.
- **Contestant database** — every login, every registration, every team; one-click per-stage **CSV exports** (registrations, submissions, raw scores, judge progress, votes & comments, results) and one full-event JSON export.
- **Judge management** — invite judges (name + email), tap judge cards to restrict pools, **batch assign** N reviewers per submitted project (randomized; wipes old assignments on re-run).
- **👁 View-as-judge** — render an exact **read-only** replica of any judge's bench (`GET /api/judging/preview-queue/{judge_id}`, organizer-only; payload identical to the judge's own queue). Same data, same permissions, zero side-effects.
- **Bulk import** — `POST /api/admin/import/participants/{event}` imports `name,email[,team_name]` CSVs: auto-accounts, auto-teams, per-row error report, idempotent re-runs.

### 🧑‍💻 Participant
- **Role-based login** — Participant / Judge / Admin portals; credentials are hard-checked server-side (admin creds never open the participant flow and vice versa).
- **Custom registration** — the form shows exactly the fields the organizer picked; registering creates a team instantly or joins one via **invite code**.
- **Team hub** — open slots by skill, 4-way invite (email/username/code/link), rename & restyle (leader-only), remove members, squad-only chat.
- **Workspace / submission editor** — rich draft (title, tagline, description, repo, demo video, links, tech stack, extra notes), thumbnail + up to 6 screenshots, **draft → submit final** flow with field-level edit audit log.
- **Round deliverables board** — see below.
- **Dashboard** — your registrations, live events, and 🎖 **My certificates** (issued certs with code + one-click open).

### ⚖️ Judge
- **Judge bench** — only your **assigned** projects (backend-enforced 403 per assignment): queue with progress bar ("3/4 scored"), each card shows the project, team, links, and a **deliverables strip** with downloadable round files (`/api/submissions/rounds/files/{id}`) and link chips — no expand needed; explicit "no artifacts yet" state.
- **Rubric scoring** — 5 weighted criteria (labels scaled by organiser weights), instant save, weighted total per judge, optional private feedback; re-scoring overwrites.
- **Anti-gaming** — 60-second anti-hub-and-spoke edit freeze; judges can only score what they're assigned.

### 🌍 Community (no login needed for viewing)
- **Public gallery** — only `status='submitted'` projects; **stable per-viewer shuffle** (no position bias), community vote toggles, append-only comments with sign-in.
- **Event lounge** — three channels per event with reactions & moderation (below).
- **Embeddable widget** — the gallery drops into any website.

---

## 🧮 Judging & fairness (the math)

**Problem:** Judge Dana scores everything 8–10; Judge Raj scores the same work 4–7. A naive average punishes teams randomly assigned to strict judges.

**Aventi's fix — Z-normalization:** every judge's scores are normalized against **that judge's own mean and standard deviation** (how strict/lenient they are, how wide they spread), then combined weighted by the event's rubric:

```
z(project, judge) = (raw_score − judge's mean) / judge's std-dev
final(project)    = Σ(weight_criterion × z) across all judges & criteria
```

The leaderboard shows **Rank · Project · Team · Reviews · Raw avg · Normalized z**, exports to **Results CSV**, and the full mathematical walk-through is in `docs/NORMALIZATION-PROOF.md` with a step-by-step worked example. Details and invariants: `JUDGING.md`.

---

## 🗳 Community voting engine

Gallery votes run through a **configurable ballot engine** (`/api/votes/*`):

- **Access** — `authenticated` (login) · `email-gated` (6-digit code; Gmail dot/`+alias` collapse blocks throwaway duplicates) · `open` (salted IP fingerprint)
- **Mode** — `simple` (pick up to N projects, 1 vote each) · **quadratic** (9 credits; n votes on one project costs n² — passion is expensive)
- **Window** — organiser sets close time; results hidden from everyone but organisers while open; auto-public at close or manual publish
- **Anti-abuse** — sliding-window rate limits, duplicate-comment detection, participant self-vote blocked **in the backend**, full audit log (readable in UI, exportable as CSV)
- Comments with organiser moderation (soft-delete keeps the row)

The seeded `GenAI Sprint 2026` ships pre-configured in **quadratic / 9-credit** mode with seeded ballots, so results, budget meter and audit trail are live out of the box.

---

## 🧩 Round-wise deliverables & file rules

Events are multi-stage — so submissions are too. Every round gets its own artifact slot on a team's submission:

- **One artifact per round** (R1 PPT deck · R2 prototype video · R3 final build) — independent save/upload; re-saving **updates** that round, never duplicates.
- **Organizer-set requirements enforced server-side** (400s, not UI hints):
  - artifact **type** — `any` / `link only` / `file only`
  - **accepted extensions** — the file picker is restricted *and* the API rejects mismatches: `.exe` to a `ppt,pdf` round → visible rejection, nothing saved
  - **round deadline** — writes/uploads close at that moment; participants see due-date chips and an ⛔ DEADLINE PASSED lock state
- **Submit guard** — "Submit final" with any round still PENDING pops an explicit warning listing the pending rounds: a failed upload can never silently reach judges as "nothing".
- Uploads capped at **200 MB** per artifact, stored as files (not blobs), downloaded back **bit-for-bit**.
- `tests/rounds_test.py` → **36/36**: upload/save, kind/accept/deadline rejections, freeze lock, judge visibility, view-as-judge parity, role guards.

---

## 💬 Event Lounge (community chat)

Three channels per event:
- **💬 General** — every registered participant, any team
- **👥 Team wall** — members-only (only your squad reads/posts; moderators read for safety)
- **📢 Announcements** — organizers/judges post; everyone reads + reacts

Gender bitmojis (👦/👧/🧑/🤫), organizer crown 👑, judge ⚖️, emoji picker on every composer, per-channel rate limits (20 msg/min), 🚩 report → mod queue, soft-delete (audit-kept), mute/ban with reason + unmute, and an admin **control tower** in the Console's Lounge tab. Realtime via WebSocket hub.

---

## 🔌 Platform APIs — webhooks, certificates, widget

Everything is an API (interactive docs at `/docs`):

- **Webhooks** — organiser-registered outbound POSTs for `registration.created`, `submission.created/submitted`, `vote.cast`, `score.created`, `results.published/final`, `certificate.issued`, `ping`. Every body is **HMAC-signed** (`X-Platform-Signature: sha256=…`) so receivers can prove it's you; deliveries are retried and **logged in the UI** (Admin → Integrations).
- **Certificates** — printable HTML (Ctrl+P → PDF), kinds: 🎖 participation · 🏆 winners (from the normalized board) · ⚖️ signed judge records. **Public, no-login verification** at `/api/certificates/verify/{code}`; print page at `/api/certificates/{code}/print`.
- **Embeddable widget** — `<script src="/api/widget/{slug}.js">` drops the public gallery onto any site (or raw `<iframe src="/api/widget/{slug}">`). No auth needed; submitted projects only; "powered by" footer links back.
- **Bulk I/O** — CSV participant import; `GET /api/admin/export/event/{event}.json` = the whole event in one document, next to 7 stage-wise CSVs.

---

## 🏗 Architecture

```
Browser (React SPA, Tailwind)
   │  REST /api/* + WebSocket        ← JWT in 3 transports (Bearer header,
   ▼                                  hp_token cookie, ?hp_token= fallback)
FastAPI backend (Python 3, uvicorn)
   ├── routers/   auth · events · registrations · teams · admin
   │              submissions · votes · judging (+ t4certs, t4webhooks)
   ├── auth.py    hash/verify/JWT + role guards (require_admin/judge/organizer)
   ├── antifraud.py · mailer.py · oauth.py
   ├── models.py  12 SQLAlchemy tables      schemas.py  Pydantic DTOs
   ├── seed.py    self-healing demo fixtures
   └── static     serves frontend/dist catch-all (no-cache index + hashed assets)
SQLite (backend/data/app.db — single file, wipeable, self-seeding)
```

- **Frontend** — React 18 + Vite; `pages/` (Landing, UserDashboard, AdminDashboard, EventDetail, TeamHub, Gallery, SubmissionEditor, JudgeDashboard, Support) + `components/eventDisplays.jsx` (the 7 map styles); prebuilt `dist/` is committed, so **no Node needed** to run.
- **Auth** — JWT (HS256, 7-day): `Authorization: Bearer`, httpOnly `hp_token` cookie, and `?hp_token=` last-resort (demo-sandbox trade; production = cookies + BFF).
- **DB swap** — set `DATABASE_URL` (e.g. `postgresql+psycopg://…`); unset = built-in SQLite.

Full diagrams & rationale: `ARCHITECTURE.md` · field-by-field tables: `DATA-MODEL.md` · API-first spec: `docs/API-FIRST.md`.

---

## 🗄 Data model (summary)

```
users ─┬─ login_logs
       ├─ registrations ─┬─ team_members ──┬─ teams
       │                 │                 │
       │                 │                 └─ submissions ─┬─ votes
       ├─ votes            events (FK)                     ├─ comments
       ├─ comments                                         ├─ judge_assignments
       └─ judge_assignments                                └─ scores
judges = users with role='judge' · organizers = role='admin'
```
Design decisions worth a challenge: **team-lead is a relation, not a role** (`teams.created_by`; leader actions 403 against the relation); **public gallery shows only submitted**; **dual login portals, one endpoint**, role verified server-side.

---

## 🔐 Security model

| Layer | Mechanism |
|---|---|
| Roles | Participant / Judge / Admin — every route guarded backend-side (`require_admin`, `require_judge`, `require_organizer`); judges 403 on non-assigned submissions |
| Time locks | Registration deadline + submission freeze enforced in handlers, not UI |
| Webhooks | HMAC-SHA256 `X-Platform-Signature` on every delivery |
| Certificates | HMAC-signed public codes; verification needs no login |
| Voting | Rate limits, duplicate detection, self-vote block, email alias collapse, full audit log |
| Chat | Per-channel rate limits, report queue, soft-delete with audit, mute/ban with reason |
| Uploads | Server-side extension + type validation, 200 MB cap, stored outside DB |
| Threat model | `docs/THREAT-MODEL.md` |

---

## 🚀 How to run

### Option A — Docker (recommended, works the same everywhere)

```bash
docker compose up --build
```
Then open **http://localhost:8000** — the image builds backend + serves the **prebuilt** frontend (no Node inside needed for the frontend), seeds demo data, and persists the DB to the `db-data` volume (delete the volume to re-seed from scratch).

**Windows (PowerShell, one line — replace the path with where you cloned):**
```powershell
cd C:\Users\<you>\hackathon-platform; docker compose up --build
```

### Option B — Local dev (two terminals, no Docker)

```bash
# terminal 1 — backend
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8000
```
```bash
# terminal 2 — frontend build (output is served by the backend at /)
cd frontend && npm install && npm run build
```
Then open **http://localhost:8000** (the SPA and API live on the same port — no CORS, no proxies).

> After build, the app needs **zero network**: no CDN fonts, no external APIs.

---

## 👤 Demo accounts & 3-minute tour

| Role | Email | Password |
|---|---|---|
| Organizer / Admin | `admin@platform.dev` | `admin123` |
| Judge | `judge@demo.dev` | `judge123` |
| Participant (Neural Knights) | `alice@demo.dev` | `password123` |
| Participant (Prompt Pirates) | `bob@demo.dev` | `password123` |

*(You can also sign up as a fresh participant from the landing page.)*

**Suggested tour:** landing → live events → create an event as admin (rounds + theme + registration fields) → go live → register as Alice → deliver rounds (try sending a wrong file type 😉) → final submit → gallery vote/comment → judge bench scoring → normalized leaderboard → view-as-judge → webhooks ping + delivery log → issue certificates → open the public verify URL → embed the widget somewhere.

---

## ⚙ Configuration (env vars)

All optional — everything works offline without them:

| Var | Why |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` + `PUBLIC_BASE_URL` | Real Google OAuth consent (unset = offline demo handshake) |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Same, for Discord |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Same, for GitHub |
| `DATABASE_URL` | Alternate DB (e.g. Postgres); unset = built-in SQLite |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | Real delivery of email-gate voting codes; unset = code shown inline (demo) |

---

## ✅ Test suite

**Official DOGFOOD acceptance checker** — committed `acceptance-report.txt` is the checker's **own output**:

```bash
python3 run.py .dogfood.toml > acceptance-report.txt   # → 7/7 PASS · "claimed T1 T2, verified T1 T2"
```

The official `fixtures.json` seeds automatically at boot (event id 9000, closed deadline), and `.dogfood.toml` maps the portal's own routes/auth for the seven checks. (The older 152-check internal suite output lives in `acceptance-report-selftests.txt`.)

Five runnable acceptance suites against a fresh server before every packaging:

| Suite | Checks | Covers |
|---|---|---|
| `tests/rounds_test.py` | 36 | per-round upload/save, kind/ext/deadline rejections, freeze lock, judge visibility, preview parity, role guards |
| `tests/chat_test.py` | 30 | lounge channels, team wall privacy, rate limits, moderation, reactions |
| `tests/t3_voting_test.py` | 31 | ballot modes, quadratic math, windows, duplicate/self-vote blocks, audit |
| `tests/t2_judging_test.py` | 28 | invites, batch assign, rubric scoring, z-normalized leaderboard, edit freeze |
| `tests/t4_test.py` | 27 | webhooks (HMAC + logs), certificates (issue/verify/print), widget, bulk import/export |

**Total: 152 / 152 PASS.** Reproduce any suite:
```bash
cd tests && python3 rounds_test.py http://localhost:8000
```

---

## 📂 Project structure

```
hackathon-platform/
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             # FastAPI app, SPA static serving, health
│       ├── db.py  models.py  schemas.py  seed.py
│       ├── auth.py             # JWT + role guards
│       ├── antifraud.py  mailer.py  oauth.py  t4certs.py  t4webhooks.py
│       └── routers/            # auth, events, registrations, teams, admin,
│                               # submissions, votes, judging
├── frontend/
│   ├── src/
│   │   ├── pages/              # Landing, dashboards, EventDetail, TeamHub,
│   │   │                       # Gallery, SubmissionEditor, JudgeDashboard, Support
│   │   ├── components/         # shared UI + 7 event map styles
│   │   └── api.js              # fetch wrapper (3-transport auth mirror)
│   └── dist/                   # prebuilt SPA (committed — no Node needed to run)
├── tests/                      # 5 acceptance suites (152 checks)
├── docs/                       # API-FIRST, NORMALIZATION-PROOF, THREAT-MODEL…
├── ARCHITECTURE.md  DATA-MODEL.md  JUDGING.md
├── acceptance-report.txt       # run log + per-suite results
├── Dockerfile  docker-compose.yml
└── README.md                   # ← you are here
```

---

## 🧰 Troubleshooting & FAQ

- **"Port 8000 already in use"** — stop whatever's on it, or run `docker compose up --build` after `docker compose down`.
- **I want a blank database** — `docker compose down -v` (drops the `db-data` volume), then bring it up again; fixtures re-seed automatically.
- **Frontend changes not showing** — rebuild (`cd frontend && npm run build`); the backend serves `dist/`, and `index.html` is no-cache while assets are hash-immutable.
- **OAuth buttons do a demo handshake** — expected; set the `*_CLIENT_ID/SECRET` env vars + `PUBLIC_BASE_URL` for the real flow.
- **Email voting codes shown on-screen** — expected without SMTP; wire the `SMTP_*` vars for real mail.
- **Postgres instead of SQLite** — set `DATABASE_URL`, e.g. `postgresql+psycopg://user:pass@host/db`; an optional Postgres service ships commented in `docker-compose.yml`.

---

## 🛣 Roadmap & license

- Multi-organization dashboards with cross-event analytics
- Pluggable RSVP integrations (Devfolio / Luma import)
- Public partner API keys with rate limits

**License:** see `LICENSE` · **Contributions:** fork it, dogfood it, remix it — the whole platform is the demo of itself.

---
*Aventi Platform — one command, one lifecycle, zero glue. Where the Future is Built.* ⚡
