import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Navbar, EventCard, fmtDate } from '../components/ui'

export default function UserDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [regs, setRegs] = useState([])
  const [certs, setCerts] = useState([])

  useEffect(() => {
    api.get('/events').then(setEvents).catch(() => setEvents([]))
    api.get('/registrations/mine').then(setRegs).catch(() => setRegs([]))
    api.get('/certificates/mine').then(setCerts).catch(() => setCerts([]))
  }, [])

  const KIND = {
    participation: ['🎖', 'Certificate of Participation', 'border-indigo-500/30 bg-indigo-500/5'],
    winner: ['🏆', 'Certificate of Achievement', 'border-amber-500/40 bg-amber-500/10'],
    judge: ['⚖️', 'Judge Participation Record', 'border-purple-500/30 bg-purple-500/5'],
  }

  const registeredEventIds = new Set(regs.map((r) => r.event_id))
  const live = events.filter((e) => e.status === 'ongoing')
  const upcoming = events.filter((e) => e.status === 'upcoming')
  const past = events.filter((e) => e.status === 'past')

  const group = (list) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((e) => (
        <EventCard key={e.id} event={e} onClick={() => navigate(`/event/${e.slug}`)} />
      ))}
    </div>
  )

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Welcome, {user?.name?.split(' ')[0]} 👋</h1>
            <p className="text-slate-400">Track events, build your team, and submit projects.</p>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm text-slate-300">
            {user?.email}
          </span>
        </div>

        {regs.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-3 text-lg font-semibold">Your registrations</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {regs.map((r) => {
                const ev = events.find((e) => e.id === r.event_id)
                return (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/event/${ev?.slug}`)}
                    className="card p-4 text-left hover:border-indigo-500/60"
                  >
                    <p className="font-medium text-white">{ev?.title || 'Event'}</p>
                    <p className="text-xs text-slate-400">
                      Registered {fmtDate(r.created_at)}
                    </p>
                    <p className="mt-2 text-xs text-indigo-300">
                      {r.team_id ? 'In a team ✓' : 'No team yet'}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {certs.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-3 text-lg font-semibold">🎖 My certificates ({certs.length})</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {certs.map((c) => {
                const [emoji, label, cls] = KIND[c.kind] || KIND.participation
                  return (
                    <a key={c.id} href={c.print_url}
                      className={`card flex items-center gap-3 border p-4 transition hover:shadow-lg hover:shadow-indigo-500/10 ${cls}`}>
                      <span className="text-3xl">{emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-white">{c.event_title}</p>
                        <p className="text-xs text-slate-400">{label} · code <code className="text-indigo-300">{c.cert_code}</code></p>
                      </div>
                      <span className="text-xs font-bold text-indigo-300">open ↗</span>
                    </a>
                  )
              })}
            </div>
          </section>
        )}

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">Live events</h2>
          {live.length ? group(live) : <p className="text-slate-500">No live events right now.</p>}
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">Upcoming</h2>
          {upcoming.length ? group(upcoming) : <p className="text-slate-500">Nothing scheduled.</p>}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Past events</h2>
          {past.length ? group(past) : <p className="text-slate-500">No past events.</p>}
        </section>
      </div>
    </div>
  )
}
