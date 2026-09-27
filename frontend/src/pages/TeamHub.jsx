import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Navbar, GENDER_ICON } from '../components/ui'
import ChatLounge from '../components/ChatLounge'

const AVATAR_CHOICES = ['⚡', '🚀', '🧠', '🦉', '🐉', '🏴‍☠️', '🤖', '🔥', '🛡️', '🎯', '🌊', '🦊', '🐺', '💎', '🎮', '🛸']

function Avatar({ team }) {
  // priority: uploaded team cover thumbnail → external avatar image URL → emoji
  if (team.has_thumbnail)
    return (
      <img
        src={`/api/teams/${team.id}/thumbnail`}
        alt={team.name}
        className="h-14 w-14 rounded-2xl border border-slate-700 object-cover"
      />
    )
  if (team.avatar_url?.startsWith('http') || team.avatar_url?.startsWith('/'))
    return (
      <img
        src={team.avatar_url}
        alt={team.name}
        className="h-14 w-14 rounded-2xl border border-slate-700 object-cover"
      />
    )
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-3xl">
      {team.avatar_url || '⚡'}
    </div>
  )
}

export default function TeamHub() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [event, setEvent] = useState(null)
  const [teams, setTeams] = useState(null)
  const [myReg, setMyReg] = useState(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(0)
  const [expanded, setExpanded] = useState(null) // team id whose roster is open

  const load = () => {
    api.get(`/teams/event/${event.id}`).then(setTeams).catch(() => setTeams([]))
  }

  useEffect(() => {
    api
      .get(`/events/${slug}`)
      .then((e) => {
        setEvent(e)
        api.get(`/teams/event/${e.id}`).then(setTeams).catch(() => setTeams([]))
        api
          .get('/registrations/mine')
          .then((regs) => setMyReg(regs.find((r) => r.event_id === e.id) || null))
          .catch(() => {})
      })
      .catch(() => setEvent(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  async function join(team) {
    setErr(''); setMsg(''); setBusy(team.id)
    try {
      await api.post(`/teams/${team.id}/join`)
      setMsg(`✅ Joined "${team.name}"! Go back to the event page to see your team.`)
      api
        .get('/registrations/mine')
        .then((regs) => setMyReg(regs.find((r) => r.event_id === event.id) || null))
      load()
    } catch (er) {
      setErr(er.message)
    } finally {
      setBusy(0)
    }
  }

  if (event === false)
    return (
      <div className="min-h-screen">
        <Navbar />
        <p className="p-10 text-center text-slate-400">Event not found.</p>
      </div>
    )
  if (!event || teams === null)
    return (
      <div className="min-h-screen">
        <Navbar />
        <p className="p-10 text-slate-400">Loading teams…</p>
      </div>
    )

  const canJoin = myReg && !myReg.team_id

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <button onClick={() => navigate(`/event/${slug}`)} className="mb-4 text-sm text-indigo-300 hover:underline">
          ← Back to {event.title}
        </button>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">🤝 Team Hub</h1>
            <p className="mt-1 text-slate-400">
              {event.title} — browse the squads. Green badge = open slots available.
            </p>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm text-slate-300">
            {teams.length} {teams.length === 1 ? 'team' : 'teams'}
          </span>
        </div>

        {!myReg && (
          <div className="card mb-6 border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-300">
            ⚠️ You are not registered for this event yet. Register on the event page first, then you can join a team here.
          </div>
        )}
        {myReg && !myReg.team_id && (
          <div className="card mb-6 border-emerald-500/40 bg-emerald-500/5 p-4 text-sm text-emerald-300">
            🎉 You are registered and free! Pick any team with an open slot below — or use an invite link/code on the event page.
          </div>
        )}
        {myReg?.team_id && (
          <div className="card mb-6 border-indigo-500/40 bg-indigo-500/5 p-4 text-sm text-indigo-300">
            ✓ You are already on a team. Your teammates-only hub is on the event page.
          </div>
        )}
        {err && <p className="mb-4 text-sm font-bold text-rose-400">{err}</p>}
        {msg && <p className="mb-4 text-sm font-bold text-emerald-400">{msg}</p>}

        {myReg && <div className="mb-6"><ChatLounge eventId={event.id} user={user} /></div>}

        {teams.length === 0 ? (
          <div className="card p-10 text-center text-slate-400">
            No teams yet — be the first to create one from the event page!
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => {
              const slots = Math.max(0, (t.max_members || 4) - t.member_count)
              const full = slots === 0
              const joinable = canJoin && !full && t.is_open
              const mine = myReg?.team_id === t.id
              const open = expanded === t.id
              return (
                <div
                  key={t.id}
                  className={`card relative p-5 transition ${
                    mine ? 'border-indigo-500/70 ring-1 ring-indigo-500/40' : ''
                  }`}
                >
                  {mine && (
                    <span className="absolute right-3 top-3 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-indigo-300">
                      Your team
                    </span>
                  )}

                  {/* clicking the team toggles the full roster view */}
                  <button
                    onClick={() => setExpanded(open ? null : t.id)}
                    className="block w-full text-left"
                    title={open ? 'Hide members' : 'Show all members'}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar team={t} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-extrabold text-white">
                          {t.name}
                          <span className="ml-2 text-xs font-bold text-slate-500">{open ? '▲ hide' : '▼ members'}</span>
                        </p>
                        {t.tagline && <p className="text-xs italic text-slate-400">{t.tagline}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              full
                                ? 'bg-rose-500/15 text-rose-300'
                                : 'bg-emerald-500/15 text-emerald-300'
                            }`}
                          >
                            {full ? 'Full' : `${slots} slot${slots === 1 ? '' : 's'} open`}
                          </span>
                          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300">
                            {t.member_count}/{t.max_members || 4} members
                          </span>
                          {!t.is_open && (
                            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
                              🔒 Invite only
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* roster — expanded on click */}
                  {open && t.members?.length > 0 && (
                    <div className="mt-3 border-t border-slate-800 pt-3">
                      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                        Squad
                      </p>
                      <ul className="space-y-2">
                        {t.members.map((m, i) => (
                          <li key={i} className="rounded-lg bg-slate-950/70 px-3 py-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-semibold text-slate-100">
                                {GENDER_ICON[m.gender] && <span className="mr-1.5">{GENDER_ICON[m.gender]}</span>}
                                {i === 0 ? '👑 ' : ''}{m.name}
                                {i === 0 && (
                                  <span className="ml-1.5 rounded bg-amber-600/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                                    leader
                                  </span>
                                )}
                              </span>
                              <span className="text-xs text-slate-500">{m.institution || '—'}</span>
                            </div>
                            {m.skills && (
                              <p className="mt-1 text-[11px] text-slate-400">🛠 {m.skills}</p>
                            )}
                            {m.email && (
                              <p className="text-[11px] text-slate-500">✉️ {m.email}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {canJoin && !mine && (
                    <button
                      onClick={() => join(t)}
                      disabled={!joinable || busy === t.id}
                      className={`mt-4 w-full rounded-lg py-2 text-sm font-bold transition disabled:opacity-40 ${
                        joinable
                          ? 'bg-indigo-500 text-white hover:bg-indigo-400'
                          : 'border border-slate-700 text-slate-500'
                      }`}
                    >
                      {busy === t.id
                        ? 'Joining…'
                        : full
                          ? 'Team full'
                          : !t.is_open
                            ? 'Invite only'
                            : `Join ${t.name}`}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
