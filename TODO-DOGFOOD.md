# Dogfood TODO

## T1 ✅ T2 ✅ T3 ✅ (delivered)
## T4 — built, tested, documented
- [x] REST API surface (docs at /docs)
- [x] Webhooks: 8 event types, per-event subscription, HMAC signature, delivery log, ping
- [x] Certificates: participation / winner (normalized board) / signed judge records; public verify
- [x] Embeddable gallery widget (iframe + script.js)
- [x] Bulk import participants.csv + 7 CSV exports + EVERYTHING.json
- [x] tests/t4_test.py → 27/27 (idempotent, re-runnable)
- [x] cert secret persisted (data/cert_secret.key; rotate = deliberate revoke-all)
- [x] Admin UI tab "🔌 Integrations" + user dashboard certificates
- [x] deliver zip → gofile
## Remaining after T4
- [x] bonus docs — THREE written (NormalProof / ThreatModel / ApiFirst)
- [x] event lounge chat — 2-column, react, report/mod queue, ban/unban, bitmojies
- [x] 11 new style thumbnails added to stock stack
- [x] acceptance-report.txt
- [ ] demo video
- [ ] GitHub push (user)
## Round-wise deliverables + per-round requirements (26 Sep)
- [x] Per-round artifact slots on one submission (save/upload independently; freeze-locked)
- [x] Organizer per-round config: artifact kind (any/link/file) + accepted extensions + per-round deadline — ALL server-enforced 400s, shown on event page + submission board (chips, ⛔ deadline lock)
- [x] Submit-final guard: pop-warning listing pending rounds (failed uploads can no longer reach judges as "nothing")
- [x] Judge card-level 🧩 deliverables strip (file download links + open-artifact links) + explicit empty state
- [x] Admin "👁 View as Judge" — GET /api/judging/preview-queue/{judge_id} (organizer-only; payload parity tested)
- [x] uploads raised to 200 MB; failure banner + "⏳ Uploading…" state (silent upload failure eliminated)
- [x] api.put helper restored (PUT /submissions crash — "T.put is not a function" — fixed)
- [x] tests/rounds_test.py → 36/36 · FULL RUN 152/152
