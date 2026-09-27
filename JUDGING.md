# Judging — the maths, honestly

> 🌐 **Live demo:** https://aventi-dz0q.onrender.com · 🎬 **Video (2:50):** https://youtu.be/ZOX9ZrZ9x4E · 📂 **Repo:** https://github.com/OMtheMAKER/Aventi · 📘 **Main docs:** README.md

## Rubric (organizer-configurable since T2 completion)

The organizer chooses the rubric **per event** at creation time: any 2–10 named criteria, each with an integer weight 1–100, weights must sum to exactly 100. If they don't define one, the platform default applies:

| Criterion | Weight |
|---|---|
| Innovation | 30% |
| Execution | 30% |
| Impact | 20% |
| Presentation | 20% |

Validation is enforced in the **backend** (`validate_rubric`): duplicate names, zero weights, and totals ≠ 100 are all rejected with HTTP 400. Judges see exactly this rubric in their scoring UI, with a live weighted total.

Raw weighted score = `Σ valueᵢ × weightᵢ / 100`, computed from each judge's per-criterion `breakdown` map against the `rubric_snapshot` stored on the score row. Because the snapshot is frozen at scoring time, results stay explainable even if the organizer later edits or deletes the rubric (legacy rows from before configurable rubrics fall back to the fixed 30/30/20/20 weights).

## Assignment strategy

Organizer picks an event + N reviewers-per-project and hits "Assign batch". We **shuffle the judge pool per submission** and take the first N — every assignment is uniform-random across judges. Old assignments are wiped first, so re-rolling after adding a judge is always clean.

## Cross-judge normalization

Strict judges pull everyone's raw score down; generous judges push it up. To compare apples with apples, for **each judge separately** in an event:

1. Compute the judge's **mean** and **std dev** across their weighted scores.
2. z-score each mark: `z = (raw − mean) / std`.
3. A submission's **normalized score** = mean of its assigned judges' z-scores.

If a judge has only one project (std = 0), std is clamped to 1 so nothing crashes. Judges only ever see their own queue + own scores — **no one sees another judge's ballot**, which keeps ballots sincere.

## What a defensive reader should test

- Recompute one judge's z-scores by hand from `/api/judging/leaderboard/{event_id}` → matches.
- Create an event with a 3-criterion custom rubric (e.g. Design 50 / Craft 30 / Story 20), score 9/8/7 → raw total must be 8.3, and the leaderboard must agree. (Our E2E suite asserts exactly this.)
- Assign the same submission to a harsh judge and a generous judge — the z-scores deviate, the raw does not shift the rank.
- Score once, re-score the same submission — only one score row exists (update path), so no double-counting.

## T3 — community voting: design decisions & defensible maths

### Voting modes (organiser-configurable per event)

**Simple mode.** One vote per project, ballot capped at `max_picks` (default 3). One-person-one-vote-kept-per-project means the cap stops anyone from *matrix-liking* everything, which renders likes meaningless.

**Quadratic mode.** Each voter has a budget of `C` credits (default 9). Allocating **n** votes to one project costs **n²** credits; the vote-count that lands is **n**, not n². With 9 credits you can go all-in ×3 on your single favourite **or** spread ×2+×2+×1 across three projects. A vocal minority trying to buy a landslide pays quadratically; a broad coalition gets linear influence per person. This is the most credible published defence against the "my Discord server shipped 5,000 votes" failure mode — the spec names it, we ship it.

```
voter budget C = 9
allocations {A:3}          cost 3² = 9  ✓   influence = 3
allocations {A:2, B:2}     cost 4+4 = 8 ✓   influence = 2, 2
allocations {A:3, B:1}     cost 10 ✗ rejected (400)
```

### Access modes (who is allowed to vote)

The spec offers open link / email-gated / authenticated; all three are shipped, chosen per event by the organiser:

| Mode | Identity (`voter_key`) | Sybil cost | Honest caveat |
|---|---|---|---|
| `authenticated` | `u:{user_id}` — the account itself | Highest — requires an account | logged-in voters only |
| `email` | `e:{normalized_email}` after a 6-digit code check | Medium — requires owning an inbox per ballot | self-hosted demo prints the code inline (no SMTP); production wires it to a relay |
| `open` | `ip:{sha256(ip+ua, per-process salt)}` | Lowest — VPNs mint identities | rate-limited; flagged in audit; fine for "fan favourite" tier |

Email **normalisation** collapses common alias farms before they reach the DB: `First.Last+spam@gmail.com`, `firstlast@gmail.com` and `firstlast@googlemail.com` resolve to the **same** ballot identity.

### Results hidden during the window

Vote totals never leak while voting is open: `GET /votes/results/{event}` returns **403** to everyone except the organiser until (a) the window closes (`voting_close_at` reached) or (b) the organiser publishes early. Gallery cards show your own allocation but no totals — this kills vote-count herding, which is the standard advice from every incumbent's docs and the reason platforms tell organisers to "hide and manually review".

### Randomised ordering on ballots

The gallery endpoint sorts by `sha256(voter_key ‖ event_id ‖ submission_id)`. Each viewer gets a different but *stable* order (no reshuffle on refresh, no position bias in aggregate). It's in `public_gallery()` and visibly labelled in the UI.

### Anti-abuse that means something

- **Sliding-window rate limits** (`app/antifraud.py`): ballot writes 30/min per identity; comments 6/min; verify-code requests 6/5min; results polling 60/min. 429 with `Retry-After`.
- **Duplicate detection**: `voter_key` is unique per submission row — a ballot is a *replacement*, not an append. Comment spam: exact-duplicate body within an hour is rejected.
- **Self-vote**: in authenticated mode, participants literally *cannot* allocate to a submission owned by their own team (backend join-blocks it, `abuse.flag` audit entry recorded).
- **Audit trail readable without a DB client**: every cast / update / withdraw / comment / publish / config change / abuse flag lands in `audit_log`, browsable in the organiser UI and exportable as CSV (`/votes/audit-export/{event}.csv`).
- **No raw IPs stored** — only per-process-salted SHA-256 fingerprints; they can't be correlated across restarts or deployments, by design.

## Anti-abuse & integrity

- **Backend role isolation**: `POST /api/judging/score/{id}` rejects non-assigned judges with 403, period. The UI hides the button too, but the API owns the rule.
- **One vote per user per submission** — toggled server-side; no duplicate votes in SQLite terms.
- **Comments** require sign-in and are append-only.
- **Deadline** is enforced by `PUT /api/submissions/{id}` and `/submit` comparing `datetime.utcnow()` against `event.end_date` — late edits are rejected regardless of what the UI shows.
- **Exports are organizer-only**: every `/api/admin/export/*` route requires the admin role; anonymous requests get 401 and judges get 403.

## Export — every stage, not just results

| Endpoint | Content |
|---|---|
| `/api/admin/export/registrations/{event_id}.csv` | every registered person + team + contact fields |
| `/api/admin/export/submissions/{event_id}.csv` | every submission (draft & submitted) + links + votes |
| `/api/admin/export/scores/{event_id}.csv` | RAW per-criterion rows: judge × submission × every rubric criterion + weighted total + comment — the audit trail |
| `/api/admin/export/judges/{event_id}.csv` | per-judge assignment counts and completion % |
| `/api/admin/export/votes/{event_id}.csv` | votes & comment counts per submission |
| `/api/judging/export/{event_id}.csv` | final ranked results: raw avg + normalized z |

Results travel outside the platform without a login needed to read them.

## Round artifacts on the bench (round-wise deliverables)

Events are multi-round, and judges score the WHOLE project — so every assignment carries the team's per-round artifacts with it. Each queue item includes a `deliverables` list (`round_name`, `link_url`, downloadable `file_name`, `note`), rendered directly on the judge card (no expanding required) with an explicit "no artifacts yet" state so an empty bench is never ambiguous. Files stream bit-for-bit from `/api/submissions/rounds/files/{id}`.

**Admin "👁 View as Judge"** — `GET /api/judging/preview-queue/{judge_id}` (organizer-only; 404 if the target isn't a judge, 403 for participants/judges, 401 anonymous) returns the SAME serializer output as `/api/judging/queue` for that judge. It's a debugging/verification aid: what a judge sees is provably what the organizer sees. Payload parity is asserted in `tests/rounds_test.py`.

Organs of fairness unchanged: preview is read-only — organizers still can't see *other judges'* ballots, only each judge's own assignment set.
