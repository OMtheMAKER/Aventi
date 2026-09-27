# API First — the platform is its REST API (+3 Bonus)

> 🌐 **Live demo:** https://aventi-dz0q.onrender.com · 🎬 **Video (2:50):** https://gofile.io/d/MJEa6lFW · 📂 **Repo:** https://github.com/OMtheMAKER/Aventi · 📘 **Main docs:** README.md

**Claim.** This is not a web app with an API bolted on — it's a REST API with a
UI on top. The React frontend is just another client. Everything it does, you can
do from curl, a script, another service, or the browser console.

---

## 1. The machine-readable contract

- **OpenAPI**: `GET /openapi.json`, interactive docs at `GET /docs`
- **Conventions**:
  - JSON in/out, UTF-8, ISO-8601 timestamps
  - Errors: `{"detail": "human-readable reason"}` with correct 4xx codes
  - Auth: `Authorization: Bearer <jwt>` (also `hp_token` cookie / `?hp_token=` for embeds)
  - Nouns map to DB tables 1:1, so `GET /api/{noun}/{id}` traces straight to `DATA-MODEL.md`

## 2. UI action ↔ endpoint map (proof by symmetry)

**T1 core**
| UI action | Endpoint |
|---|---|
| Signup / login | `POST /api/auth/register`, `POST /api/auth/login` |
| Browse/create events | `GET /api/events`, `POST /api/events` (admin) |
| Register with form | `POST /api/events/{id}/register` |
| Create/join team | `POST /api/teams`, `POST /api/teams/join/{code}` |
| Draft → final submit | `POST /api/submissions`, `PUT /api/submissions/{id}`, `POST /api/submissions/{id}/submit` |

**T2 judging**
| UI action | Endpoint |
|---|---|
| Assign judges | `POST /api/judging/assign/{event_id}` |
| Judge scores | `POST /api/judging/score/{assignment_id}` |
| Leaderboard | `GET /api/judging/leaderboard/{event_id}` |
| Export | `GET /api/judging/export/{event_id}.csv` |

**T3 voting + comments**
| UI action | Endpoint |
|---|---|
| Configure vote | `PATCH /api/votes/config/{event_id}` |
| Cast ballot | `POST /api/votes/ballot/{event_id}` |
| Results (publish-gated) | `GET /api/votes/results/{event_id}` |
| Comment | `POST /api/votes/{event_id}/comments`, `DELETE /api/votes/comments/{id}` |
| Audit + CSV | `GET /api/votes/audit/{event_id}`, `GET /api/votes/audit-export/{event_id}.csv` |

**T4 webhooks / certs / widget / bulk**
- `POST /api/events/{id}/webhooks` → `POST /api/webhooks/{id}/ping` → `GET /api/webhooks/{id}/deliveries`
- `POST /api/events/{id}/issue-certificates?kind=…` → `GET /api/certificates/mine` → **public** `GET /api/certificates/verify/{code}`
- `GET /api/widget/{slug}` + `GET /api/widget/{slug}.js`
- `POST /api/admin/import/participants/{event_id}` (multipart CSV), `GET /api/admin/export/event/{event_id}.json` + 7 CSVs

**Event lounge (chat)**
| UI action | Endpoint |
|---|---|
| Read(+delta poll) | `GET /api/chat/{event_id}/messages?after_id=` |
| Post general / announce | `POST /api/chat/{event_id}/messages?channel=…` |
| React | `POST /api/chat/message/{id}/react` |
| Report | `POST /api/chat/message/{id}/report` |
| Moderation queue | `GET /api/chat/{event_id}/mod-queue` |
| Mute / unmute / soft-delete | `POST /api/chat/{event_id}/ban`, `/unban`, `POST /api/chat/message/{id}/moderate` |

3. **Cross-check discipline.** Every API write is tested by a backend acceptance
suite that does not touch the UI (`tests/t2_*`, `tests/t3_*`, `tests/t4_test.py`,
plus inline chat E2E). If the frontend got deleted tomorrow, the tests still pass
— they are the API contract, versioned with the repo.

## 4. Machine-first shapes worth reusing

- **Signed webhooks**: every outbound POST carries
  `X-Platform-Signature: sha256=<HMAC(secret, body)>` — a receiver can verify
  *without* any shared state beyond the one secret.
- **Public certificate verification**: `GET /api/certificates/verify/{code}`
  returns `{valid, holder, kind, event, revoked}` with **no auth** — a verifier
  outside the platform can trust it; tampering fails closed.
- **Idempotent writes**: re-importing the same CSV → zero dups; re-issuing
  certificates → zero dups; toggling a reaction is a stable ∀ toggle.
- **Paginated delta reads**: chat supports `after_id` so a client never has to
  re-pull the full stream (the lounge polls deltas every 4s).

## 5. What we deliberately do NOT expose

- **No admin token endpoint** — admin accounts are created only by existing
  admins in-console or via the seed. There is no `POST /make-me-admin` Easter egg.
- **No raw-DB export for anyone** — "leave as easily as you arrived" is the
  organizer's `EVERYTHING.json`, not an open `/dump-all` route; CSVs are
  event-scoped and organizer-gated.
- **No anonymous mutating route**. Even open voting requires a fingerprint so
  a scripted-decoy ballot isn't free.

---

*If you can do it in the UI, you can script it. If you can't script it with
your own role's permissions, neither can anyone else.*
