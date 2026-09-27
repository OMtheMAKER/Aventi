# Data Model

(`nvarchar` is SQLite `String`; timestamps are ISO-8601 `DateTime`.)

## users
| col | type | notes |
|---|---|---|
| id | int pk | |
| email | str unique | login key |
| name | str | display name |
| hashed_password | str | bcrypt |
| role | str | `"user"` participant / `"judge"` / `"admin"` (organizer) |
| created_at | datetime | |

## events
| col | type | notes |
|---|---|---|
| id, slug | pk, unique | slug = kebab-cased title (auto) |
| title, tagline, description | str/text | short summary for the card |
| about, rules JSON, rounds JSON, eligibility, judging_criteria JSON | text/JSON | deep briefing — the organizer types these in the Create form |
| contact_email, whatsapp_group, discord_group | str | per-event contact + community |
| min_team_size, max_team_size | int | default 1 / 4 — teams are created with max_members = event default |
| mode, location, start_date, end_date, registration_deadline, prize_pool, tracks JSON, cover | various | dates drive status: upcoming/ongoing/past |
| display_style | str | one of the 7 full-screen map styles |
| form_fields JSON | dict | per-event toggle of which registration fields are asked |

## users ↔ events (relation): registrations
| col | notes |
|---|---|
| event_id, user_id, name, age, gender, institution, college_year, email, phone, whatsapp_invite, discord_invite, github_url, linkedin_url, skills, portfolio_url | the spec's `form_fields` map |
| team_id, team_code | NULL until they join/create a team |

## teams + team_members
| col | notes |
|---|---|
| team: event_id, name, tagline, avatar_url, is_open, max_members, invite_code (unique), created_by | `created_by` = leader. is_open=1 = listed as joinable in Team Hub |
| team_member: team_id, registration_id | join table so members' registration rows stay canonical |

## submissions
| col | notes |
|---|---|
| id, event_id, team_id | one row per team per event |
| title, tagline, description, repo_url, demo_video_url, tech_stack, extra_links JSON | the spec's fixed field set |
| status | `"draft"` (editable) / `"submitted"` (read-only, in gallery) |
| submitted_at | NULL until final submit |

## judge_assignments + scores
| col | notes |
|---|---|
| assignment: event_id, judge_id → submission_id | batch-random; organizer can re-roll |
| score: submission_id, judge_id, innovation, execution, impact, presentation, comment | 1–10 each; one row per (sub, judge) |

## votes + comments (T3)
| table | notes |
|---|---|
| `vote_allocations` | one row per (event_id, voter_key, submission_id): the voter's allocation. `votes` = units (simple → 1, quadratic → n with cost n²). `voter_key` = `u:{id}` for login, `e:{normalized_email}` for email-gated, `ip:{salted sha}` for open. |
| `vote_verify_tokens` | one-shot 6-digit codes for email-gated ballots — hash-stored, 15 min expiry |
| `comments` | append-only; `removed` flag = organizer moderation (soft-delete — row kept for audit) |
| `audit_log` | append-only event feed: cast/update/withdraw/comment/config/publish/abuse-flag with actor + time + human-readable detail + JSON meta. Org reads in UI, CSV export at `/api/votes/audit-export/{event}.csv` |
| legacy `votes` | pre-T3 toggle table, kept for schema continuity; writers/readers moved to `vote_allocations` |

| table | notes |
|---|---|
| `webhooks` | organiser-registered outbound hooks: url, secret (HMAC key), events filter list (empty=all), active |
| `webhook_deliveries` | every delivery attempt: payload, http status, tries, ok — the "did it fire?" answer in the UI |
| `certificates` | cert_code (short URL slug), kind, meta (what shows on the cert), HMAC signature, revoked flag |
| `chat_messages` | per-event lounge; channel=general\|announce\|team, team_id set only when channel=team; removed (soft), reported+reason |
| `chat_reactions` | (message, user, emoji) unique — 👍❤️😂🎉🔥 toggles |
| `chat_bans` | event-scoped mute; reason, created_by mod, active flag for unban |

## Invariants worth breaking nothing on
1. **One registration per (event_id, user_id)** — enforced by query before insert; no dupes possible.
2. **`team_members.registration_id`** is always the user's row for that event — member count = distinct registrations.
3. **Submission deadline = `event.end_date`** — editable until then, read-only after. Final `submit` requires title + description + repo_url.
4. **A judge scores ONLY an assigned submission** — enforced backend-side in `POST /api/judging/score/{id}`.
5. **Leaderboard z-scores** are per (judge, event) before averaging — see `JUDGING.md`.
6. **Audit on**: team creates/invites/joins, submission create/submit-with-repo, judge assignments, admin actions, every ballot (with vote hash), comment add/remove, result publish/unpublish, webhook deliveries, bulk imports/exports, certificate issues+revokes.
7. Certificates verify against `CERT_SECRET` persisted at `backend/data/cert_secret.key`; rotating (deleting) that file = an intentional, documented revoke-all.
