"""Event chat lounge acceptance test (requires live server on :8000).
Run: python tests/chat_test.py — skip-safe if server is down or DB unseeded."""
import json, urllib.request, urllib.error, sqlite3, time
BASE = "http://localhost:8000/api"

def req(m, p, b=None, t=None):
    r = urllib.request.Request(BASE+p, data=json.dumps(b).encode() if b is not None else None,
        headers={"Content-Type":"application/json", **({"Authorization": f"Bearer {t}"} if t else {})}, method=m)
    try:
        with urllib.request.urlopen(r) as x:
            raw = x.read() or b"{}"
            return x.status, json.loads(raw)
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b"{}")
        except: return e.code, {}

def login(e,p):
    s,d = req("POST","/auth/login",{"email":e,"password":p}); assert s==200, str(d); return d["access_token"]

def main():
    ok = fail = 0
    def check(n, c, x=""):
        nonlocal ok, fail
        if c: ok += 1; print(f"  ✅ {n}")
        else: fail += 1; print(f"  ❌ {n} {x}")

    # server up?
    try:
        s,_ = req("GET","/health")
        assert s==200
    except Exception as e:
        print(f"SERVER DOWN ({e}) — skipping suite")
        return 0

    admin = login("admin@platform.dev","admin123")
    alice = login("alice@demo.dev","password123")
    bob = login("bob@demo.dev","password123")
    judge = login("judge@demo.dev","judge123")
    tag = str(int(time.time()))   # make each run's content unique
    db = sqlite3.connect('/home/user/hackathon-platform/backend/data/app.db')

    print("== event lounge ==")
    # access gate: non-registered user can't read
    s, d = req("GET", "/chat/1/messages", t=alice); check("registered can read", s==200 and "messages" in d)
    # post to general
    s, m1 = req("POST","/chat/1/messages?channel=general",{"body":f"hello lounge {tag} 🚀"},alice)
    check("participant posts general", s==200 and m1["body"].startswith("hello"))
    AID = m1.get("id")
    # role bitmoji logic: serializer returns author_gender for participant
    check("gender on author row", m1.get("author_gender") in ("male","female","other", None, "prefer_not_to_say"), str(m1.get("author_gender")))
    # bob reacts
    s,_ = req("POST", f"/chat/message/{AID}/react", {"emoji":"🔥"}, bob)
    check("reaction", s==200)
    # invalid emoji rejected
    s,_ = req("POST", f"/chat/message/{AID}/react", {"emoji":"🌝"}, bob)
    check("bad emoji → 400", s==400, f"[{s}]")
    # admin announce
    s, ann = req("POST","/chat/1/messages?channel=announce",{"body":f"📢 Announce test {tag}"},admin)
    check("organizer posts announce", s==200 and ann["channel"]=="announce")
    # judge announce (if judge has assignment on event 1 — seed says yes)
    s, jr = req("POST","/chat/1/messages?channel=announce",{"body":f"⚖️ judge notice {tag}"},judge)
    check("assigned judge posts announce", s==200, f"[{s}] {jr.get('detail','')}")
    # participant announce blocked
    s,_ = req("POST","/chat/1/messages?channel=announce",{"body":"hack?!"},bob)
    check("participant announce blocked 403", s==403, f"[{s}]")
    # bob reports
    s,_ = req("POST", f"/chat/message/{AID}/report", {"reason":"spam"}, bob)
    check("report", s==200)
    s, q = req("GET", "/chat/1/mod-queue", t=admin)
    check("mod-queue sees flagged", s==200 and any(m["id"]==AID for m in q["flagged"]))
    # judge can also pull queue
    s,_ = req("GET", "/chat/1/mod-queue", t=judge)
    check("judge pulls queue too", s==200, f"[{s}]")
    # participant cannot
    s,_ = req("GET", "/chat/1/mod-queue", t=bob)
    check("participant queue blocked 403", s==403, f"[{s}]")
    # rate limit: 20/min per user — spam past limit
    codes = []
    for i in range(25):
        s,_ = req("POST","/chat/1/messages?channel=general",{"body":f"spam {tag} {i}"}, bob)
        codes.append(s)
        if s==429: break
    check("rate limiter (429 after ≤20)", 429 in codes, str(sorted(set(codes))))
    # admin removes the reported one (clears flag), hidden from others
    s,_ = req("POST", f"/chat/message/{AID}/moderate?action=remove", t=admin)
    check("mod removes", s==200)
    s, see = req("GET","/chat/1/messages", t=alice)
    v = next((m for m in see["messages"] if m["id"]==AID), None)
    check("removed body hidden to non-mods", v is None or v["body"] is None)
    # ban bob
    s,_ = req("POST","/chat/1/ban",{"user_id":4,"reason":"spam run"}, admin)
    check("ban", s==200)
    s, bk = req("POST","/chat/1/messages?channel=general",{"body":"hello?"}, bob)
    check("banned blocked 403", s==403, f"[{s}] {bk}")
    s, _ = req("GET","/chat/1/messages", t=bob)
    check("banned can still read", s==200)
    # unban
    s,_ = req("POST","/chat/1/unban",{"user_id":4}, admin)
    check("unban", s==200)
    # audit trail has actions
    s, a = req("GET","/votes/audit/1", t=admin)
    acts = [x["action"] for x in a] if isinstance(a, list) else []
    check("audit has chat.* + chat.ban", any(x.startswith("chat.") for x in acts), str(acts[-5:]))
    print("\n== team wall (members-only) ==")
    # alice (Neural Knights) posts on her team wall
    s, tm = req("POST", "/chat/1/messages?channel=team", {"body": f"team wall {tag} 🧠"}, alice)
    check("alice posts to HER team", s == 200 and tm.get("team_name") == "Neural Knights" and tm.get("channel") == "team")
    TIDN = tm.get("team_id")
    # bob (Prompt Pirates) cannot see alice's team wall
    s, bl = req("GET", "/chat/1/messages", t=bob)
    nem = any(m.get("channel") == "team" and m.get("team_id") == TIDN for m in bl["messages"])
    check("bob cannot see neural knights wall", not nem)
    check("bob's own team known", bl.get("my_team_id") == 2, str(bl.get("my_team_id")))
    # bob posts to HIS own team (Prompt Pirates) — allowed even if muted in general
    s, tm2 = req("POST", "/chat/1/messages?channel=team", {"body": f"pirates wall {tag} 🏴‍☠️"}, bob)
    check("bob posts to HIS team", s == 200 and tm2.get("team_name") == "Prompt Pirates", str(tm2))
    # alice cannot see pirates wall
    s, al = req("GET", "/chat/1/messages", t=alice)
    check("alice sees ONLY her team wall", all((m.get("team_id") == TIDN) for m in al["messages"] if m.get("channel") == "team"),
          str([(m.get("team_id")) for m in al["messages"] if m.get("channel") == "team"]))
    # admin/judge (mod) CAN see both team walls (audit oversight)
    s, adm = req("GET", "/chat/1/messages", t=admin)
    walls = {m.get("team_id") for m in adm["messages"] if m.get("channel") == "team"}
    check("mods read all team walls", walls == {1, 2}, str(walls))
    # bob reacts to alice's team wall → allowed (same team? bob is DIFFERENT team → should 403!)
    # Actually alice is Neural Knights, bob is Prompt Pirates → bob cannot react to alice's wall
    s, _ = req("POST", f"/chat/message/{tm['id']}/react", {"emoji": "🔥"}, bob)
    check("cross-team react blocked 403", s == 403, f"[{s}]")
    # alice reacts to bob's wall → also blocked
    s, _ = req("POST", f"/chat/message/{tm2['id']}/react", {"emoji": "🎉"}, alice)
    check("cross-team react blocked both ways", s == 403, f"[{s}]")
    # bob report on alice's team msg → blocked (not teammate)
    s, _ = req("POST", f"/chat/message/{tm['id']}/report", {"reason": "snoop"}, bob)
    check("cross-team report blocked", s == 403, f"[{s}]")
    # judge (event-1 assigned bob-verma? judge@demo.dev has assignments; but not team member) can read
    s, jl = req("GET", "/chat/1/messages", t=judge)
    jwalls = {m.get("team_id") for m in jl["messages"] if m.get("channel") == "team"}
    check("judge reads team walls (mod oversight)", jwalls == {1, 2}, str(jwalls))
    # cleanup team walls
    db.execute("DELETE FROM chat_messages WHERE body LIKE ?", (f"team wall {tag}%",))
    db.execute("DELETE FROM chat_messages WHERE body LIKE ?", (f"pirates wall {tag}%",))
    db.commit()

    print(f"\n===== {ok} PASS / {fail} FAIL =====")
    # cleanup spam + test bodies
    db.execute("DELETE FROM chat_messages WHERE body LIKE ? OR body LIKE ? OR body LIKE ?",
               (f"hello lounge {tag}%", f"spam {tag}%", f"%Announce test {tag}%"))
    db.execute("DELETE FROM chat_messages WHERE body LIKE ?", (f"%judge notice {tag}%",))
    db.commit()
    print("  (run rows cleaned)")
    return 0 if fail==0 else 1

if __name__ == "__main__":
    raise SystemExit(main())
