# Threat Model — hackathon-platform (+3 Bonus)

> 🌐 **Live demo:** https://aventi-dz0q.onrender.com · 🎬 **Video (2:50):** https://gofile.io/d/MJEa6lFW · 📂 **Repo:** https://github.com/OMtheMAKER/Aventi · 📘 **Main docs:** README.md

Scope: a self-hosted hackathon platform (FastAPI + React + SQLite) handling
registration, teams, submissions, judging, community voting, certificates,
webhooks, and the event chat lounge. Audience: organizers (admins), judges,
participants, anonymous viewers.

---

## 1. Assets

| Asset | Why it matters |
|---|---|
| Participant PII (name, email, phone, WhatsApp/Discord handles, college) | Stolen → spam/phishing of minors-adjacent population |
| Credentials (passwords, sessions) | Account takeover → fake scores / fake submissions |
| Vote integrity | Rigged community choice → platform credibility dies |
| Judge anonymity (of *their* ballots, from other judges) | Collusion/hub-and-spoke bias (T2 emphasis) |
| Certificate verifiability | Forged "winner" certificates undermine the entire point |
| Webhook secrets / cert HMAC key | Signature forgery by interceptors |
| Audit trail | Without it, moderation is ink-less |

## 2. Actor model

- **Unauthenticated远端 user** — public internet, no account
- **Participant** — valid account, registered for ≥1 event
- **Judge** — assigned to specific event (only scores assigned submissions)
- **Organizer** (`role=admin`) — full event control, moderation, exports
- **Ex-organizer who left** — must NOT keep access (rotation semantics)

## 3. STRIDE table → implemented mitigations

### S — Spoofing

| Threat | Mitigation | Where |
|---|---|---|
| Stolen password | bcrypt-hashed at rest, JWT (HS256, 7-day exp) on all mutating/voting/scoring routes | `auth.py`, `User.hashed_password` |
| Judge votes on non-assigned submission | 403 check per (judge_id, submission_id) row | `judging._fire_score` path |
| Fake identity in open voting | vote_access=authenticated/email-gated modes; IP-fingerprint for open mode + 60s storm window | `votes.py` |

### T — Tampering

| Threat | Mitigation |
|---|---|
| DB-edit cert forgery | HMAC(cert payload) recomputed on verify; tamper → instant `valid:false` (E2E-verified) |
| Webhook spoofing receiver-side | Every delivery signed `X-Platform-Signature: sha256=HMAC(secret)`, secret ≥32 chars, organizer-only read |
| Submission edit after deadline | Server-side time-gate on `/submissions/{id}` PUT (`data/app.db` end_date check — UI merely hides the button) |

### R — Repudiation

| Threat | Mitigation |
|---|---|
| "I never scored that!" / "I never muted that user!" | Append-only `audit_log` with actor_key, action, detail, ip-ish identity — readable in-UI + CSV export (T3 invariant 6) |
| Cert claims denied | HMAC + immutable issue-time meta snapshot |

### I — Information Disclosure

| Threat | Mitigation |
|---|---|
| Participants see other judges' ballots | Vote/Score rows filtered server-side by role (see ARCHITECTURE role matrix) |
| PII leakage via export | `/admin/export/*` = organizer-only (403 for participants; E2E-verified) |
| Open-ballot fingerprint theft | IP fingerprint stored salt-hashed, not raw IP |
| Vote against own team (self-dealing) | Organizers block self-vote for registered participants in T3 check `not on this team` |

### D — Denial of Service

| Threat | Mitigation |
|---|---|
| Vote flood | 60s results-window cap per fingerprint; admin exempt is deliberate (organizer tool) |
| Chat spam | 20 msgs/min per user sliding window; reaction rate-limit 60/min |
| Result-swing hammering | Quadratic mode caps influence at n² → linear-in-credits; storm IPs hashed |
| Giant submission upload | Whitelist MIME/ext, size cap (50 MB), no execution of uploads |

### E — Elevation of Privilege

| Threat | Mitigation |
|---|---|
| Participant→judge escalation | Role gates on every `/api/judging/*`, `/api/admin/*` route; dual-login portal (participant tab ≠ admin tab handshake) |
| Judge→announce-channel | Announce posts only `organizer|judge` server-side; UI just hides the composer |
| Banned user posting | Ban check on every POST to general; ban row is audit-logged |

## 4. Chat-lounge specifics

- **Author spoofing**: name/emoji rendered from DB role+gender (not client-sent)
  — no way to send "as 👑 admin" from a participant's client.
- **Harassment loop**: participants 🚩 → moderator queue (mod inbox), mods
  🗑 (soft-delete keeps row for audit), 🔇 mute (event-scoped, reasoned,
  unban-able), everything in `audit_log`.
- **Brigading the 🚩 button**: report rate-limit inherits chat rate-limit;
  repeated false-flagging is itself a ban-able pattern (recorded per-actor).

## 5. Residual risks (accepted, documented)

| Risk | Why accepted | Mitigation if it becomes real |
|---|---|---|
| IP-fingerprint open votes are spoofable with VPN rotation | Default events use authenticated/email-gated; open mode is opt-in with organizer warning in UI | Route through email-gated mode; organizer-side dedupe by UA+cookie fingerprinting |
| In-memory rate limiter resets on process restart | Restart is a rare, organizer-visible event; sliding window re-fills in 60s | Move limiter to Redis for scale-out deploys |
| Cert HMAC secret on disk (`backend/data/cert_secret.key`) | File chmod 600; organizer-host trust assumption is unavoidable in self-host | Rotate by deleting file = documented revoke-all, all certs invalid simultaneously |
| SQLite single-writer | Hackathon scale = thousands of requests/min, well inside SQLite headroom | Postgres adapter is a config swap (SQLAlchemy) |
| No public "contact moderators" channel outside chat | Mute messages explain the reason; organizer contact email on the event page | Add routed appeal flow if the dogfood judges flag it |

## 6. Verification inventory (evidence)

- T2 acceptance suite — 28/28 (isolation, time-gates, z-score integrity)
- T3 acceptance suite — 31/31 (rate limits 429, dup-reject, signed exports,
  ballot hashing, freeze-window)
- T4 acceptance suite — 27/27 (webhook signature verify, cert tamper-forge,
  revoke, idempotent import, public verify)
- Chat inline E2E — 11/11 (access gates, announce-authorization, report→mod
  flow, mute enforcement, unban, audit writes)

---

*This document is intentionally pessimistic-friendly: if you find a STRIDE
cell not addressed in the table, that's a real finding; please report it as an
issue, not a DM.*
