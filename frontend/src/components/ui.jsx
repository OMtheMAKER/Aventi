import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { api } from '../api'

// Gender answer → display emoji (bitmoji-style picks for readability)
export const GENDER_ICON = {
  male: '👦',
  female: '👧',
  other: '🧑',
  prefer_not_to_say: '🤫',
}

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male', icon: '👦' },
  { value: 'female', label: 'Female', icon: '👧' },
  { value: 'prefer_not_to_say', label: 'Rather not say', icon: '🤫' },
]

export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function fmtDay(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const STATUS_STYLES = {
  ongoing: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  upcoming: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  past: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
}

export function StatusBadge({ status }) {
  const label = { ongoing: 'LIVE NOW', upcoming: 'UPCOMING', past: 'ENDED' }[status] || status
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        STATUS_STYLES[status] || STATUS_STYLES.past
      }`}
    >
      {status === 'ongoing' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
      {label}
    </span>
  )
}

export function EventCard({ event, onClick }) {
  return (
    <button
      onClick={onClick}
      className="card group overflow-hidden text-left transition hover:border-indigo-500/60 hover:shadow-lg hover:shadow-indigo-500/10"
    >
      <div className="h-2 w-full" style={{ background: event.cover }} />
      <div className="p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <StatusBadge status={event.status} />
          <span className="text-xs text-slate-400">{event.mode}</span>
        </div>
        <h3 className="text-xl font-bold text-white group-hover:text-indigo-300">
          {event.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-slate-400">{event.tagline}</p>
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span>{fmtDay(event.start_date)}</span>
          <span className="font-medium text-slate-300">{event.prize_pool}</span>
        </div>
      </div>
    </button>
  )
}

export function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [liveEvents, setLiveEvents] = useState([])

  // LIVE hackathon ticker — replaces any ad-chips; click through to the event
  useEffect(() => {
    api
      .get('/events')
      .then((evs) => setLiveEvents(evs.filter((e) => e.status === 'ongoing')))
      .catch(() => {})
  }, [])

  const isHome = location.pathname === '/'

  function goLogin() {
    if (isHome) {
      document.getElementById('login')?.scrollIntoView({ behavior: 'smooth' })
    } else {
      navigate('/', { state: { scrollTo: 'login' } })
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-1.5">
          {/* Back — every page except home, so you never land on the login page by accident */}
          {!isHome && (
            <button
              onClick={() => navigate(-1)}
              title="Back to the previous page"
              className="mr-1 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              ←
            </button>
          )}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-lg font-bold"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-500 text-white">⚡</span>
            <span className="hidden sm:inline">
              <span className="gradient-text">Aventi</span>
            </span>
          </button>
        </div>

        {/* LIVE hackathon chip — like the promo chip in big platforms, but ours shows a real event */}
        {liveEvents.length > 0 && (
          <button
            onClick={() => navigate(`/event/${liveEvents[0].slug}`)}
            className="hidden items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-extrabold text-emerald-300 transition hover:bg-emerald-500/20 md:flex"
            title={`${liveEvents[0].title} is live right now — open it`}
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <span className="max-w-[14rem] truncate">🔥 {liveEvents[0].title} — LIVE, join now</span>
          </button>
        )}

        <nav className="flex items-center gap-2.5 text-sm sm:gap-3">
          <button onClick={() => navigate('/')} className="hidden text-slate-300 hover:text-white sm:inline">
            Events
          </button>
          <button onClick={() => navigate('/support')} className="text-slate-300 hover:text-white" title="Help & support">
            🛟
          </button>
          {user ? (
            <>
              <button
                onClick={() =>
                  navigate(user.role === 'admin' ? '/admin' : user.role === 'judge' ? '/judge' : '/dashboard')
                }
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-slate-200 hover:bg-slate-700"
              >
                {user.role === 'admin' ? 'Admin' : user.role === 'judge' ? '⚖️ Judge bench' : 'Dashboard'}
              </button>
              {/* bell — count = events live right now */}
              <button
                onClick={() => navigate(liveEvents.length ? `/event/${liveEvents[0].slug}` : '/')}
                title={liveEvents.length ? `${liveEvents.length} live event${liveEvents.length > 1 ? 's' : ''} right now` : 'No live events right now'}
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                🔔
                {liveEvents.length > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
                    {liveEvents.length}
                  </span>
                )}
              </button>
              {/* avatar → profile page */}
              <button
                onClick={() => navigate('/profile')}
                title="My profile"
                className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-sm font-black text-white hover:ring-2 hover:ring-indigo-400"
              >
                {(user.name || user.email || '?').charAt(0).toUpperCase()}
              </button>
              <button
                onClick={() => {
                  logout()
                  navigate('/')
                }}
                className="hidden text-slate-400 hover:text-white sm:inline"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={goLogin}
              className="rounded-lg bg-indigo-500 px-3 py-1.5 font-medium text-white hover:bg-indigo-400"
            >
              Login
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}

export function StockThumbModal({ onPick, onClose, busy }) {
  const [items, setItems] = useState(null)
  useEffect(() => {
    api.get('/submissions/stock-thumbnails').then(setItems).catch(() => setItems([]))
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-lg font-extrabold text-white">🎨 Stock thumbnails — pick one</p>
          <button onClick={onClose} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800">✕</button>
        </div>
        {items === null ? (
          <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No stock thumbnails bundled.</p>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto pr-1">
            {items.map((it) => (
              <button
                key={it.file}
                disabled={busy}
                onClick={() => onPick(it.file)}
                className="group overflow-hidden rounded-xl border-2 border-slate-700 text-left transition hover:border-indigo-500 disabled:opacity-50"
              >
                <img src={it.url} alt={it.label} className="h-24 w-full object-cover transition group-hover:scale-[1.03]" />
                <p className="bg-slate-950 px-3 py-1.5 text-xs font-bold text-slate-200">{it.label}</p>
              </button>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-500">Bundled with the platform — free to use as your cover ✨</p>
      </div>
    </div>
  )
}
