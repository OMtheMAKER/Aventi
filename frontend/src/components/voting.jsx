import { useEffect, useMemo, useState, useCallback } from 'react'
import { api } from '../api'

// ---------------------------------------------------------------------------
// T3 hook: shared voting state for an event (config + my ballot + casting).
// Used by both the VotingPanel (ballot bar/results/tools) and each ProjectCard
// (per-card allocation controls), so state never diverges.
// ---------------------------------------------------------------------------
export function useVoting(eventId, user) {
  const [config, setConfig] = useState(null)
  const [ballot, setBallot] = useState(null)
  const [emailToken, setEmailToken] = useState(() => localStorage.getItem(`vt_tok_${eventId}`))
  const [version, setVersion] = useState(0)
  const bingo = () => setVersion((v) => v + 1)

  const tokenQ = config?.vote_access === 'email' && emailToken ? `email_token=${encodeURIComponent(emailToken)}` : ''

  const loadConfig = useCallback(() => {
    if (!eventId) return Promise.resolve()
    return api.get(`/votes/config/${eventId}`).then(setConfig).catch(() => setConfig(false))
  }, [eventId])
  const loadBallot = useCallback(() => {
    if (!config || !eventId) return Promise.resolve()
    return api
      .get(`/votes/ballot/${eventId}${tokenQ ? `?${tokenQ}` : ''}`)
      .then(setBallot)
      .catch(() => setBallot(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, config?.vote_access, emailToken, !!config])

  useEffect(() => { loadConfig() }, [loadConfig])
  useEffect(() => { loadBallot() }, [loadBallot])

  const myAlloc = useMemo(() => {
    const m = {}
    for (const a of ballot?.allocations || []) m[a.submission_id] = a.votes
    return m
  }, [ballot])

  // Full-replacement cast: set allocation `n` on sub_id (0 removes it).
  async function vote(subId, n) {
    const next = { ...myAlloc }
    if (n <= 0) delete next[subId]
    else next[subId] = n
    const allocations = Object.entries(next).map(([sid, v]) => ({ submission_id: Number(sid), votes: v }))
    const body = { allocations }
    if (config?.vote_access === 'email') body.email_token = emailToken
    await api.post(`/votes/ballot/${eventId}`, body)
    await loadBallot()
    bingo()
  }

  async function withdrawAll() {
    await api.del(`/votes/ballot/${eventId}${tokenQ ? `?${tokenQ}` : ''}`)
    await loadBallot()
    bingo()
  }

  return {
    config, ballot, myAlloc, version,
    refreshConfig: loadConfig, refreshBallot: loadBallot,
    emailToken, setEmailToken,
    vote, withdrawAll,
  }
}

// ---------------------------------------------------------------------------
// UI bits
// ---------------------------------------------------------------------------
const badge = 'rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider'

function AccessBadge({ access }) {
  const map = {
    authenticated: ['🔐 Login required', 'bg-indigo-500/15 text-indigo-300'],
    email: ['✉️ Email-gated', 'bg-amber-500/15 text-amber-300'],
    open: ['🌐 Open link', 'bg-emerald-500/15 text-emerald-300'],
  }
  const [label, cls] = map[access] || map.authenticated
  return <span className={`${badge} ${cls}`}>{label}</span>
}

function ModeBadge({ mode }) {
  return mode === 'quadratic' ? (
    <span className={`${badge} bg-purple-500/15 text-purple-300`}>𝑥² Quadratic</span>
  ) : (
    <span className={`${badge} bg-sky-500/15 text-sky-300`}>1️⃣ Simple picks</span>
  )
}

// ---- email verification flow ----------------------------------------------
function EmailVerify({ eventId, token, onVerified }) {
  const [email, setEmail] = useState(localStorage.getItem(`vt_mail_${eventId}`) || '')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState('')
  const [step, setStep] = useState(token ? 2 : 0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function requestCode() {
    setErr(''); setBusy(true)
    try {
      const r = await api.post(`/votes/verify/${eventId}/request`, { email })
      localStorage.setItem(`vt_mail_${eventId}`, email)
      setDevCode(r.dev_code || '')
      setStep(1)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  async function confirm() {
    setErr(''); setBusy(true)
    try {
      const r = await api.post(`/votes/verify/${eventId}/confirm`, { email, code })
      localStorage.setItem(`vt_tok_${eventId}`, r.email_token)
      setStep(2)
      onVerified(r.email_token)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  if (step === 2)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
        ✉️ Verified as <b>{email}</b>
        <button
          onClick={() => { localStorage.removeItem(`vt_tok_${eventId}`); setStep(0); setCode(''); onVerified(null) }}
          className="text-xs underline opacity-70 hover:opacity-100"
        >
          switch
        </button>
      </div>
    )
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950 p-3">
      <p className="mb-2 text-xs text-slate-400">
        This event votes by <b>verified email</b> — one ballot per address (Gmail dots and +aliases collapse to one).
      </p>
      {err && <p className="mb-2 text-xs text-rose-300">{err}</p>}
      {step === 0 ? (
        <div className="flex flex-wrap gap-2">
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="min-w-52 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm outline-none focus:border-amber-500"
          />
          <button onClick={requestCode} disabled={busy || !email.includes('@')}
            className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
            {busy ? '…' : 'Send code'}
          </button>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap gap-2">
            <input
              value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} inputMode="numeric"
              placeholder="6-digit code"
              className="w-36 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm tracking-widest outline-none focus:border-amber-500"
            />
            <button onClick={confirm} disabled={busy || code.length !== 6}
              className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
              {busy ? '…' : 'Verify'}
            </button>
            <button onClick={() => setStep(0)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">←</button>
          </div>
          {devCode && (
            <p className="mt-2 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 px-2 py-1 text-xs text-amber-200">
              🛠 Self-hosted demo (no SMTP) — code: <b className="text-base tracking-widest">{devCode}</b>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ---- organizer: config + publish + audit ----------------------------------
function OrganizerTools({ eventId, config, onUpdated }) {
  const [open, setOpen] = useState(false)
  const [auditRows, setAuditRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [f, setF] = useState({
    vote_access: config.vote_access,
    vote_mode: config.vote_mode,
    max_picks: config.max_picks,
    vote_credits: config.vote_credits,
    voting_close_at: config.voting_close_at ? config.voting_close_at.slice(0, 16) : '',
  })

  async function save() {
    setErr(''); setBusy(true)
    try {
      await api.patch(`/votes/config/${eventId}`, {
        vote_access: f.vote_access,
        vote_mode: f.vote_mode,
        max_picks: Number(f.max_picks) || 3,
        vote_credits: Number(f.vote_credits) || 9,
        ...(f.voting_close_at ? { voting_close_at: new Date(f.voting_close_at).toISOString() } : {}),
      })
      onUpdated()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  async function publish(p) {
    setBusy(true)
    try { await api.post(`/votes/publish/${eventId}?publish=${p}`); onUpdated() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const inp = 'rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500'
  return (
    <div className="mt-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
      <button onClick={() => setOpen(!open)} className="w-full text-left text-xs font-black uppercase tracking-widest text-indigo-300">
        {open ? '▼' : '▶'} ⚙️ Organiser controls
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {err && <p className="text-xs text-rose-300">{err}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="text-xs text-slate-400">
              Access
              <select value={f.vote_access} onChange={(e) => setF({ ...f, vote_access: e.target.value })} className={`mt-1 w-full ${inp}`}>
                <option value="authenticated">🔐 Login</option>
                <option value="email">✉️ Email</option>
                <option value="open">🌐 Open</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Mode
              <select value={f.vote_mode} onChange={(e) => setF({ ...f, vote_mode: e.target.value })} className={`mt-1 w-full ${inp}`}>
                <option value="simple">1️⃣ Simple</option>
                <option value="quadratic">𝑥² Quadratic</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">
              Max picks {f.vote_mode !== 'simple' && <span className="opacity-50">(simple only)</span>}
              <input type="number" min="1" max="50" value={f.max_picks} disabled={f.vote_mode !== 'simple'}
                onChange={(e) => setF({ ...f, max_picks: e.target.value })} className={`mt-1 w-full ${inp} disabled:opacity-40`} />
            </label>
            <label className="text-xs text-slate-400">
              Credits {f.vote_mode !== 'quadratic' && <span className="opacity-50">(quad. only)</span>}
              <input type="number" min="1" max="10000" value={f.vote_credits} disabled={f.vote_mode !== 'quadratic'}
                onChange={(e) => setF({ ...f, vote_credits: e.target.value })} className={`mt-1 w-full ${inp} disabled:opacity-40`} />
            </label>
          </div>
          <label className="block text-xs text-slate-400">
            Voting closes at (after this, results go public automatically)
            <input type="datetime-local" value={f.voting_close_at} onChange={(e) => setF({ ...f, voting_close_at: e.target.value })}
              className={`mt-1 w-full sm:w-72 ${inp}`} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button onClick={save} disabled={busy} className="rounded-lg bg-indigo-500 px-4 py-1.5 text-sm font-bold text-white hover:bg-indigo-400 disabled:opacity-50">
              {busy ? '…' : '💾 Save config'}
            </button>
            {config.results_visible ? (
              <button onClick={() => publish(false)} disabled={busy} className="rounded-lg border border-rose-500/50 px-4 py-1.5 text-sm font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50">
                🔒 Hide results
              </button>
            ) : (
              <button onClick={() => publish(true)} disabled={busy} className="rounded-lg border border-emerald-500/50 px-4 py-1.5 text-sm font-bold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50">
                📢 Publish results early
              </button>
            )}
            <a href={`/api/votes/audit-export/${eventId}.csv?hp_token=${encodeURIComponent(localStorage.getItem('hp_token') || '')}`}
              className="rounded-lg border border-slate-700 px-4 py-1.5 text-sm font-bold text-slate-300 hover:bg-slate-800">
              ⬇ Audit CSV
            </a>
            <button
              onClick={() => { setAuditRows(null); api.get(`/votes/audit/${eventId}`).then(setAuditRows).catch(() => setAuditRows([])) }}
              className="rounded-lg border border-slate-700 px-4 py-1.5 text-sm font-bold text-slate-300 hover:bg-slate-800">
              🧾 {auditRows ? 'Refresh' : 'View'} audit
            </button>
          </div>
          {auditRows && (
            <AuditTable rows={auditRows} />
          )}
        </div>
      )}
    </div>
  )
}

export function AuditTable({ rows }) {
  return (
    <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-2">
      {rows.length === 0 ? (
        <p className="p-2 text-xs text-slate-500">Nothing logged yet.</p>
      ) : (
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-slate-950 text-slate-500">
            <tr><th className="pr-2">time</th><th className="pr-2">actor</th><th className="pr-2">action</th><th>detail</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.action === 'abuse.flag' ? 'text-rose-300' : 'text-slate-300'}>
                <td className="whitespace-nowrap pr-2 align-top text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
                <td className="pr-2 align-top font-mono">{r.actor_key}</td>
                <td className="pr-2 align-top">
                  <span className={`rounded px-1 py-0.5 text-[10px] font-bold ${r.action === 'abuse.flag' ? 'bg-rose-500/20' : 'bg-slate-800'}`}>{r.action}</span>
                </td>
                <td className="align-top">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ---- results ---------------------------------------------------------------
function Results({ eventId, config, version }) {
  const [data, setData] = useState(null)
  const [hidden, setHidden] = useState(null)
  useEffect(() => {
    api.get(`/votes/results/${eventId}`).then((r) => { setData(r); setHidden(null) })
      .catch((e) => { setHidden(e.message); setData(null) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, version, config?.results_published])
  if (data) {
    const max = Math.max(1, ...data.tally.map((t) => t.votes))
    return (
      <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-emerald-300">
          📊 Results {config.results_published ? '(published early)' : '(voting closed)'} — {data.voters} voter{data.voters === 1 ? '' : 's'}
        </p>
        <div className="space-y-1.5">
          {data.tally.map((t, i) => (
            <div key={t.submission_id} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-right font-black text-slate-400">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <span className="truncate font-bold text-slate-100">{t.title}</span>
                  <span className="shrink-0 text-xs text-slate-400">{t.votes} vote{t.votes === 1 ? '' : 's'} · {t.ballots} ballot{t.ballots === 1 ? '' : 's'}</span>
                </div>
                <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(100 * t.votes) / max}%` }} />
                </div>
              </div>
            </div>
          ))}
          {data.tally.length === 0 && <p className="text-xs text-slate-500">No submitted projects yet.</p>}
        </div>
      </div>
    )
  }
  return (
    <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-slate-400">
      🔒 {hidden || 'Results are hidden during the voting window.'}
    </div>
  )
}

// ---- the ballot bar ----------------------------------------------------------
export default function VotingPanel({ event, user, v, onCast }) {
  if (!v.config) return null
  const config = v.config
  const isOrg = user?.role === 'admin'
  const needLogin = config.vote_access === 'authenticated' && !user
  const needEmail = config.vote_access === 'email' && !v.emailToken
  const creditsLeft = config.vote_mode === 'quadratic' && v.ballot ? v.ballot.credits_total - v.ballot.credits_spent : null
  const picksLeft = config.vote_mode === 'simple' && v.ballot ? v.ballot.max_picks - v.ballot.picks_used : null

  return (
    <div className="card mb-6 border-indigo-500/25 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-300">🗳️ Community vote</h2>
        <AccessBadge access={config.vote_access} />
        <ModeBadge mode={config.vote_mode} />
        {config.voting_open ? (
          <span className={`${badge} bg-emerald-500/15 text-emerald-300`}>● open</span>
        ) : (
          <span className={`${badge} bg-rose-500/15 text-rose-300`}>closed</span>
        )}
        <span className="ml-auto text-xs text-slate-400">
          {creditsLeft !== null && <>⚡ <b>{creditsLeft}</b>/{v.ballot.credits_total} credits left</>}
          {picksLeft !== null && <>🎯 <b>{picksLeft}</b>/{v.ballot.max_picks} picks left</>}
        </span>
      </div>

      <p className="mt-1.5 text-xs text-slate-400">
        {config.vote_mode === 'quadratic'
          ? 'Quadratic voting: n votes on one project cost n² credits — spreading support beats shouting. Use +/− on the cards below.'
          : `Support up to ${config.max_picks} projects — one vote each.`}
        {' '}Results stay <b>hidden</b> until voting closes{isOrg ? ' (or you publish early)' : ''} — no vote-count herding.
      </p>

      {needEmail ? (
        <div className="mt-2"><EmailVerify eventId={event.id} token={v.emailToken} onVerified={v.setEmailToken} /></div>
      ) : needLogin ? (
        <p className="mt-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-3 py-2 text-xs text-indigo-200">
          🔐 Log in to cast your ballot in this event.
        </p>
      ) : null}

      {v.ballot && v.ballot.allocations.length > 0 && (
        <p className="mt-2 text-xs text-emerald-300">
          ✅ Your ballot is in — change allocations on the cards any time while voting is open.
          <button onClick={async () => { await v.withdrawAll(); onCast() }} className="ml-2 text-slate-500 underline hover:text-rose-300">
            withdraw all
          </button>
        </p>
      )}

      <Results eventId={event.id} config={config} version={v.version} />
      {isOrg && <OrganizerTools eventId={event.id} config={config} onUpdated={() => { v.refreshConfig(); v.refreshBallot(); onCast() }} />}
    </div>
  )
}
