import { useEffect, useState } from 'react'
import { api } from '../api'

// T4 — organizer Integrations tab: webhooks, certificates, embed widget,
// bulk import/export. Kept in one file so the AdminDashboard stays readable.

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-50'
const btn = 'rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400 disabled:opacity-50'
const btnGhost = 'rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50'

function useApi() {
  return { err: '', }
}

function EventPicker({ events, value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} className={inputCls}>
      {events.map((e) => (
        <option key={e.id} value={e.id}>{e.title}</option>
      ))}
    </select>
  )
}

// ---------------- Webhooks ----------------
function WebhooksPanel({ eventId }) {
  const [hooks, setHooks] = useState(null)
  const [types, setTypes] = useState([])
  const [form, setForm] = useState({ url: '', events: [], description: '', active: true })
  const [selected, setSelected] = useState(null) // deliveries view
  const [deliveries, setDeliveries] = useState(null)
  const [busy, setBusy] = useState(0)
  const [err, setErr] = useState('')
  const [secret, setSecret] = useState('')

  const load = () => api.get(`/events/${eventId}/webhooks`).then(setHooks).catch((e) => setErr(e.message))
  useEffect(() => {
    load()
    api.get('/webhooks/event-types').then((t) => setTypes(t.event_types || [])).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  async function create(e) {
    e.preventDefault(); setErr(''); setBusy(1)
    try {
      await api.post(`/events/${eventId}/webhooks`, form)
      setForm({ url: '', events: [], description: '', active: true })
      load()
    } catch (er) { setErr(er.message) } finally { setBusy(0) }
  }
  async function del(id) {
    if (!confirm('Delete this webhook + its delivery log?')) return
    await api.del(`/webhooks/${id}`); load()
  }
  async function ping(id) {
    setBusy(id)
    try { await api.post(`/webhooks/${id}/ping`); setTimeout(() => loadDeliveries(id), 600) }
    catch (e) { setErr(e.message) }
    finally { setBusy(0) }
  }
  async function loadDeliveries(id) {
    setSelected(id)
    api.get(`/webhooks/${id}/deliveries`).then(setDeliveries).catch(() => setDeliveries([]))
  }
  async function showSecret(id) {
    const s = await api.get(`/webhooks/${id}/secret`)
    setSecret(s.secret)
  }
  function toggleType(t) {
    setForm((f) => ({ ...f, events: f.events.includes(t) ? f.events.filter((x) => x !== t) : [...f.events, t] }))
  }

  return (
    <div className="card p-5">
      <h3 className="mb-1 text-lg font-extrabold">🔌 Webhooks</h3>
      <p className="mb-3 text-xs text-slate-400">
        Outbound signed POSTs to any URL whenever something happens. Every delivery is HMAC-signed
        (<code className="text-indigo-300">X-Platform-Signature: sha256=…</code>) so receivers can prove it's you.
        Deliveries are logged below — no server log tailing needed.
      </p>
      {err && <p className="mb-2 text-xs text-rose-300">{err}</p>}

      <form onSubmit={create} className="mb-4 space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
        <div className="flex flex-wrap gap-2">
          <input className={`${inputCls} min-w-60 flex-1`} placeholder="https://your-server.dev/hook" required
            value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <input className={`${inputCls} w-52`} placeholder="optional label"
            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">events:</span>
          <button type="button" onClick={() => setForm({ ...form, events: [] })}
            className={`rounded-full px-2 py-0.5 font-bold ${form.events.length === 0 ? 'bg-indigo-500 text-white' : 'border border-slate-700 text-slate-400'}`}>
            ✱ all
          </button>
          {types.map((t) => (
            <button key={t} type="button" onClick={() => toggleType(t)}
              className={`rounded-full px-2 py-0.5 font-mono ${form.events.includes(t) ? 'bg-indigo-500 text-white' : 'border border-slate-700 text-slate-400'}`}>
              {t}
            </button>
          ))}
        </div>
        <button disabled={busy} className={btn}>{busy ? '…' : '+ Add webhook'}</button>
      </form>

      {hooks === null ? <p className="text-sm text-slate-500">Loading…</p> : hooks.length === 0 ? (
        <p className="text-sm text-slate-500">No webhooks yet.</p>
      ) : (
        <div className="space-y-2">
          {hooks.map((h) => (
            <div key={h.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-sm text-indigo-200">{h.url}</code>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${h.active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                  {h.active ? 'active' : 'paused'}
                </span>
                <span className="text-[11px] text-slate-500">{h.events.length ? h.events.join(' ') : '✱ all events'}</span>
                <span className="ml-auto flex gap-1.5">
                  <button className={btnGhost} onClick={() => showSecret(h.id)}>🔑 secret</button>
                  <button className={btnGhost} onClick={() => ping(h.id)} disabled={busy === h.id}>{busy === h.id ? '…' : '📡 ping'}</button>
                  <button className={btnGhost} onClick={() => loadDeliveries(h.id)}>🧾 deliveries</button>
                  <button className={`${btnGhost} text-rose-300`} onClick={() => del(h.id)}>🗑</button>
                </span>
              </div>
              {h.description && <p className="mt-1 text-xs text-slate-500">{h.description}</p>}
              {selected === h.id && deliveries && (
                <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 p-2">
                  {deliveries.length === 0 ? (
                    <p className="p-1 text-xs text-slate-500">No deliveries yet.{secret ? '' : ' Ping it ↑ to test.'}</p>
                  ) : (
                    <table className="w-full text-left text-[11px]">
                      <thead className="text-slate-500"><tr><th className="pr-2">time</th><th className="pr-2">event</th><th className="pr-2">status</th><th className="pr-2">tries</th><th>response</th></tr></thead>
                      <tbody>
                        {deliveries.map((d) => (
                          <tr key={d.id} className={d.ok ? 'text-slate-300' : 'text-rose-300'}>
                            <td className="whitespace-nowrap pr-2 text-slate-500">{new Date(d.created_at).toLocaleTimeString()}</td>
                            <td className="pr-2 font-mono">{d.event_type}</td>
                            <td className="pr-2 font-bold">{d.status_code ?? '—'}</td>
                            <td className="pr-2">{d.attempts}</td>
                            <td className="max-w-52 truncate">{d.response_excerpt}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {secret && (
        <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 font-mono text-xs text-amber-200">
          🔑 Signing secret (verify X-Platform-Signature): <b>{secret}</b>
          <button onClick={() => setSecret('')} className="ml-2 text-slate-400 hover:text-white">✕</button>
        </p>
      )}
    </div>
  )
}

// ---------------- Certificates ----------------
function CertsPanel({ eventId }) {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [verify, setVerify] = useState(null)

  async function issue(kind, topN) {
    setMsg(''); setBusy(kind)
    try {
      const q = kind === 'winner' ? `&top_n=${topN ?? 3}` : ''
      const r = await api.post(`/events/${eventId}/issue-certificates?kind=${kind}${q}`)
      setMsg(`✅ Issued ${r.issued} × ${kind}`)
    } catch (e) { setMsg('❌ ' + e.message) } finally { setBusy('') }
  }
  async function check() {
    setVerify(null)
    api.get(`/certificates/verify/${verifyCode.trim()}`).then(setVerify).catch((e) => setVerify({ valid: false, reason: e.message }))
  }
  return (
    <div className="card p-5">
      <h3 className="mb-1 text-lg font-extrabold">🎖️ Certificates & signed records</h3>
      <p className="mb-3 text-xs text-slate-400">
        Printable, HMAC-signed, and <b>publicly verifiable without login</b> at{' '}
        <code className="text-indigo-300">/api/certificates/verify/&lt;code&gt;</code>. Recipients find theirs on
        their dashboard → "🎖 My certificates".
      </p>
      {msg && <p className="mb-2 text-xs">{msg}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => issue('participation')} disabled={busy === 'participation'} className={btn}>
          {busy === 'participation' ? '…' : '🎖 Issue participation'}
        </button>
        <button onClick={() => issue('winner', 3)} disabled={busy === 'winner'} className={`${btn} bg-amber-500 text-slate-950 hover:bg-amber-400`}>
          {busy === 'winner' ? '…' : '🏆 Issue top-3 winners'}
        </button>
        <button onClick={() => issue('judge')} disabled={busy === 'judge'} className={`${btn} bg-purple-500 hover:bg-purple-400`}>
          {busy === 'judge' ? '…' : '⚖️ Issue judge records'}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Idempotent: re-issue never duplicates. Winners come from the normalized leaderboard (T2).
      </p>

      <div className="mt-4 border-t border-slate-800 pt-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">🔍 Verify any code</p>
        <div className="flex gap-2">
          <input className={`${inputCls} w-64`} placeholder="certificate code" value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value)} />
          <button onClick={check} className={btn}>Verify</button>
        </div>
        {verify && (
          <div className={`mt-2 rounded-xl border p-3 text-sm ${verify.valid ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/5'}`}>
            {verify.valid ? (
              <>
                <p className="font-bold text-emerald-300">✅ Valid — {verify.kind} · {verify.event}</p>
                <p className="text-xs text-slate-300">Holder: <b>{verify.holder}</b> · issued {new Date(verify.issued_at).toLocaleString()}</p>
                <a className="mt-1 inline-block text-xs font-bold text-indigo-300 underline" href={`/api/certificates/${verifyCode}/print`}>
                  Open printable certificate ↗
                </a>
              </>
            ) : (
              <p className="font-bold text-rose-300">❌ {verify.reason || 'Invalid'}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------- Embed widget ----------------
function WidgetPanel({ event, slug }) {
  const [copied, setCopied] = useState('')
  const embedJs = `<script src="${window.location.origin}/api/widget/${slug}.js" async></scr` + `ipt>`
  const embedFrame = `<iframe src="${window.location.origin}/api/widget/${slug}" style="width:100%;min-height:340px;border:0;border-radius:12px"></iframe>`
  function copy(t) { navigator.clipboard.writeText(t); setCopied('✓ copied'); setTimeout(() => setCopied(''), 1200) }
  return (
    <div className="card p-5">
      <h3 className="mb-1 text-lg font-extrabold">🧩 Embeddable gallery widget</h3>
      <p className="mb-3 text-xs text-slate-400">
        Put this event's submitted projects on <i>any</i> website — your landing page, a blog, the university portal.
        No login, no API key. {copied && <span className="text-emerald-300">{copied}</span>}
      </p>
      <div className="space-y-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
          <p className="mb-1 text-[11px] font-bold uppercase text-slate-500">One-liner (recommended)</p>
          <code className="block break-all text-xs text-indigo-200">{embedJs}</code>
          <button onClick={() => copy(embedJs)} className={`${btnGhost} mt-1.5`}>📋 copy</button>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
          <p className="mb-1 text-[11px] font-bold uppercase text-slate-500">Raw iframe</p>
          <code className="block break-all text-xs text-indigo-200">{embedFrame}</code>
          <button onClick={() => copy(embedFrame)} className={`${btnGhost} mt-1.5`}>📋 copy</button>
        </div>
        <iframe src={`/api/widget/${slug}`} title="widget preview"
          className="w-full rounded-xl border border-slate-700" style={{ minHeight: 280 }} />
      </div>
    </div>
  )
}

// ---------------- Bulk I/O ----------------
function BulkPanel({ eventId }) {
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const token = localStorage.getItem('hp_token') || ''

  async function upload() {
    if (!file) return
    setBusy(true); setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await api.upload(`/admin/import/participants/${eventId}?create_accounts=true`, fd)
      setResult(r)
    } catch (e) { setResult({ error: e.message }) } finally { setBusy(false) }
  }
  return (
    <div className="card p-5">
      <h3 className="mb-1 text-lg font-extrabold">📦 Bulk import & export</h3>
      <p className="mb-3 text-xs text-slate-400">
        Sheets in, JSON out — a platform you can leave as easily as you arrived.
      </p>

      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-3">
        <p className="mb-2 text-xs text-slate-300">
          <b>Import participants.csv</b> — columns <code className="text-indigo-300">name, email[, team_name]</code>;
          creates welcome-password accounts ("welcome123"), registers, groups by team.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])}
            className="text-xs text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-500 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white" />
          <button onClick={upload} disabled={busy || !file} className={btn}>{busy ? '…' : '⬆ Import'}</button>
        </div>
        {result && (
          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs">
            {result.error ? (
              <p className="text-rose-300">❌ {result.error}</p>
            ) : (
              <>
                <p className="text-emerald-300">✅ {result.registrations_created} registrations, {result.accounts_created} new accounts</p>
                {result.skipped?.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-amber-300">{result.skipped.length} skipped — reasons →</summary>
                    <ul className="mt-1 list-disc pl-5 text-slate-400">
                      {result.skipped.map((s, i) => <li key={i}>row {s.row}: {s.why} ({s.email})</li>)}
                    </ul>
                  </details>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <p className="mb-1 mt-4 text-xs text-slate-300"><b>Exports</b> — click any to download:</p>
      <div className="flex flex-wrap gap-2">
        {[
          ['👥 registrations.csv', `/api/admin/export/registrations/${eventId}.csv`],
          ['📦 submissions.csv', `/api/admin/export/submissions/${eventId}.csv`],
          ['📊 raw-scores.csv', `/api/admin/export/scores/${eventId}.csv`],
          ['⚖️ judges.csv', `/api/admin/export/judges/${eventId}.csv`],
          ['❤️ votes.csv', `/api/admin/export/votes/${eventId}.csv`],
          ['📋 final-results.csv', `/api/judging/export/${eventId}.csv`],
          ['🧾 audit.csv', `/api/votes/audit-export/${eventId}.csv`],
          ['🗂 EVERYTHING.json', `/api/admin/export/event/${eventId}.json`],
        ].map(([label, url]) => (
          <a key={url} href={`${url}?hp_token=${encodeURIComponent(token)}`}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800">
            {label}
          </a>
        ))}
      </div>
    </div>
  )
}

// ---------------- the tab ----------------
export default function IntegrationsPanel({ events }) {
  const [eventId, setEventId] = useState(events[0]?.id)
  const event = events.find((e) => e.id === eventId)
  useEffect(() => {
    if (!event && events.length) setEventId(events[0].id)
  }, [events, event])
  if (!events.length) return <p className="text-slate-400">Create an event first.</p>
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400">Event:</span>
        <div className="min-w-72"><EventPicker events={events} value={eventId} onChange={setEventId} /></div>
      </div>
      <WebhooksPanel eventId={eventId} />
      <CertsPanel eventId={eventId} />
      <WidgetPanel event={event} slug={event?.slug} />
      <BulkPanel eventId={eventId} />
    </div>
  )
}
