# Aventi Platform — Hackathon Submission

> **Tagline:** Where the Future is Built — the full hackathon lifecycle in one self-hostable app.
> 🌐 **Try it live:** https://aventi-dz0q.onrender.com  *(free tier — sleeps when idle, first load ~30s)*
> **Demo video (2:50):** https://youtu.be/ZOX9ZrZ9x4E
> **Code:** https://github.com/OMtheMAKER/Aventi · **Run locally:** `docker compose up --build` → http://localhost:8000

**Demo logins:** participant `alice@demo.dev` / `password123` · judge `judge@demo.dev` / `judge123` · organizer `admin@platform.dev` / `admin123`

---

## The problem

Running a hackathon today means stitching together 6+ tools: a form for registration, a spreadsheet for teams, a drive folder for submissions, a rubric sheet for judges, a chat app for community, and a manual mail-merge for certificates. Data gets lost, judging is unfair across strict/lenient reviewers, and organizers have zero audit trail.

## The solution

**Aventi** is one open-source platform that covers the entire lifecycle — **Registration → Teams → Round-wise Submissions → Judging → Results & Certificates** — with fairness and auditability built in, and it self-hosts with a single command. No cloud accounts, no external DB, no paid APIs — it even runs fully offline after build.

---

## Key features (all shown in the demo, in order)

**Organizer**
- **Event builder** — name, branding, prizes, dates, team-size rules, eligibility
- **Round builder** — per-round deliverable type, accepted file types, and deadlines
- **Theme gallery + registration-form designer** — pick a visual theme (map, desert, board-game…); choose exactly which fields the registration form asks
- **One-click go-live** — event instantly renders as an interactive "journey map"
- **Admin console** — live stats, members, contestant DB, events at a glance
- **Judge management** — invite judges, batch-assign N reviewers per project
- **View-as-judge** — read-only audit of any judge's bench (same data, zero side-effects)
- **Signed webhooks** — HMAC-signed (`X-Platform-Signature: sha256=…`) outbound events with logged deliveries
- **Certificates** — issue participation / top-3 / judge records; HMAC-signed, publicly verifiable, printable

**Participant**
- **Custom registration form** — exactly the fields the organizer picked + team create / join-by-code
- **Round deliverables board** — one artifact per round; **file-type rules are enforced server-side** (wrong format → visible rejection, nothing saved)
- **Final submit** — locked and published to the public gallery
- **Dashboard** — registrations, live events, and "My certificates"

**Community**
- **Public gallery** — shuffled per viewer (visible-fairness), community voting, per-project comments
- **Event lounge & team hub** — channels, reactions, announcements, squad-only chat, open slots by skill

**Judging & fairness**
- **Judge bench** — assigned queue with full round context (artifacts, links, notes)
- **Rubric scoring** — organizer-weighted criteria, instant save, weighted totals
- **Z-normalized leaderboard** — scores normalized against *each judge's own strictness*, weighted by the event rubric → fair rankings even with mixed-strictness panels (see `JUDGING.md` / `docs/NORMALIZATION-PROOF.md`)
- **Results CSV + per-stage exports** (registrations, submissions, raw scores, judge progress, votes)

**Embeddability**
- **Live widget** — one-line `<script>` or iframe embed of any event's project gallery for external sites
- JSON APIs for everything (API-first spec in `docs/API-FIRST.md`)

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | **FastAPI** (Python), SQLite | zero-dependency persistence, transactional, self-contained |
| Frontend | **React + Vite** SPA, prebuilt `dist/` | runs without Node on the judge's machine |
| Realtime | WebSocket hub (chat, reactions) | |
| Security | HMAC webhook signatures, HMAC certificate codes, role-based access (participant / judge / admin), threat model documented |
| Deploy | **Dockerfile + docker-compose** | single command; optional Postgres service included (commented) |

## Verification

- **152 / 152 acceptance checks passing** — four suites: chat, rounds, judging (T2), voting (T3), end-to-end (T4)
- Everything in the demo video is a live recording of the real app — no mocks.

## Quick start (Windows / Mac / Linux)

1. Install Docker Desktop.
2. In the repo folder run:
   ```
   docker compose up --build
   ```
3. Open http://localhost:8000

**Seeded demo accounts**

| Role | Login | Password |
|---|---|---|
| Admin / organizer | `admin@platform.dev` | `admin123` |
| Judge | `judge@demo.dev` | `judge123` |
| Participant | `alice@demo.dev` | `password123` |
| Participant | `bob@demo.dev` | `password123` |

## Repo map

```
backend/    FastAPI app (routers, websocket hub, HMAC webhooks, scoring + normalization)
frontend/   React + Vite SPA (+ prebuilt dist/)
tests/      Acceptance suites (chat / rounds / T2-judging / T3-voting / T4-e2e)
docs/       Architecture, data model, judging math, normalization proof, threat model
Dockerfile, docker-compose.yml
```

## What's next

- Multi-event organization dashboards with cross-event analytics
- Pluggable RSVP integrations (Devfolio/Luma import)
- Public API keys + rate-limited partner endpoints

---

*Aventi Platform — open source. Clone it, dogfood it, remix it.*
