"""T4 acceptance-style test: webhooks, certificates, widget, bulk import,
full export. Pure stdlib; hits a LIVE server on :8000.
Run: python tests/t4_test.py
"""
import json, urllib.request, urllib.error
import threading, time, hmac, hashlib
from http.server import HTTPServer, BaseHTTPRequestHandler

BASE = "http://localhost:8000/api"

def req(m, p, b=None, t=None):
    h = {"Content-Type": "application/json"}
    if t: h["Authorization"] = f"Bearer {t}"
    r = urllib.request.Request(BASE + p, data=json.dumps(b).encode() if b is not None else None, headers=h, method=m)
    try:
        with urllib.request.urlopen(r) as x:
            raw = x.read() or b"{}"
            ct = x.headers.get("content-type", "")
            if "html" in ct or "javascript" in ct:
                return x.status, raw.decode()
            return x.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b"{}")
        except: return e.code, {}

def login(e, p):
    s, d = req("POST", "/auth/login", {"email": e, "password": p})
    assert s == 200, str(d)
    return d["access_token"]

# ---- local webhook sink --------------------------------------------------
received, SECRETS = [], {}
class Sink(BaseHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n)
        sig = self.headers.get("X-Platform-Signature", "")
        ok = any("sha256=" + hmac.new(s.encode(), body, hashlib.sha256).hexdigest() == sig for s in SECRETS.values())
        received.append({"event": self.headers.get("X-Platform-Event"), "env": json.loads(body), "sig_ok": ok})
        self.send_response(200); self.end_headers(); self.wfile.write(b'{"ok":true}')
    def log_message(self, *a): pass

srv = HTTPServer(("127.0.0.1", 0), Sink)
PORT = srv.server_port
threading.Thread(target=srv.serve_forever, daemon=True).start()

ok = fail = 0
def check(n, c, x=""):
    global ok, fail
    if c: ok += 1; print(f"  ✅ {n}")
    else: fail += 1; print(f"  ❌ {n} {x}")

admin = login("admin@platform.dev", "admin123")
alice = login("alice@demo.dev", "password123")
judge = login("judge@demo.dev", "judge123")

# reentrancy: fresh event-3 webhook + cert canvas each run
import sqlite3
c = sqlite3.connect('/home/user/hackathon-platform/backend/data/app.db')
c.execute("DELETE FROM webhooks WHERE event_id=3")
c.execute("DELETE FROM certificates WHERE event_id=3")
c.execute("DELETE FROM audit_log WHERE event_id=3")
c.commit()

print("== webhooks ==")
s, et = req("GET", "/webhooks/event-types")
check("event-type registry", s == 200 and len(et["event_types"]) >= 8, str(et)[:120])
s, w = req("POST", "/events/3/webhooks", {"url": f"http://127.0.0.1:{PORT}/hook", "events": [], "description": "all-events sink"}, admin)
wid = w["id"]
check("create (+ subscribed to ALL via empty list)", s in (200, 201), str(w)[:130])
s, sc = req("GET", f"/webhooks/{wid}/secret", t=admin)
SECRETS[wid] = sc.get("secret")
check("signing secret readable", s == 200 and len(sc.get("secret", "")) >= 32)
s, r = req("POST", f"/webhooks/{wid}/ping", t=admin)
check("ping button", s == 200 and r.get("fired") == 1)
time.sleep(1.5)
pings = [x for x in received if x["event"] == "ping"]
check("delivered + HMAC-VERIFIED by receiver", len(pings) >= 1 and pings[0]["sig_ok"])
check("envelope format", "delivered_at" in pings[0]["env"] and "data" in pings[0]["env"], str(pings[0]["env"])[:150])
s, dl = req("GET", f"/webhooks/{wid}/deliveries", t=admin)
check("delivery log in API", s == 200 and any(d["ok"] == 1 for d in dl), str(dl)[:150])

print("\n== certificates ==")
s, r = req("POST", "/events/1/issue-certificates?kind=judge", {}, admin)
check("judge records", s == 200 and r.get("issued", 0) >= 1, str(r)[:120])
s, mine = req("GET", "/certificates/mine", t=judge)
check("judge /mine", any(x["kind"] == "judge" for x in mine))
jc = next(x for x in mine if x["kind"] == "judge")
check("record carries assignments+scored", isinstance((jc["meta"] or {}).get("assignments"), int), str(jc)[:170])

s, v = req("GET", f"/certificates/verify/{jc['cert_code']}")   # NO token
check("public verify, no login", s == 200 and v.get("valid") is True, str(v)[:150])
check("shows holder + kind + event", v.get("holder") and v.get("kind") == "judge" and v.get("event"), str(v)[:200])
s, v404 = req("GET", "/certificates/verify/nope-nope-nope")
check("unknown code → invalid, no exploit", s == 200 and v404.get("valid") is False)
s, html = req("GET", f"/certificates/{jc['cert_code']}/print")
check("print page", s == 200 and "SHA-256 HMAC" in html, "")

s, r = req("POST", "/events/1/issue-certificates?kind=participation", {}, admin)
check("participation for all regs (2 seeded)", r.get("issued") == 2)
before = req("GET", "/certificates/mine", t=alice)[1]
req("POST", "/events/1/issue-certificates?kind=participation", {}, admin)
after = req("GET", "/certificates/mine", t=alice)[1]
check("re-issue idempotent", len(before) == len(after))

print("\n== embeddable widget ==")
s, page = req("GET", "/widget/genai-sprint-2026")   # no token needed
check("iframe page serves submitted projects", s == 200 and "RAGatouille" in page and "PromptShip" in page)
check("links back to live gallery", "/event/genai-sprint-2026/gallery" in page)
s, js = req("GET", "/widget/genai-sprint-2026.js")
check("loader.js writes an iframe", s == 200 and "iframe" in js and "currentScript" in js, js[:100])
s, help_ = req("GET", "/widget")
check("usage help", s == 200 and "iframe" in str(help_))

print("\n== bulk import ==")
csv_data = b"name,email,team_name\nT4 Alpha,t4a@new.dev,T4 Squad\nT4 Beta,t4b@new.dev,T4 Squad\nBad,noemail,X\n"
bnd = b"---t4"
body = (b"--" + bnd + b'\r\nContent-Disposition: form-data; name="file"; filename="p.csv"\r\nContent-Type: text/csv\r\n\r\n'
        + csv_data + b"\r\n--" + bnd + b"--\r\n")
r_imp = urllib.request.Request(
    BASE + "/admin/import/participants/3?create_accounts=true", data=body,
    headers={"Content-Type": f"multipart/form-data; boundary={bnd.decode()}",
             "Authorization": f"Bearer {admin}"}, method="POST")
with urllib.request.urlopen(r_imp) as x: imp = json.loads(x.read())
check("2 created + 1 skipped (with reason)", imp.get("registrations_created") == 2
      and imp.get("accounts_created") == 2 and len(imp.get("skipped", [])) == 1
      and imp["skipped"][0]["why"], str(imp)[:220])
c2 = sqlite3.connect('/home/user/hackathon-platform/backend/data/app.db')
t = c2.execute("SELECT id FROM teams WHERE name='T4 Squad'").fetchone()
cnt = c2.execute("SELECT COUNT(*) FROM team_members WHERE team_id=?", t).fetchone()[0] if t else 0
check("team auto-created with 2 members", t is not None and cnt == 2)
s, d = req("POST", "/auth/login", {"email": "t4a@new.dev", "password": "welcome123"})
check("imported account logs in", s == 200)
with urllib.request.urlopen(urllib.request.Request(BASE + "/admin/import/participants/3", data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={bnd.decode()}",
                 "Authorization": f"Bearer {admin}"}, method="POST")) as x:
    imp2 = json.loads(x.read())
check("re-import idempotent (skips existing)", imp2.get("registrations_created") == 0 and len(imp2.get("skipped", [])) >= 2)

print("\n== full-event SUPER export ==")
r2 = urllib.request.Request(BASE + "/admin/export/event/3.json", headers={"Authorization": f"Bearer {admin}"})
with urllib.request.urlopen(r2) as x: dump = json.loads(x.read())
need = {"event", "teams", "registrations", "submissions", "judge_assignments", "scores", "votes", "comments", "audit_log", "certificates"}
check("covers every T1–T3 artifact", need.issubset(dump.keys()), str(need - set(dump.keys())))
check("imported people appear", any(r["email"] == "t4a@new.dev" for r in dump["registrations"]))
s, r403 = req("GET", "/admin/export/event/3.json", t=alice)
check("non-organizer export → 403", s in (401, 403), f"[{s}]")

# cleanup
c2.execute("DELETE FROM registrations WHERE event_id=3 AND email LIKE 't4%@new.dev'")
c2.execute("DELETE FROM team_members WHERE registration_id NOT IN (SELECT id FROM registrations)")
c2.execute("DELETE FROM users WHERE email LIKE 't4%@new.dev'")
c2.execute("DELETE FROM teams WHERE name='T4 Squad'")
c2.execute("DELETE FROM audit_log WHERE action='import.participants'")
c2.commit()
print("  (test rows cleaned)")
print(f"\n===== {ok} PASS / {fail} FAIL =====")
raise SystemExit(1 if fail else 0)
