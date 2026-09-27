import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Navbar, fmtDay } from '../components/ui'

const inputCls =
  'w-full rounded-lg border-2 border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white placeholder:font-normal placeholder:text-slate-500 outline-none transition focus:border-indigo-500 disabled:opacity-50'
const lbl = 'mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400'

const ROLE_META = {
  user: { icon: '👤', label: 'Participant', cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40' },
  admin: { icon: '🛡️', label: 'Admin', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
  judge: { icon: '⚖️', label: 'Judge', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
}

/* ---------------- personal details editor (shared) ---------------- */

function EditDetails({ me, onSaved }) {
  const { setUser } = useAuth()
  const [name, setName] = useState(me.name || '')
  const [email, setEmail] = useState(me.email || '')
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  async function save(e) {
    e.preventDefault()
    setBusy(true); setMsg(''); setErr('')
    try {
      const payload = {}
      if (name.trim() !== me.name) payload.name = name.trim()
      if (email.trim().toLowerCase() !== me.email) payload.email = email.trim()
      if (newPw) {
        payload.current_password = curPw
        payload.new_password = newPw
      }
      if (!Object.keys(payload).length) {
        setMsg('Nothing changed 🙂')
        setBusy(false)
        return
      }
      const updated = await api.patch('/auth/profile', payload)
      setUser(updated)
      onSaved(updated)
      setCurPw(''); setNewPw('')
      setMsg(payload.new_password ? '✅ Saved — new password works from your next login!' : '✅ Profile updated!')
    } catch (er) {
      setErr(er.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="card space-y-4 p-6">
      <h3 className="text-lg font-bold text-white">✏️ Edit personal details</h3>
      <div>
        <label className={lbl}>Username / display name</label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
      </div>
      <div>
        <label className={lbl}>Email</label>
        <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label className={lbl}>
          Phone number <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">LOCKED 🔒</span>
        </label>
        <input className={`${inputCls} cursor-not-allowed text-slate-500`} value={me.phone || 'Not provided yet'} disabled readOnly
          title="Phone belongs to each event registration — it can't be changed from here" />
        <p className="mt-1 text-[11px] text-slate-500">Phone number can't be edited here — it's part of each event's registration form 🔒</p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Change password (optional)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl}>Current password</label>
            <input type="password" className={inputCls} value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="••••••••" />
          </div>
          <div>
            <label className={lbl}>New password</label>
            <input type="password" className={inputCls} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="min 6 chars" minLength={newPw ? 6 : undefined} />
          </div>
        </div>
        {newPw && !curPw && <p className="mt-1 text-xs text-amber-300">Current password required to change it</p>}
      </div>
      {msg && <p className="text-sm font-bold text-emerald-400">{msg}</p>}
      {err && <p className="text-sm font-bold text-rose-400">{err}</p>}
      <button
        type="submit"
        disabled={busy || !!(newPw && !curPw)}
        className="w-full rounded-xl bg-indigo-500 py-2.5 font-extrabold text-white hover:bg-indigo-400 disabled:opacity-50"
      >
        {busy ? 'Saving…' : '💾 Save changes'}
      </button>
    </form>
  )
}

/* ---------------- stat chip ---------------- */
function Stat({ icon, label, value }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="text-xl font-black text-white">{value}</p>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      </div>
    </div>
  )
}

export default function Profile() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [err, setErr] = useState('')

  const load = () => api.get('/auth/profile').then(setProfile).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  const role = ROLE_META[user?.role] || ROLE_META.user

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-8">
        {err && <p className="mb-4 rounded-lg bg-rose-500/10 p-3 text-sm font-bold text-rose-300">{err}</p>}
        {!profile && !err && <p className="p-10 text-center text-slate-400">Loading your profile…</p>}
        {profile && (
          <>
            {/* header card */}
            <div className="card flex flex-wrap items-center gap-5 p-6">
              <div className="grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 text-4xl font-black text-white shadow-lg">
                {(profile.name || '?').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <h1 className="text-3xl font-extrabold tracking-tight text-white">{profile.name}</h1>
                <p className="text-slate-400">{profile.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full border px-3 py-1 font-extrabold ${role.cls}`}>
                    {role.icon} {role.label}
                  </span>
                  {user?.role === 'admin' ? (
                    <span className="text-slate-400">🛡️ Admin since <b className="text-white">{fmtDay(profile.created_at)}</b></span>
                  ) : (
                    <span className="text-slate-400">🗓️ Joined <b className="text-white">{fmtDay(profile.created_at)}</b></span>
                  )}
                  {profile.last_login && (
                    <span className="text-slate-500">· Last login {fmtDay(profile.last_login)}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              {/* left column: edit */}
              <div className="lg:col-span-1">
                <EditDetails me={profile} onSaved={() => load()} />
              </div>

              {/* right column: role-specific */}
              <div className="space-y-6 lg:col-span-2">
                {user?.role === 'admin' ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Stat icon="🎪" label="Events I created" value={profile.stats.events_created} />
                      <Stat icon="🌐" label="Platform events" value={profile.stats.total_events} />
                      <Stat icon="👥" label="Participants" value={profile.stats.total_participants} />
                      <Stat icon="⚖️" label="Judges" value={profile.stats.total_judges} />
                      <Stat icon="🛡️" label="Admins" value={profile.stats.total_admins} />
                      <Stat icon="📦" label="Submissions" value={profile.stats.total_submissions} />
                    </div>
                    <div className="card p-6">
                      <h3 className="mb-3 text-lg font-bold text-white">🎪 Events made by me</h3>
                      {profile.my_events.length === 0 && (
                        <p className="text-sm text-slate-500">No events created by you yet — head to the ✨ Create event tab!</p>
                      )}
                      <ul className="space-y-2">
                        {profile.my_events.map((e) => (
                          <li key={e.id}>
                            <button
                              onClick={() => navigate(`/event/${e.slug}`)}
                              className="flex w-full items-center justify-between rounded-lg bg-slate-950/60 px-4 py-2.5 text-left text-sm hover:bg-slate-800"
                            >
                              <span className="font-semibold text-white">{e.title}</span>
                              <span className={e.status === 'ongoing' ? 'font-bold text-emerald-300' : 'text-slate-500'}>
                                {e.status === 'ongoing' ? '🔴 LIVE' : e.status}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Stat icon="🎟️" label="Events joined" value={profile.stats.events_joined} />
                      <Stat icon="👑" label="Teams led" value={profile.stats.teams_led} />
                      <Stat icon="📦" label="Submissions" value={profile.stats.submissions} />
                      <Stat icon="💯" label="Total pts" value={profile.stats.total_pts} />
                      <Stat icon="🏆" label="Podium finishes" value={profile.stats.podiums} />
                      <Stat icon="⚖️" label="Projects judged" value={profile.stats.projects_judged} />
                    </div>

                    {/* achievements */}
                    <div className="card p-6">
                      <h3 className="mb-3 text-lg font-bold text-white">🏅 Achievements</h3>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {profile.achievements.map((a) => (
                          <div
                            key={a.title}
                            title={a.desc}
                            className={`rounded-xl border p-3 text-center transition ${
                              a.earned
                                ? 'border-amber-500/40 bg-amber-500/10'
                                : 'border-slate-800 bg-slate-950/40 opacity-40 grayscale'
                            }`}
                          >
                            <p className="text-2xl">{a.icon}</p>
                            <p className="mt-1 text-xs font-extrabold text-white">{a.title}</p>
                            <p className="text-[10px] text-slate-400">{a.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* history */}
                    <div className="card p-6">
                      <h3 className="mb-3 text-lg font-bold text-white">📜 Event history</h3>
                      {profile.history.length === 0 && (
                        <p className="text-sm text-slate-500">No events joined yet — your journey starts on the home page!</p>
                      )}
                      <ol className="space-y-2">
                        {profile.history.map((h) => (
                          <li key={h.event_id}>
                            <button
                              onClick={() => navigate(`/event/${h.event_slug}`)}
                              className="flex w-full flex-wrap items-center gap-3 rounded-lg bg-slate-950/60 px-4 py-3 text-left text-sm hover:bg-slate-800"
                            >
                              <span className="text-xl">{h.team_avatar || '🎟️'}</span>
                              <span className="flex-1">
                                <span className="font-bold text-white">{h.event_title}</span>
                                <span className="ml-2 text-xs text-slate-500">
                                  {h.team_name ? `${h.is_leader ? '👑 ' : ''}${h.team_name}` : 'no team'}
                                </span>
                              </span>
                              {h.submission_status === 'submitted' ? (
                                <span className="text-xs font-bold text-emerald-300">
                                  📦 {h.submission_title} {h.has_file ? `(${h.file_type?.toUpperCase()})` : ''}
                                </span>
                              ) : h.submission_status === 'draft' ? (
                                <span className="text-xs font-bold text-amber-300">✏️ draft</span>
                              ) : (
                                <span className="text-xs text-slate-600">no submission</span>
                              )}
                              {h.rank && <span className="font-black text-amber-300">#{h.rank}</span>}
                              {h.pts > 0 && <span className="font-bold text-emerald-300">{h.pts} pts</span>}
                              <span className={h.event_status === 'ongoing' ? 'text-xs font-bold text-emerald-300' : 'text-xs text-slate-600'}>
                                {h.event_status === 'ongoing' ? '🔴' : h.event_status}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
