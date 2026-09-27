import { useEffect, useState } from 'react'
import { api } from '../api'
import { Navbar } from '../components/ui'

const CRITERION_ICONS = ['💡', '⚙️', '🎯', '🎬', '🚀', '🎨', '🔐', '📈', '🧪', '🤝']

function ScoreRow({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-8 flex-1 rounded-md text-xs font-bold transition ${
            value === n ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

function ScoreForm({ item, onSaved }) {
  // T2: rubric comes from the queue item (organizer-configurable per event)
  const rubric = item.rubric?.length
    ? item.rubric
    : [
        { name: 'Innovation', weight: 30 },
        { name: 'Execution', weight: 30 },
        { name: 'Impact', weight: 20 },
        { name: 'Presentation', weight: 20 },
      ]
  const initial = {}
  rubric.forEach((c) => { initial[c.name] = item.my_breakdown?.[c.name] ?? 7 })
  const [scores, setScores] = useState(initial)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (item.scored) {
      setMsg('✅ You have scored this one already — changes overwrite it.')
    }
  }, [item])

  // live weighted total preview
  const weightedTotal = rubric.reduce(
    (t, c) => t + (scores[c.name] ?? 0) * (c.weight / 100), 0,
  )

  async function save(e) {
    e.preventDefault()
    setBusy(true); setMsg(''); setErr('')
    try {
      await api.post(`/judging/score/${item.submission_id}`, { breakdown: scores, comment })
      setMsg('✅ Score saved')
      onSaved?.()
    } catch (er) {
      setErr(er.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="space-y-3">
        {rubric.map((c, i) => (
          <div key={c.name}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-bold text-white">
                {CRITERION_ICONS[i % CRITERION_ICONS.length]} {c.name}
                <span className="ml-1 text-[10px] font-normal text-slate-500">weight {c.weight}%</span>
              </span>
              <span className="font-bold text-indigo-300">{scores[c.name]}/10</span>
            </div>
            <ScoreRow value={scores[c.name]} onChange={(n) => setScores({ ...scores, [c.name]: n })} />
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-indigo-500/30 bg-indigo-500/5 px-3 py-2 text-xs font-bold text-indigo-300">
        ⚖️ Weighted total (this judge): <span className="text-white">{weightedTotal.toFixed(1)}/10</span>
        <span className="ml-2 font-normal text-slate-500">— uses the organizer's rubric for this event</span>
      </div>
      <textarea
        rows={2}
        className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        placeholder="Private feedback for the organizer (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
      />
      {msg && <p className="mt-1 text-xs font-bold text-emerald-400">{msg}</p>}
      {err && <p className="mt-1 text-xs font-bold text-rose-400">{err}</p>}
      <button type="submit" disabled={busy} className="mt-3 rounded-lg bg-indigo-500 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-400 disabled:opacity-50">
        {busy ? 'Saving…' : item.scored ? 'Update score' : 'Save score'}
      </button>
    </form>
  )
}

export default function JudgeDashboard() {
  const [queue, setQueue] = useState(null)
  const [err, setErr] = useState('')
  const [expanded, setExpanded] = useState(null)

  const load = () => api.get('/judging/queue').then(setQueue).catch((e) => { setErr(e.message); setQueue([]) })

  useEffect(() => {
    load()
  }, [])

  if (queue === null)
    return (
      <div className="min-h-screen">
        <Navbar />
        <p className="p-10 text-slate-400">Loading assignment queue…</p>
      </div>
    )

  const done = queue.filter((q) => q.scored).length

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">⚖️ Judge Bench</h1>
          <p className="mt-1 text-slate-400">
            Your assigned projects only — backend enforces that. Scores z-normalize against your own strictness on the leaderboard.
          </p>
        </div>

        {err && (
          <div className="card mb-6 border-rose-600/40 bg-rose-600/5 p-4 text-sm text-rose-300">
            {err} — if you're a judge, log in first.
          </div>
        )}
        {queue.length > 0 && (
          <div className="card mb-5 flex items-center justify-between p-4 text-sm">
            <span className="font-semibold text-slate-300">
              {done}/{queue.length} assigned projects scored
            </span>
            <div className="h-2.5 w-40 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${queue.length ? (done / queue.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {queue.length === 0 && !err && (
          <div className="card p-10 text-center text-slate-400">
            No projects assigned to you yet. The organizer will batch-assign them after the build window closes.
          </div>
        )}

        <div className="space-y-4">
          {queue.map((q) => (
            <div key={q.submission_id} className={`card p-5 ${q.scored ? 'border-emerald-600/40' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-extrabold text-white">{q.title}</p>
                  {q.tagline && <p className="text-sm italic text-slate-400">{q.tagline}</p>}
                  <p className="mt-1 text-xs text-slate-500">
                    Team: {q.team_name || '—'} · Tech: {q.tech_stack || '—'}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    q.scored ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
                  }`}
                >
                  {q.scored ? '✓ Scored' : '⏳ Pending'}
                </span>
              </div>

              {q.description && <p className="mt-2 line-clamp-3 text-sm text-slate-300">{q.description}</p>}

              {q.deliverables?.length > 0 ? (
                <div className="mb-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">🧩 Round deliverables — participant submitted</p>
                  <div className="flex flex-wrap gap-2">
                    {q.deliverables.map((d, i) => (
                      <span key={i} className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-200">
                        <b className="text-indigo-300">{d.round_name}:</b>{' '}
                        {d.link_url
                          ? <a href={d.link_url} target="_blank" rel="noreferrer" className="text-indigo-300 underline decoration-dotted">open artifact ↗</a>
                          : d.file_name ? <a href={`/api/submissions/rounds/files/${d.id}`} className="text-indigo-300 underline decoration-dotted">📎 {d.file_name}</a> : (d.note ? `note: ${d.note}` : 'saved')}
                        {d.note && (d.link_url || d.file_name) && <span className="text-slate-500"> — {d.note}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mb-3 rounded-lg border border-amber-600/30 bg-amber-600/5 px-3 py-2 text-xs text-amber-300/90">
                  🧩 No round artifacts submitted yet — the team's round cards are all pending.
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {q.repo_url && (
                  <a href={q.repo_url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800">
                    🐱 Open repo
                  </a>
                )}
                {q.demo_video_url && (
                  <a href={q.demo_video_url} target="_blank" rel="noreferrer" className="rounded-lg border border-rose-600/50 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-600/10">
                    🎬 Watch demo
                  </a>
                )}
                <button
                  onClick={() => setExpanded(expanded === q.submission_id ? null : q.submission_id)}
                  className="ml-auto rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-400"
                >
                  {expanded === q.submission_id ? '▲ Hide scoring' : '▼ Score this'}
                </button>
              </div>

              {expanded === q.submission_id && (
                <ScoreForm item={q} onSaved={load} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
