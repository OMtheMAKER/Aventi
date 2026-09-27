"""Round-wise deliverables suite — per-round artifacts (PPT in R1, prototype
video in R2 …) saved independently on one submission.
Run:  python3 rounds_test.py http://localhost:8000
"""
import json, sys, urllib.request, urllib.error, datetime, uuid

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000") + "/api"

def req(method, path, body=None, token=None, raw=None, ctype=None):
    headers = {}
    if token: headers["Authorization"] = f"Bearer {token}"
    if raw is not None:
        headers["Content-Type"] = ctype or "application/json"
        data = raw
    elif body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    else:
        data = None
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            ct = resp.headers.get("Content-Type", "")
            payload = resp.read()
            return resp.status, (payload if "json" not in ct else json.loads(payload or b"{}"))
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b"{}")
        except Exception: return e.code, {}

def upload(token, path, filename, content):
    boundary = "----roundtest" + uuid.uuid4().hex[:12]
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: application/octet-stream\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    return req("POST", path, token=token, raw=body, ctype=f"multipart/form-data; boundary={boundary}")

ok = fail = 0
def check(name, cond, extra=""):
    global ok, fail
    if cond: ok += 1; print(f"  ✅ {name}")
    else: fail += 1; print(f"  ❌ {name} {extra}")


print("== setup: admin + event with 3 rounds ==")
_, d = req("POST", "/auth/login", {"email": "admin@platform.dev", "password": "admin123"})
adm = d["access_token"]
NOW = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
s, ev = req("POST", "/admin/events", {
    "title": f"Roundflow Cup {uuid.uuid4().hex[:6]}",
    "start_date": (NOW - datetime.timedelta(hours=1)).isoformat(),
    "end_date": (NOW + datetime.timedelta(days=7)).isoformat(),
    "rounds": [
        {"name": "Round 1 — PPT Deck", "description": "Upload your deck"},
        {"name": "Round 2 — Prototype Video", "description": "Link to a 2-min demo"},
        {"name": "Round 3 — Final Build", "description": "Ship the real thing"},
    ],
}, adm)
check("event created with 3 rounds", s in (200, 201) and len(ev.get("rounds", [])) == 3, f"[{s}]")
eid = ev.get("id")

_, d = req("POST", "/auth/login", {"email": "bob@demo.dev", "password": "password123"})
bob = d["access_token"]
s, reg = req("POST", "/registrations", {"event_id": eid, "name": "Bob", "team_name": f"Round Runners {uuid.uuid4().hex[:4]}"}, bob)
check("bob registered", s in (200, 201), f"[{s}]")
s, sub = req("POST", f"/submissions?event_id={eid}", {"title": "RoundBot", "description": "demo", "repo_url": "https://github.com/rr/roundbot"}, bob)
check("draft submission created", s in (200, 201), f"[{s}]")
sid = sub.get("id")

print("== my rounds board ==")
s, bd = req("GET", f"/submissions/rounds/mine/{eid}", token=bob)
check("board lists all 3 rounds", s == 200 and len(bd.get("rounds", [])) == 3, f"[{s}]")
check("round names preserved in order", s == 200 and [r["name"] for r in bd["rounds"]][0].startswith("Round 1"), "")
check("all rounds pending initially", s == 200 and all(r["deliverable"] is None for r in bd["rounds"]), "")

print("== Round 1: link + note (PPT) ==")
s, r0 = req("POST", f"/submissions/{sid}/rounds/0", {"link_url": "https://drive.example.com/deck.pdf", "note": "PPT v1"}, bob)
check("R1 deliverable saved", s == 200 and r0.get("round_name", "").startswith("Round 1"), f"[{s}]")
check("snapshot of round name frozen", s == 200 and "PPT" in r0.get("round_name", ""), "")
r0_id = r0.get("id")
s, r0b = req("POST", f"/submissions/{sid}/rounds/0", {"note": "PPT v2 final"}, bob)
check("re-saving UPDATES the same round (no duplicate)", s == 200 and r0b.get("id") == r0_id and r0b.get("note") == "PPT v2 final", f"[{s}]")

print("== Round 2: file upload (prototype video placeholder) ==")
s, r1 = req("POST", f"/submissions/{sid}/rounds/1", {"link_url": "https://youtu.be/demo"}, bob)
check("R2 link saved independently", s == 200 and r1.get("id") != r0_id, f"[{s}]")
s, up = upload(bob, f"/submissions/{sid}/rounds/1/file", "prototype.mp4", b"FAKE-VIDEO-BYTES-12345")
check("R2 file uploaded", s == 200 and up.get("file_name") == "prototype.mp4", f"[{s}] {up}")
file_del_id = up.get("id")
s, raw = req("GET", f"/submissions/rounds/files/{file_del_id}")
check("file downloads back", s == 200 and raw == b"FAKE-VIDEO-BYTES-12345", f"[{s}]")

print("== guards ==")
_, d = req("POST", "/auth/login", {"email": "alice@demo.dev", "password": "password123"})
alice = d["access_token"]
s, r = req("POST", f"/submissions/{sid}/rounds/0", {"link_url": "https://evil.example.com"}, alice)
check("non-member cannot write rounds (403)", s == 403, f"[{s}]")
s, r = req("POST", f"/submissions/{sid}/rounds/9", {"link_url": "x"}, bob)
check("unknown round index rejected (400)", s == 400, f"[{s}]")
s, r = req("GET", f"/submissions/{sid}/rounds", token=alice)
check("stranger cannot view board (403)", s == 403, f"[{s}]")

print("== after final submit: judge sees deliverables ==")
s, fin = req("POST", f"/submissions/{sid}/submit", {}, bob)
check("final submit", s == 200 and fin.get("status") == "submitted", f"[{s}] {fin}")
s, j = req("POST", "/judging/assign", {"event_id": eid, "per_submission": 1}, adm)
_, d = req("POST", "/auth/login", {"email": "judge@demo.dev", "password": "judge123"})
jd = d["access_token"]
s, q = req("GET", "/judging/queue", token=jd)
mine = [i for i in (q if isinstance(q, list) else []) if i.get("submission_id") == sid]
check("judge queue carries round deliverables", s == 200 and mine and len(mine[0].get("deliverables", [])) == 2, f"[{s}]")
s, vr = req("GET", f"/submissions/{sid}/rounds", token=jd)
check("assigned judge can view board (200)", s == 200 and len(vr) == 2, f"[{s}]")

print("== round requirements: kind / accept / deadline ==")
NOW2 = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
PAST = (NOW2 - datetime.timedelta(hours=2)).isoformat()
s, ev2 = req("POST", "/admin/events", {
    "title": f"Config Cup {uuid.uuid4().hex[:6]}",
    "start_date": (NOW2 - datetime.timedelta(hours=1)).isoformat(),
    "end_date": (NOW2 + datetime.timedelta(days=7)).isoformat(),
    "rounds": [
        {"name": "Deck Round", "deliverable_kind": "file", "accept": "pptx,pdf"},
        {"name": "Demo Link Round", "deliverable_kind": "link"},
        {"name": "Expired Round", "deliverable_kind": "any", "deadline": PAST},
    ],
}, adm)
check("configured event created", s in (200, 201) and len(ev2.get("rounds", [])) == 3, f"[{s}] {ev2.get('detail')}")
eid2 = ev2.get("id"); slug2 = ev2.get("slug")
s, det = req("GET", f"/events/{slug2}")
rcfg = det.get("rounds", []) if s == 200 else []
check("event page exposes round config to participants", s == 200 and rcfg[0].get("accept") == "pptx,pdf" and rcfg[1].get("deliverable_kind") == "link" and bool(rcfg[2].get("deadline")), f"[{s}]")

s, reg = req("POST", "/registrations", {"event_id": eid2, "name": "Bob", "team_name": f"Cfg Runners {uuid.uuid4().hex[:4]}"}, bob)
s, sub2 = req("POST", f"/submissions?event_id={eid2}", {"title": "CfgBot", "description": "d", "repo_url": "https://github.com/rr/cfg"}, bob)
sid2 = sub2.get("id")
check("submission for configured event", s in (200, 201), f"[{s}]")

s, bd2 = req("GET", f"/submissions/rounds/mine/{eid2}", token=bob)
check("board carries kind/accept/deadline meta", s == 200 and bd2["rounds"][0].get("accept") == "pptx,pdf" and bd2["rounds"][2].get("deadline") is not None, f"[{s}]")
check("past-deadline round flagged closed", s == 200 and bd2["rounds"][2].get("closed") is True, "")

s, r = upload(bob, f"/submissions/{sid2}/rounds/0/file", "notes.txt", b"hello")
check("wrong extension rejected (400)", s == 400, f"[{s}] {r}")
s, r = upload(bob, f"/submissions/{sid2}/rounds/0/file", "deck.pdf", b"PDF-BYTES")
check("allowed extension accepted (.pdf)", s == 200 and r.get("file_name") == "deck.pdf", f"[{s}] {r}")
s, r = req("POST", f"/submissions/{sid2}/rounds/0", {"link_url": "https://x.example.com"}, bob)
check("link rejected when round wants file (400)", s == 400, f"[{s}]")

s, r = req("POST", f"/submissions/{sid2}/rounds/1", {"link_url": "https://youtu.be/demo2"}, bob)
check("link accepted in link-only round", s == 200, f"[{s}] {r}")
s, r = upload(bob, f"/submissions/{sid2}/rounds/1/file", "deck.pdf", b"PDF-BYTES")
check("file rejected when round wants link (400)", s == 400, f"[{s}]")

s, r = req("POST", f"/submissions/{sid2}/rounds/2", {"link_url": "https://late.example.com"}, bob)
check("save blocked after round deadline (400)", s == 400, f"[{s}]")
s, r = upload(bob, f"/submissions/{sid2}/rounds/2/file", "deck.pdf", b"PDF-BYTES")
check("upload blocked after round deadline (400)", s == 400, f"[{s}]")

print("== admin View-as-Judge preview ==")
_, me = req("GET", "/auth/me", token=jd)
judge_id = me.get("id")
s, fin = req("POST", f"/submissions/{sid2}/submit", {}, bob)
s, jx = req("POST", "/judging/assign", {"event_id": eid2, "per_submission": 1}, adm)
s, prev = req("GET", f"/judging/preview-queue/{judge_id}", token=adm)
items = prev if isinstance(prev, list) else []
pitem = [i for i in items if i.get("submission_id") == sid2]
check("preview-queue returns judge bench", s == 200 and len(items) >= 1, f"[{s}] {str(prev)[:120]}")
check("preview carries deliverables with file id",
      s == 200 and pitem and len(pitem[0].get("deliverables", [])) >= 2 and all("id" in d2 for d2 in pitem[0]["deliverables"]),
      f"[{s}] {str(pitem)[:160]}")
s, same = req("GET", "/judging/queue", token=jd)
qitem = [i for i in (same if isinstance(same, list) else []) if i.get("submission_id") == sid2]
check("preview payload parity with judge queue", bool(qitem) and qitem[0].get("submission_id") == (pitem[0].get("submission_id") if pitem else None), "")
s, r = req("GET", f"/judging/preview-queue/{judge_id}", token=bob)
check("preview denied for non-organizer (403)", s == 403, f"[{s}]")
_, me2 = req("GET", "/auth/me", token=alice)
s, r = req("GET", f"/judging/preview-queue/{me2.get('id')}", token=adm)
check("preview for non-judge user rejected (404/400)", s in (400, 404), f"[{s}]")
s, r = req("GET", f"/judging/preview-queue/{judge_id}")
check("preview requires auth (401)", s == 401, f"[{s}]")

print()
print(f"===== {ok} PASS / {fail} FAIL =====")
sys.exit(1 if fail else 0)
