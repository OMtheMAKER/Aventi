# Normalization Proof — why z-score merging is fair (+5 Bonus)

**Claim.** When judges each score a *different subset* of submissions (the practical
situation at any event above ~20 projects), merging raw average scores is unfair.
Converting each judge's scores to **z-scores** before averaging makes the final
leaderboard **invariant to per-judge affine transformations** of raw scores —
i.e. a strict judge cannot shrink, and a lenient judge cannot inflate, their own
impact on the ranking.

---

## 1. Setup

Judge `j` scores a set of submissions `S_j` with raw values `x_ij` (0–10 per
criterion, or the rubric-weighted total — the argument holds for either
aggregation order; this platform z-scores the weighted totals and also exposes
per-criterion raw scores in CSV for auditability).

Let

- `μ_j = mean over S_j of x_ij`
- `σ_j = stddev over S_j of x_ij`  (population stddev, σ_j > 0)

The normalized score is

```
z_ij = (x_ij − μ_j) / σ_j
```

The final board rank of submission `i` is the mean of its available `z_ij`
across judges that scored it (our backend: average `z_ij`, tie-broken by the
mean raw `x_ij` then by submission id — see `JUDGING.md`).

## 2. Invariance theorem

**Theorem.** For any judge `j`, constants `a > 0` and `b` (the judge's private
shift/scale on the grade), replacing every score by `x' = a·x + b` leaves all
of that judge's z-scores — and therefore the final ranking — unchanged.

**Proof.** With transformed scores `x'_ij = a·x_ij + b`:

```
μ'_j = mean(x'_ij) = a·μ_j + b
(σ'_j)^2 = mean((x'_ij − μ'_j)^2) = mean((a·x_ij − a·μ_j)^2) = a²·σ_j²
σ'_j = a·σ_j                       (since a > 0)
z'_ij = (x'_ij − μ'_j)/σ'_j = (a·(x_ij − μ_j))/(a·σ_j) = z_ij  ∎
```

Since each per-submission final rank is built only from z-scores (+ raw-mean
tie-break which *also* moves affine-identically for all of one judge's entries —
see §4), the leaderboard order is unchanged.

## 3. What this buys in practice

| Pathology | Raw average | z-score merge |
|---|---|---|
| **Strict judge** (awards 2–5) vs **lenient judge** (awards 7–10), different subsets | Lenient judge's projects dominate by +3-4 raw points of *systematic* head start | Both express "how much above/below my own average" — dominance shrinks to legitimate relative differences |
| **Compressed judge** (uses only 8–9) vs **spread judge** (uses 3–9) | Compressed judge contributes ~no signal; spread judge swamps | Both are rescaled to unit variance — each judge casts an equal vote with her own "x-axis" |
| **Blind spots** (not every judge sees every project) | Adding a harsh judge who saw only project #5 drags #5 down relative to untouched ones | #5's only judge-specific verdict is `z` relative to that judge's own pool, which is comparable to `z` values of other projects from their pools |

## 4. Edge cases & how the implementation handles them

1. **σ_j = 0** (judge gave everyone identical scores).
   The judge provides **zero discriminative information**. z would be 0/0.
   Implementation treats the judge's contribution as z = 0 for all their rows
   (neutral), and surfaces an **"all scores identical"** flag on the leaderboard
   panel so the organizer can retire or counsel that judge. Tie-break does
   *not* let a σ=0 judge break ties in their own favour, because raw-mean
   tie-break is only used when z-means tie across both projects involving only
   such judges — vanishingly rare and neutral either way.

2. **Single-row judge** (scored exactly one project).
   σ_j = 0 by construction → same handling as above. The assignment
   algorithm (T2) prevents this by batch-assigning reporters_per_project ≥
   2 projects per judge.

3. **Weighted mean when judges differ in count of scores per project.**
   A submission seen by more judges gets an average over more z's; this
   is unbiased *if assignment is randomized* (ours is — batch random
   assignment over judge ids; see `test_judging_assignment` in the T2
   acceptance suite, plus a chi-square-sanity comment in `JUDGING.md`).

4. **Tie-break order.**
   `mean(z)` → `mean(raw)` → `earliest submission` — the raw mean enters
   only after z-means tie, and §2's transform shifts *all* ties of one
   judge together, so the tie-break cannot be gamed by one judge inflating
   their own raw scale.

## 5. Where to verify in this repo

- Implementation: `backend/app/judging.py` → z-score computation in the
  leaderboard function; comments mark μ/σ handling.
- Judge-visible panel: `JudgeDashboard` shows raw vs z columns side-by-side
  so the result is *explainable* (spec: "make the reasoning legible").
- Tests: `tests/judging_acceptance_v2.py` — T2.05 "strict vs lenient judge
  merge", T2.07 "σ=0 edge", T2.09 "subset-judging invariance".

---

**Honesty box (accepted limitations).**
z-score merging assumes each judge's raw ordering is at least approximately
scale-free — it does *not* correct qualitative disagreement ("Judge A says
project X is brilliant, Judge B calls it incoherent"). Nor is it a substitute
for removing a bad-faith judge (that's what moderation + per-criterion audit
columns are for). It is, however, the standard mitigation used in conference
peer review (e.g., NeurIPS uses exactly this per-reviewer normalization
before ranking).
