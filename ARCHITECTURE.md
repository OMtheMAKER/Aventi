# Architecture

> 🌐 **Live demo:** https://aventi-dz0q.onrender.com · 🎬 **Video (2:50):** https://youtu.be/ZOX9ZrZ9x4E · 📂 **Repo:** https://github.com/OMtheMAKER/Aventi · 📘 **Main docs:** README.md

## Stack
- **Backend:** Python 3 + FastAPI + SQLAlchemy, SQLite (file in `backend/data/app.db`, wipeable, self-seeding).
- **Frontend:** React 18 + Vite + Tailwind, built with `npm run build` into `frontend/dist/`, served by FastAPI's catch-all `/` route with no-cache index.html + immutable hashed assets.
- **Auth:** JWT (HS256, 7-day expiry) in **three transports** at once — `Authorization: Bearer` (normal), `hp_token` httpOnly cookie (proxies that strip headers), and `?hp_token=` query param (last-resort when a preview sandbox blocks both). The query-param fallback is a demo-cleanliness trade; production should use cookies + a BFF.

## Layout
```
backend/app/
├── main.py           — FastAPI app, static SPA serving, health
├── db.py             — SQLAlchemy engine + session
├── models.py         — all 12 tables
├── schemas.py        — Pydantic DTOs
├── auth.py           — hash/verify/JWT + role guards (require_admin, require_judge, require_organizer)
├── seed.py           — self-healing demo fixtures
└── routers/
    ├── auth.py       — signup/login/social/logout/me
    ├── events.py     — read-only event API
    ├── registrations.py — registration, team-join by code
    ├── teams.py      — team hub listing, leader edit, 4-way invite, open-slot join
    ├── admin.py      — organizer console (event CRUD, members, contestants, per-user detail)
    ├── submissions.py— drafts, edit-until-freeze, final submit, public gallery
    ├── votes.py      — one-vote toggles + comments
    └── judging.py    — judge invites, batch assign, scoring, z-normalized leaderboard, CSV
frontend/src/
├── pages/            — Landing, UserDashboard, AdminDashboard, EventDetail,
│                       TeamHub, Gallery, SubmissionEditor, JudgeDashboard, Support
├── components/       — ui.jsx (shared), eventDisplays.jsx (7 full-screen map styles)
└── api.js            — fetch wrapper with the 3-transport auth mirror
```

## Data model (summary)
```
users ─┬─ login_logs
       ├─ registrations ─┬─ team_members ──┬─ teams
       │                 │                 │
       │                 │                 └─ submissions ─┬─ votes
       │                                                 │ ├─ comments
       │                                                 │ ├─ judge_assignments
       │                                                 │ └─ scores
       ├─ votes            │ events (FK)  ────────────────┘
       ├─ comments         │
       └─ judge_assignments│ judges (users with role='judge')
```
(See `DATA-MODEL.md` for the full field-by-field table.)

## Role matrix
| Who | Logins work on | Can score? | Backend guard |
|---|---|---|---|
| Participant (`user`) | Participant tab | — | `get_current_user` |
| Judge (`judge`) | Participant tab | only **assigned** submissions | `require_judge` + per-assignment 403 |
| Organizer (`admin`) | Admin tab | yes, organizer-side | `require_organizer` (admin) |
| Anonymous viewer | — | browse public routes (login-gated for event pages) | — |

## Design decisions worth a challenge
1. **Dual login portals, one login endpoint.** Each portal submits `role: "user"|"admin"`, and `/api/auth/login` hard-rejects with an English message when credentials belong to the other side — admin creds never open the participant flow and vice versa. Security lives in the backend, not the tab UI.
2. **Team-lead = relation, not role.** `teams.created_by` is the actual leader. Leader actions (rename, restyle, invite by email/username) 403 for anyone else — checked against the relation, not a role claim.
3. **Registration deadline AND submission freeze are backend-locked.** `POST /registrations` must be rejected after `registration_deadline`; `PUT /submissions/{id}` and `/submit` reject after `event.end_date`. The map and sidebar are decoration; the store owns time.
4. **Public gallery shows only `status='submitted'`.** Drafts stay inside the team. One vote per user toggles; comments are append-only with sign-in.
5. **Judging engine:** batch random assignment (N reviewers/project) → privacy of other-judge ballots preserved per-row → aggregate in one pass with z-score across each judge's rows (see `JUDGING.md`).

## One-command boot
`docker compose up` builds a single image, seeds the DB, and serves everything on `:8000`. No cloud account, no hosted DB — SQLite file is the whole state.

(If something looks over-engineered, it isn't — the .dogfood.toml tier claims map 1:1 to what this file describes; treat mismatches as a bug.)

## Later builds (post-T3): rounds, chat, T4 — where each lives

- **Round-wise deliverables** — `round_deliverables` rows keyed by `(submission_id, round_index)`; the organizer's per-round config (`deliverable_kind`, `accept`, `deadline`) rides inside the event's `rounds` JSON column, so zero migrations were needed and older events keep working (their rounds default to `any`, no deadline). All enforcement — kind mismatch, wrong extension, deadline passed — happens in `submissions.py` (`_guard_round_write` / `_check_file_rules`) because decorators can hide a sin, only the store can prevent it. Admin "View as Judge" is a read-only projection, not a new permission: `GET /api/judging/preview-queue/{judge_id}` reuses the exact same serializer as the judge's own queue (payload parity is tested), so organizers can never see *more* than a judge can.
- **Event lounge chat** — one table (`chat_messages`) with a `channel` discriminator (`general` / `team:{id}` / `announce`), soft-delete + moderation flags, per-channel rate limits. A WebSocket hub at `/api/chat/ws/{event_id}` pokes clients to refetch; the socket carries NO message content or authorization, REST owns both — so a broken or hostile socket degrades to polling, never leaks.
- **T4 plumbing** — `webhooks` (HMAC-signed outbound, delivery log), `certificates` (publicly verifiable codes, signed judge participation records), the embeddable widget (same gallery serializer, CORS-open GET), and bulk CSV import / full-event JSON export all live behind `require_organizer`. Env-gated expansions stay honest: SMTP for real mail, OAuth for real provider consent — absent envs → identical offline demo behavior.
