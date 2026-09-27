import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Navbar, EventCard } from '../components/ui'
import MacbookIntro from '../components/MacbookIntro'

const FEATURES = [
  {
    icon: '🛠️',
    title: 'For Organizers',
    desc: 'Spin up events in minutes — set dates, tracks, and prize pools. Assign judges and export results to CSV.',
  },
  {
    icon: '🚀',
    title: 'For Participants',
    desc: 'Sign up, build or join a team through an invite link, save drafts, and browse everyone’s projects in the gallery.',
  },
  {
    icon: '⚖️',
    title: 'For Judges',
    desc: 'Score only the projects assigned to you on a weighted rubric — with strict role isolation between judges.',
  },
  {
    icon: '🏆',
    title: 'Fair Results',
    desc: 'Normalized scoring balances each judge’s strictness. Public voting and comments in higher tiers.',
  },
]

const TABS = [
  { id: 'participant', label: 'Participant', icon: '👤' },
  { id: 'judge', label: 'Judge', icon: '⚖️' },
  { id: 'new', label: 'New User', icon: '✨' },
  { id: 'admin', label: 'Admin', icon: '🛡️' },
]

const SOCIALS = [
  {
    id: 'google',
    label: 'Continue with Google',
    style: 'bg-white text-slate-900 hover:bg-slate-200',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
      </svg>
    ),
  },
  {
    id: 'github',
    label: 'Continue with GitHub',
    style: 'bg-slate-800 text-white border border-slate-600 hover:bg-slate-700',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
      </svg>
    ),
  },
  {
    id: 'discord',
    label: 'Continue with Discord',
    style: 'bg-[#5865F2] text-white hover:bg-[#4752C4]',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
        <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.29a.074.074 0 0 1 .078-.011c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
  },
]

const inputCls =
  'w-full rounded-lg border-2 border-slate-700 bg-slate-950 px-4 py-3 text-base font-semibold text-white placeholder:font-normal placeholder:text-slate-500 outline-none transition focus:border-indigo-500'

export default function Landing() {
  const { login, signup, socialLogin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [events, setEvents] = useState([])
  const [tab, setTab] = useState('participant')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPass, setAdminPass] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/events').then(setEvents).catch(() => setEvents([]))
  }, [])

  // Navbar "Login" button from another page → land here & scroll to the panel
  useEffect(() => {
    if (location.state?.scrollTo === 'login') {
      setTimeout(
        () => document.getElementById('login')?.scrollIntoView({ behavior: 'smooth' }),
        60,
      )
    }
  }, [location.state])

  function switchTab(t) {
    setTab(t)
    setErr('')
  }

  async function run(fn) {
    setErr('')
    setBusy(true)
    try {
      await fn()
    } catch (er) {
      setErr(er.message)
    } finally {
      setBusy(false)
    }
  }

  const doParticipantLogin = (e) => {
    e.preventDefault()
    run(async () => {
      const u = await login(email, password, 'user')
      navigate(u.role === 'judge' ? '/judge' : '/dashboard')
    })
  }

  const doAdminLogin = (e) => {
    e.preventDefault()
    run(async () => {
      const u = await login(adminEmail, adminPass, 'admin')
      navigate('/admin')
    })
  }

  const doJudgeLogin = (e) => {
    e.preventDefault()
    run(async () => {
      const u = await login(email, password, 'judge')
      navigate('/judge')
    })
  }

  const doSignup = (e) => {
    e.preventDefault()
    run(async () => {
      await signup({ email, name, password })
      navigate('/dashboard')
    })
  }

  const doSocial = (provider) =>
    run(async () => {
      // Ask the backend whether real OAuth is configured. If yes → bounce
      // to the provider's REAL consent screen (Google account picker /
      // Discord authorize). If no → fall back to the offline demo flow.
      const start = await api.get(`/auth/oauth/${provider}/start`)
      if (start.mode === 'redirect' && start.url) {
        window.location.assign(start.url)
        return
      }
      await socialLogin(provider)
      navigate('/dashboard')
    })

  const live = events.filter((e) => e.status === 'ongoing')
  const upcoming = events.filter((e) => e.status === 'upcoming')
  const past = events.filter((e) => e.status === 'past')

  return (
    <div className="min-h-screen" id="aventi-landing-root">
      <MacbookIntro />
      <Navbar />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(99,102,241,0.25),transparent)]" />
        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <span className="inline-block rounded-full border border-indigo-500/40 bg-indigo-500/10 px-4 py-1 text-xs font-bold uppercase tracking-widest text-indigo-300">
            ⚡ Aventi
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-tight sm:text-6xl">
            <span className="gradient-text">Where the Future is Built.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base font-semibold text-slate-300">
            <b className="text-white">Aventi</b> — from the French word <i className="font-serif">Avenir</i> (Future).
            Named for what's next. Inspired by it. Built for it.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
            Register for hackathons, form teams, submit projects, and let judges score
            fairly — all in one place. From signup to the winner's podium, the entire
            lifecycle lives here.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => document.getElementById('login')?.scrollIntoView({ behavior: 'smooth' })}
              className="rounded-xl bg-indigo-500 px-6 py-3 text-lg font-bold text-white hover:bg-indigo-400"
            >
              Login / Sign up
            </button>
            <button
              onClick={() => document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' })}
              className="rounded-xl border border-slate-700 px-6 py-3 text-lg font-semibold text-slate-200 hover:bg-slate-800"
            >
              Browse live events
            </button>
          </div>

          {/* quick-hit hackathon facts — first-page detail, not a wall of text */}
          {live.length > 0 && (
            <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-left">
              <div className="mb-1 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-emerald-300">
                🔥 Live right now
              </div>
              <p className="font-extrabold text-white">{live[0].title}</p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-300">
                <span>📅 {new Date(live[0].start_date).toLocaleDateString()} → {new Date(live[0].end_date).toLocaleDateString()}</span>
                {live[0].prize_pool && <span>🏆 Prize pool {live[0].prize_pool}</span>}
                <span>🎯 {live[0].mode}</span>
                {live[0].location && <span>📍 {live[0].location}</span>}
                <span>👥 Teams {live[0].min_team_size}–{live[0].max_team_size}</span>
              </div>
              <button
                onClick={() => navigate(`/event/${live[0].slug}`)}
                className="mt-3 rounded-lg bg-emerald-500 px-4 py-1.5 text-sm font-bold text-slate-950 hover:bg-emerald-400"
              >
                Open event →
              </button>
            </div>
          )}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-2 text-2xl font-bold">One platform, every role</h2>
        <p className="mb-8 text-slate-400">Everything the hackathon lifecycle needs — explained.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5">
              <div className="mb-3 text-3xl">{f.icon}</div>
              <h3 className="font-semibold text-white">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* EVENTS — bold, left-aligned */}
      <section id="events" className="mx-auto max-w-6xl px-4 py-12 text-left">
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-3xl font-extrabold tracking-tight text-white">Events</h2>
          <span className="text-sm font-semibold text-slate-400">{events.length} total</span>
        </div>
        <p className="mb-8 font-medium text-slate-400">
          Pick an event below to see its quest map, schedule, and prizes — then register.
        </p>

        {live.length > 0 && (
          <div className="mb-10">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest text-emerald-300">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
              Live right now
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {live.map((e) => (
                <EventCard key={e.id} event={e} onClick={() => navigate(`/event/${e.slug}`)} />
              ))}
            </div>
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="mb-10">
            <h3 className="mb-3 text-sm font-extrabold uppercase tracking-widest text-sky-300">
              Upcoming
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((e) => (
                <EventCard key={e.id} event={e} onClick={() => navigate(`/event/${e.slug}`)} />
              ))}
            </div>
          </div>
        )}

        {past.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-extrabold uppercase tracking-widest text-slate-400">
              Past events
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {past.map((e) => (
                <EventCard key={e.id} event={e} onClick={() => navigate(`/event/${e.slug}`)} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ONE LOGIN PANEL — bold with role tabs */}
      <section id="login" className="mx-auto max-w-6xl px-4 py-16">
        <div className="mx-auto max-w-md">
          <div className="mb-2 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-white">
              Login
            </h2>
            <p className="mt-2 font-medium text-slate-400">
              Choose who you are — we'll open the right door.
            </p>
          </div>

          {/* role tabs */}
          <div
            role="tablist"
            aria-label="Choose login type"
            className="mt-6 grid grid-cols-4 gap-1 rounded-2xl border-2 border-slate-700 bg-slate-950 p-1.5"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => switchTab(t.id)}
                className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-bold transition ${
                  tab === t.id
                    ? 'bg-indigo-500 text-white shadow-lg'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span aria-hidden>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>

          {/* panel */}
          <div className="card mt-4 border-2 border-slate-700 p-6">
            {tab === 'participant' && (
              <div>
                <h3 className="text-xl font-extrabold text-white">Participant login</h3>
                <p className="mb-4 text-sm font-medium text-slate-400">
                  Join events, build your team, submit projects.
                </p>

                <div className="space-y-2.5">
                  {SOCIALS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => doSocial(s.id)}
                      disabled={busy}
                      className={`flex w-full items-center justify-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-50 ${s.style}`}
                    >
                      {s.icon}
                      {s.label}
                    </button>
                  ))}
                  <p className="px-1 text-[11px] leading-snug text-slate-500">
                    🔌 Self-hosted by default: these buttons use an <b>offline demo handshake</b> (seeded social account).
                    The real Google/Discord consent page only opens when the deployer sets OAuth env vars
                    (<code>GOOGLE_CLIENT_ID</code> etc.) — no external service required, per the dogfood spec.
                  </p>
                </div>

                <div className="my-4 flex items-center gap-3 text-xs font-extrabold uppercase tracking-widest text-slate-500">
                  <div className="h-px flex-1 bg-slate-700" />
                  or with email
                  <div className="h-px flex-1 bg-slate-700" />
                </div>

                <form onSubmit={doParticipantLogin} className="space-y-3">
                  <input
                    type="email"
                    required
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                  />
                  <input
                    type="password"
                    required
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                  />
                  {err && <p className="text-sm font-bold text-rose-400">{err}</p>}
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-xl bg-indigo-500 py-3 text-base font-extrabold text-white hover:bg-indigo-400 disabled:opacity-50"
                  >
                    {busy ? 'Please wait…' : 'Login as Participant'}
                  </button>
                </form>
              </div>
            )}

            {tab === 'judge' && (
              <div>
                <h3 className="text-xl font-extrabold text-white">Judge login ⚖️</h3>
                <p className="mb-4 text-sm font-medium text-slate-400">
                  Use the ID your organizer gave you — you'll land straight on the judge bench 🍿.
                </p>
                <form onSubmit={doJudgeLogin} className="space-y-3">
                  <input
                    type="email"
                    required
                    placeholder="Judge email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${inputCls} focus:border-amber-400`}
                  />
                  <input
                    type="password"
                    required
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputCls} focus:border-amber-400`}
                  />
                  {err && <p className="text-sm font-bold text-rose-400">{err}</p>}
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-xl bg-amber-500 py-3 text-base font-extrabold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                  >
                    {busy ? 'Please wait…' : 'Login as Judge ⚖️'}
                  </button>
                </form>
                <p className="mt-3 text-center text-xs text-slate-500">
                  Participant? Use the Participant tab — judge IDs work ONLY here.
                </p>
              </div>
            )}

            {tab === 'new' && (
              <div>
                <h3 className="text-xl font-extrabold text-white">New user? Join free</h3>
                <p className="mb-4 text-sm font-medium text-slate-400">
                  Create a participant account in seconds.
                </p>

                <div className="space-y-2.5">
                  {[SOCIALS[0], SOCIALS[1]].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => doSocial(s.id)}
                      disabled={busy}
                      className={`flex w-full items-center justify-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-50 ${s.style}`}
                    >
                      {s.icon}
                      {s.label}
                    </button>
                  ))}
                </div>

                <div className="my-4 flex items-center gap-3 text-xs font-extrabold uppercase tracking-widest text-slate-500">
                  <div className="h-px flex-1 bg-slate-700" />
                  or with email
                  <div className="h-px flex-1 bg-slate-700" />
                </div>

                <form onSubmit={doSignup} className="space-y-3">
                  <input
                    required
                    placeholder="Full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputCls}
                  />
                  <input
                    required
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                  />
                  <input
                    required
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                  />
                  {err && <p className="text-sm font-bold text-rose-400">{err}</p>}
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-xl border-2 border-indigo-500 py-3 text-base font-extrabold text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-50"
                  >
                    {busy ? 'Please wait…' : 'Create participant account'}
                  </button>
                </form>
              </div>
            )}

            {tab === 'admin' && (
              <div>
                <h3 className="text-xl font-extrabold text-white">Admin login</h3>
                <p className="mb-4 text-sm font-medium text-slate-400">
                  Manage events & view the full contestant database.
                </p>
                <form onSubmit={doAdminLogin} className="space-y-3">
                  <input
                    type="email"
                    required
                    placeholder="Admin email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    className={`${inputCls} focus:border-rose-500`}
                  />
                  <input
                    type="password"
                    required
                    placeholder="Password"
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    className={`${inputCls} focus:border-rose-500`}
                  />
                  {err && <p className="text-sm font-bold text-rose-400">{err}</p>}
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-xl bg-rose-500 py-3 text-base font-extrabold text-white hover:bg-rose-400 disabled:opacity-50"
                  >
                    {busy ? 'Please wait…' : 'Login as Admin'}
                  </button>
                </form>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-xs font-medium text-slate-500">
            Demo — Participant: <code>alice@demo.dev</code>/<code>password123</code> · Admin:{' '}
            <code>admin@platform.dev</code>/<code>admin123</code> · Judge: <code>judge@demo.dev</code>/<code>judge123</code>
          </p>
        </div>
      </section>

      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-500">
        Aventi Platform — open source, self-hostable. Runs fully offline after
        <code className="mx-1">docker compose up</code>.
      </footer>
    </div>
  )
}
