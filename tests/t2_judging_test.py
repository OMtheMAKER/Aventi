import json, urllib.request, urllib.error, datetime

BASE = "http://localhost:8000/api"
def req(method, path, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp: return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b"{}")
        except: return e.code, {}

ok = fail = 0
def check(name, cond, extra=""):
    global ok, fail
    if cond: ok += 1; print(f"  PASS {name}")
    else: fail += 1; print(f"  FAIL {name} {extra}")

print("== T2.1 Custom rubric: create event ==")
_, d = req("POST", "/auth/login", {"email": "admin@platform.dev", "password": "admin123"})
adm = d["access_token"]
BASE_DATE = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
s, ev = req("POST", "/admin/events", {
    "title": "Design Wars",
    "start_date": (BASE_DATE - datetime.timedelta(days=1)).isoformat(),
    "end_date": (BASE_DATE + datetime.timedelta(days=7)).isoformat(),
    "rubric": [
        {"name": "Design", "weight": 50},
        {"name": "Craft", "weight": 30},
        {"name": "Story", "weight": 20},
    ],
}, adm)
check("event created with custom rubric", s in (200, 201) and len(ev.get("rubric", [])) == 3, str(ev)[:200])
eid = ev.get("id")

print("== T2.2 Rubric validation errors ==")
s, r = req("POST", "/admin/events", {
    "title": "Bad Weights",
    "start_date": BASE_DATE.isoformat(),
    "end_date": (BASE_DATE + datetime.timedelta(days=1)).isoformat(),
    "rubric": [{"name": "A", "weight": 60}, {"name": "B", "weight": 30}],
}, adm)
check("sum!=100 rejected", s == 400 and "100" in r.get("detail", ""), f"[{s}] {r}")
s, r = req("POST", "/admin/events", {
    "title": "Dup Names",
    "start_date": BASE_DATE.isoformat(),
    "end_date": (BASE_DATE + datetime.timedelta(days=1)).isoformat(),
    "rubric": [{"name": "X", "weight": 50}, {"name": "x", "weight": 50}],
}, adm)
check("duplicate names rejected", s == 400, f"[{s}] {r}")
s, r = req("POST", "/admin/events", {
    "title": "Zero Weight",
    "start_date": BASE_DATE.isoformat(),
    "end_date": (BASE_DATE + datetime.timedelta(days=1)).isoformat(),
    "rubric": [{"name": "A", "weight": 100}, {"name": "B", "weight": 0}],
}, adm)
check("zero weight rejected", s == 400, f"[{s}] {r}")

print("== T2.3 Team submits + judge scores on custom rubric ==")
_, d = req("POST", "/auth/login", {"email": "bob@demo.dev", "password": "password123"})
bob = d["access_token"]
s, reg = req("POST", "/registrations", {"event_id": eid, "name": "Bob", "team_name": "Pixel Pros"}, bob)
check("registered", s in (200, 201), str(reg)[:150])
s, sub = req("POST", f"/submissions?event_id={eid}", {
    "title": "PixelPerfect", "description": "A design QA tool",
    "repo_url": "https://github.com/px/p",
}, bob)
check("submission created", s in (200, 201), str(sub)[:150])
sid = sub["id"]
s, r = req("POST", f"/submissions/{sid}/submit", token=bob)
check("submitted", s == 200, f"[{s}]")

_, d = req("POST", "/auth/login", {"email": "judge@demo.dev", "password": "judge123"})
judge = d["access_token"]
s, r = req("POST", "/judging/assign", {"event_id": eid, "per_submission": 5}, adm)
check("batch assign ok (all judges assigned)", s == 200, str(r))
s, q = req("GET", "/judging/queue", token=judge)
mine = next((i for i in q if i["submission_id"] == sid), None)
check("queue has rubric (3 criteria)", mine and len(mine.get("rubric", [])) == 3, str(mine and mine.get("rubric")))
check("rubric is custom (Design=50%)", mine and mine["rubric"][0]["name"] == "Design" and mine["rubric"][0]["weight"] == 50)

s, sc = req("POST", f"/judging/score/{sid}", {
    "breakdown": {"Design": 9, "Craft": 8, "Story": 7},
    "comment": "Beautiful but thin on story",
}, judge)
check("custom-rubric score saved", s == 200 and sc.get("breakdown", {}).get("Design") == 9, str(sc)[:200])
check("rubric snapshot recorded", sc.get("rubric_snapshot") and sc["rubric_snapshot"][0]["name"] == "Design")

s, r = req("POST", f"/judging/score/{sid}", {"breakdown": {"Design": 9, "Craft": 8}}, judge)
check("missing criterion rejected", s == 400, f"[{s}] {r}")
s, r = req("POST", f"/judging/score/{sid}", {"breakdown": {"Design": 11, "Craft": 8, "Story": 7}}, judge)
check("out-of-range rejected", s == 400, f"[{s}] {r}")

print("== T2.4 Leaderboard reflects custom weights ==")
s, lb = req("GET", f"/judging/leaderboard/{eid}", token=adm)
row = lb[0] if lb else {}
check("weighted total uses 50/30/20 -> 8.3", row.get("avg_raw") == 8.3, f"got {row.get('avg_raw')}")

print("== T2.5 Legacy default rubric still works ==")
_, qs = req("GET", "/judging/queue", token=judge)
genai = next((i for i in qs if i["submission_id"] == 1), None)
check("genai queue item has default 4-criterion rubric", genai and len(genai["rubric"]) == 4)
check("genai prefill from legacy score", genai and genai.get("my_breakdown"), str(genai and genai.get("my_breakdown")))

print("== T2.6 CSV exports - all stages ==")
def csv_len(path, token):
    try:
        with urllib.request.urlopen(urllib.request.Request(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"})) as r:
            return r.status, r.read().decode().count("\n")
    except urllib.error.HTTPError as e: return e.code, 0

s, n = csv_len(f"/admin/export/registrations/{eid}.csv", adm); check(f"registrations CSV [{s}, {n-1} rows]", s == 200 and n >= 2)
s, n = csv_len(f"/admin/export/submissions/{eid}.csv", adm);  check(f"submissions CSV [{s}, {n-1} rows]", s == 200 and n >= 2)
s, n = csv_len(f"/admin/export/scores/{eid}.csv", adm);       check(f"raw scores CSV [{s}, {n-1} rows]", s == 200 and n >= 2)
s, n = csv_len(f"/admin/export/judges/{eid}.csv", adm);       check(f"judge progress CSV [{s}, {n-1} rows]", s == 200 and n >= 2)
s, n = csv_len(f"/admin/export/votes/{eid}.csv", adm);        check(f"votes CSV [{s}, {n-1} rows]", s == 200 and n >= 2)
s, n = csv_len(f"/judging/export/{eid}.csv", adm);            check(f"leaderboard CSV [{s}, {n-1} rows]", s == 200 and n >= 2)

with urllib.request.urlopen(urllib.request.Request(f"{BASE}/admin/export/scores/{eid}.csv", headers={"Authorization": f"Bearer {adm}"})) as r:
    txt = r.read().decode()
check("scores CSV has Design/Craft/Story columns", "Design" in txt and "Craft" in txt and "Story" in txt)
check("scores CSV shows weighted 8.3", "8.3" in txt)

print("== T2.7 CSV role isolation ==")
try:
    urllib.request.urlopen(f"{BASE}/admin/export/scores/{eid}.csv")
    check("anon cannot export", False)
except urllib.error.HTTPError as e:
    check("anon cannot export (401)", e.code == 401)
try:
    urllib.request.urlopen(urllib.request.Request(f"{BASE}/admin/export/scores/{eid}.csv", headers={"Authorization": f"Bearer {judge}"}))
    check("judge cannot export", False)
except urllib.error.HTTPError as e:
    check("judge cannot export (403)", e.code == 403)

s, r = req("DELETE", f"/admin/events/{eid}", token=adm)
check("test event cleaned up", s == 200, str(r)[:120])

print(f"\n===== {ok} PASS / {fail} FAIL =====")
exit(1 if fail else 0)
