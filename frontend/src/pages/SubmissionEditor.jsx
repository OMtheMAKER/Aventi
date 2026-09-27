import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Navbar, StockThumbModal, fmtDate } from '../components/ui'

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-60'
const lbl = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400'

export default function SubmissionEditor() {
  const { slug } = useParams()
  const navigate = useNavigate()

  const [event, setEvent] = useState(null)
  const [sub, setSub] = useState(null) // existing submission (may be null → not created)
  const [locked, setLocked] = useState(false)
  const [form, setForm] = useState({
    title: '',
    tagline: '',
    description: '',
    repo_url: '',
    demo_video_url: '',
    tech_stack: '',
    live_url: '',
    track: '',
  })
  const [links, setLinks] = useState([])
  const [answers, setAnswers] = useState({}) // {question: answer}
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [thumbBusy, setThumbBusy] = useState(false)
  const [imgBusy, setImgBusy] = useState(false)
  const [showStock, setShowStock] = useState(false)

  // ensure a draft exists before media ops — auto-saves if needed (new teams
  // can click "browse stock" right away, no manual save first)
  async function ensureSub() {
    if (sub) return sub
    if (!form.title.trim()) {
      setErr('✍️ Enter a Project title first — then the thumbnail can be set')
      return null
    }
    return await save('draft')
  }

  useEffect(() => {
    api
      .get(`/events/${slug}`)
      .then((e) => {
        setEvent(e)
        return api.get(`/submissions/mine/${e.id}`)
      })
      .then((r) => {
        if (!r) return
        setLocked(!!r.locked)
        if (r.submission) {
          setSub(r.submission)
          setForm({
            title: r.submission.title || '',
            tagline: r.submission.tagline || '',
            description: r.submission.description || '',
            repo_url: r.submission.repo_url || '',
            demo_video_url: r.submission.demo_video_url || '',
            tech_stack: r.submission.tech_stack || '',
            live_url: r.submission.live_url || '',
            track: r.submission.track || '',
          })
          setLinks(r.submission.extra_links || [])
          const ans = {}
          ;(r.submission.custom_answers || []).forEach((qa) => { ans[qa.question] = qa.answer })
          setAnswers(ans)
        }
      })
      .catch(() => setEvent(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function save(intent) {
    setErr(''); setOk('')
    // Never let a final submit go out with pending rounds without an explicit
    // OK from the team — a failed upload earlier would otherwise silently send
    // judges a project with zero artifacts (the #1 confusion we have seen).
    if (intent === 'submit' && event?.rounds?.length > 0) {
      try {
        const bd = await api.get(`/submissions/rounds/mine/${event.id}`)
        const pending = (bd?.rounds || []).filter((r) => !r.deliverable)
        if (pending.length > 0) {
          const go = window.confirm(
            `⚠️ Hold on — ${pending.length} of ${event.rounds.length} round(s) are still PENDING:\n\n` +
            pending.map((r) => ` • ${r.name}`).join('\n') +
            `\n\nPending rounds show NOTHING to judges. If an upload failed earlier, cancel here, re-upload, and wait for the round card to show ✅ DELIVERED with the file chip — then submit again.\n\nSubmit anyway?`
          )
          if (!go) return null
        }
      } catch { /* board unavailable — don't block the submit */ }
    }
    setBusy(true)
    try {
      if (!form.title.trim()) throw new Error('Title is required')
      const payload = {
        ...form,
        track: form.track || null,
        live_url: form.live_url || null,
        extra_links: links.filter((l) => l.label.trim() && l.url.trim()),
        custom_answers: Object.entries(answers)
          .filter(([, a]) => a && a.trim())
          .map(([question, answer]) => ({ question, answer })),
      }

      // 1) ensure the draft exists
      let current = sub
      if (!current) {
        current = await api.post(`/submissions?event_id=${event.id}`, payload)
        setSub(current)
      } else {
        current = await api.put(`/submissions/${current.id}`, payload)
        setSub(current)
      }

      // 2) final submit marks it read-only & publishes to gallery
      if (intent === 'submit') {
        const final = await api.post(`/submissions/${current.id}/submit`)
        setSub(final)
        setOk('🚀 Submitted! The judges get it now.')
      } else {
        setOk(`✅ Draft saved ${sub ? '' : `as "${current.title}"`}`)
      }
      return current
    } catch (er) {
      setErr(er.message)
      return null
    } finally {
      setBusy(false)
    }
  }

  if (event === false)
    return (
      <div className="min-h-screen">
        <Navbar />
        <p className="p-10 text-center text-slate-400">Event not found.</p>
      </div>
    )
  if (!event)
    return (
      <div className="min-h-screen">
        <Navbar />
        <p className="p-10 text-slate-400">Loading…</p>
      </div>
    )

  const submitted = sub?.status === 'submitted'
  // the event creator decides whether teams must give the project's GitHub repo link
  const asksRepo = (event.form_fields?.project_repo ?? true) !== false

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 py-8">
        <button onClick={() => navigate(`/event/${slug}`)} className="mb-4 text-sm text-indigo-300 hover:underline">
          ← Back to {event.title}
        </button>

        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">📦 Project Submission</h1>
            <p className="mt-1 text-slate-400">
              {event.title} · Deadline: <span className="font-bold text-amber-300">{fmtDate(event.end_date)}</span>
            </p>
          </div>
          {sub && (
            <span className={`rounded-full px-3 py-1 text-xs font-black ${submitted ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
              {submitted ? '✓ SUBMITTED' : '✏️ DRAFT'}
            </span>
          )}
        </div>

        {locked ? (
          <div className="card p-8 text-center">
            <p className="text-xl font-bold text-rose-300">🔒 Submissions are locked</p>
            <p className="mt-2 text-sm text-slate-400">
              The build window closed at {fmtDate(event.end_date)}.{' '}
              <button onClick={() => navigate(`/event/${slug}/gallery`)} className="text-indigo-300 hover:underline">
                See the gallery →
              </button>
            </p>
          </div>
        ) : submitted ? (
          <div className="card p-8 text-center">
            <p className="text-xl font-bold text-emerald-300">🎉 "{sub.title}" is submitted!</p>
            <p className="mt-2 text-sm text-slate-400">
              Submitted at {fmtDate(sub.submitted_at)}. It's now in the public gallery.
            </p>
            <button onClick={() => navigate(`/event/${slug}/gallery`)} className="mt-4 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400">
              View in gallery →
            </button>
          </div>
        ) : (
          <form className="card space-y-4 p-6" onSubmit={(e) => e.preventDefault()}>
            <div>
              <label className={lbl}>Project title *</label>
              <input className={inputCls} value={form.title} onChange={set('title')} placeholder="e.g. RAGatouille" maxLength={80} />
            </div>
            <div>
              <label className={lbl}>Tagline</label>
              <input className={inputCls} value={form.tagline} onChange={set('tagline')} placeholder="One-line elevator pitch" maxLength={120} />
            </div>
            <div>
              <label className={lbl}>Description *</label>
              <textarea rows={5} className={inputCls} value={form.description} onChange={set('description')} placeholder="What does it do? How does it work? What did you build it with?" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {asksRepo && (
                <div>
                  <label className={lbl}>Project GitHub repo *</label>
                  <input className={inputCls} value={form.repo_url} onChange={set('repo_url')} placeholder="https://github.com/team/project" />
                  <p className="mt-1 text-[11px] text-slate-500">Shown below your project in the public gallery 🖼️</p>
                </div>
              )}
              <div className={asksRepo ? '' : 'sm:col-span-2'}>
                <label className={lbl}>Demo video</label>
                <input className={inputCls} value={form.demo_video_url} onChange={set('demo_video_url')} placeholder="https://youtube.com/..." />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={lbl}>Live link (deployed app)</label>
                <input className={inputCls} value={form.live_url} onChange={set('live_url')} placeholder="https://myapp.vercel.app" />
                <p className="mt-1 text-[11px] text-slate-500">Where judges can try it live 🌐</p>
              </div>
              {(event.tracks || []).length > 0 && (
                <div>
                  <label className={lbl}>Track</label>
                  <select
                    className={inputCls}
                    value={form.track}
                    onChange={(e) => setForm({ ...form, track: e.target.value })}
                  >
                    <option value="">— Choose a track —</option>
                    {event.tracks.map((t, i) => (
                      <option key={i} value={t.name}>{t.name}{t.prize ? ` (${t.prize})` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div>
              <label className={lbl}>Tech stack</label>
              <input className={inputCls} value={form.tech_stack} onChange={set('tech_stack')} placeholder="Python, FastAPI, React, SQLite…" />
            </div>

            {/* organizer-defined custom questions (T1) */}
            {(event.submission_questions || []).length > 0 && (
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-widest text-indigo-300">
                  🧾 Organizer's questions
                </p>
                <div className="space-y-3">
                  {event.submission_questions.map((q, i) => (
                    <div key={i}>
                      <label className={lbl}>{q}</label>
                      <textarea
                        rows={2}
                        className={inputCls}
                        value={answers[q] || ''}
                        onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })}
                        placeholder="Your answer…"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className={lbl}>Extra links</label>
              <div className="space-y-2">
                {links.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <input className={`${inputCls} w-40`} placeholder="Label" value={l.label} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    <input className={inputCls} placeholder="https://..." value={l.url} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                    <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))} className="rounded-lg border border-slate-700 px-3 text-slate-400 hover:bg-slate-800">✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => setLinks([...links, { label: '', url: '' }])} className="text-sm font-semibold text-indigo-300 hover:underline">
                  + Add link
                </button>
              </div>
            </div>

            {/* T1: thumbnail + image gallery — draft auto-saves on first use */}
            <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">
                🖼️ Media — thumbnail & screenshots
              </p>
              {!sub && (
                <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                  ✍️ Enter a title to choose a thumbnail — your draft saves automatically!
                </p>
              )}
              <div className="space-y-4">
                {/* thumbnail */}
                <div className="flex flex-wrap items-center gap-3">
                  {sub?.has_thumbnail && (
                    <img
                      src={`/api/submissions/${sub.id}/thumbnail?t=${sub.updated_at}`}
                      alt="thumbnail"
                      className="h-20 w-32 rounded-lg border border-slate-700 object-cover"
                    />
                  )}
                  <div className="flex flex-col gap-2">
                    <label className={lbl}>Thumbnail (card cover)</label>
                    <div className="flex flex-wrap gap-2">
                      <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-500/50 px-3 py-1.5 text-xs font-bold text-indigo-300 hover:bg-indigo-500/10 ${thumbBusy ? 'opacity-50' : ''}`}>
                        {thumbBusy ? 'Uploading…' : sub?.has_thumbnail ? '↻ Replace (upload)' : '⬆ Upload from device'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={thumbBusy}
                          onChange={async (e) => {
                            const f = e.target.files?.[0]
                            if (!f) return
                            setThumbBusy(true)
                            setErr(''); setOk('')
                            try {
                              const cur = await ensureSub()
                              if (!cur) return
                              const fd = new FormData()
                              fd.append('file', f)
                              const updated = await api.upload(`/submissions/${cur.id}/thumbnail`, fd)
                              setSub(updated)
                              setOk('✅ Thumbnail updated')
                            } catch (er2) {
                              setErr(er2.message)
                            } finally {
                              setThumbBusy(false)
                              e.target.value = ''
                            }
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={async () => {
                          setErr('')
                          const cur = await ensureSub()
                          if (cur) setShowStock(true)
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-fuchsia-500/50 px-3 py-1.5 text-xs font-bold text-fuchsia-300 hover:bg-fuchsia-500/10"
                      >
                        🎨 Browse stock thumbnails
                      </button>
                    </div>
                  </div>
                </div>
                  {/* gallery images */}
                  {sub && (
                  <div>
                    <label className={lbl}>Screenshots (up to 6)</label>
                    <div className="flex flex-wrap items-center gap-2">
                      {Array.from({ length: sub.image_count || 0 }).map((_, i) => (
                        <div key={i} className="group relative">
                          <img
                            src={`/api/submissions/${sub.id}/images/${i}?t=${sub.updated_at}`}
                            alt={`screenshot ${i + 1}`}
                            className="h-16 w-24 rounded-lg border border-slate-700 object-cover"
                          />
                          <button
                            type="button"
                            title="Delete"
                            onClick={async () => {
                              setImgBusy(true)
                              try {
                                const updated = await api.del(`/submissions/${sub.id}/images/${i}`)
                                setSub(updated)
                              } catch (er2) {
                                setErr(er2.message)
                              } finally {
                                setImgBusy(false)
                              }
                            }}
                            className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white group-hover:flex"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {(sub.image_count || 0) < 6 && (
                        <label className={`flex h-16 w-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-slate-600 text-xs font-bold text-slate-400 hover:border-indigo-500 hover:text-indigo-300 ${imgBusy ? 'opacity-50' : ''}`}>
                          {imgBusy ? '…' : '+ Add'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={imgBusy}
                            onChange={async (e) => {
                              const f = e.target.files?.[0]
                              if (!f) return
                              setImgBusy(true)
                              setErr(''); setOk('')
                              try {
                                const fd = new FormData()
                                fd.append('file', f)
                                const updated = await api.upload(`/submissions/${sub.id}/images`, fd)
                                setSub(updated)
                              } catch (er2) {
                                setErr(er2.message)
                              } finally {
                                setImgBusy(false)
                                e.target.value = ''
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                  )}
                </div>
            </div>

            {err && <p className="text-sm font-bold text-rose-400">{err}</p>}
            {ok && <p className="text-sm font-bold text-emerald-400">{ok}</p>}

            <div className="flex flex-wrap gap-2 pt-2">
              <button disabled={busy} onClick={() => save('draft')} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-50">
                💾 Save draft
              </button>
              <button
                disabled={busy || !form.title.trim() || (asksRepo && !form.repo_url.trim() && !sub?.file_path)}
                onClick={() => save('submit')}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-50"
                title={asksRepo ? 'Needs title + repo (or an uploaded file). Final — you can\'t edit after this.' : 'Final — you can\'t edit after this.'}
              >
                🚀 Submit final
              </button>
            </div>
            <p className="text-xs text-slate-500">
              ⚠️ "Submit final" sends it to the public gallery and judges — it becomes read-only.
            </p>
          </form>
        )}

        {sub && event.rounds?.length > 0 && <RoundBoard event={event} sub={sub} />}

        {showStock && sub && (
          <StockThumbModal
            busy={thumbBusy}
            onClose={() => setShowStock(false)}
            onPick={async (file) => {
              setThumbBusy(true)
              setErr(''); setOk('')
              try {
                const updated = await api.post(`/submissions/${sub.id}/thumbnail/stock`, { file })
                setSub(updated)
                setOk('✅ Stock thumbnail set!')
                setShowStock(false)
              } catch (er) {
                setErr(er.message)
              } finally {
                setThumbBusy(false)
              }
            }}
          />
        )}
      </div>
    </div>
  )
}

// ---------- Round-wise deliverables board ----------
// One artifact slot PER event round: Round 1 might take a PPT deck, Round 2 a
// prototype video link, Round 3 the final build — each saved independently,
// re-saving updates that round (never duplicates). Judges see all of these.
function RoundBoard({ event, sub }) {
  const [board, setBoard] = useState(null)
  const [drafts, setDrafts] = useState({}) // {idx: {link_url, note}}
  const [busy, setBusy] = useState({})
  const [errs, setErrs] = useState({})
  const load = () =>
    api.get(`/submissions/rounds/mine/${event.id}`).then(setBoard).catch(() => setBoard(null))
  useEffect(() => { load() }, [event.id, sub?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!board) return null
  const done = board.rounds.filter((r) => r.deliverable).length
  const set = (idx, k, v) => setDrafts((d) => ({ ...d, [idx]: { ...d[idx], [k]: v } }))

  async function saveRound(idx) {
    const d = drafts[idx] || {}
    setBusy((b) => ({ ...b, [idx]: true })); setErrs((e) => ({ ...e, [idx]: '' }))
    try {
      await api.post(`/submissions/${sub.id}/rounds/${idx}`, {
        link_url: d.link_url !== undefined ? d.link_url : undefined,
        note: d.note !== undefined ? d.note : undefined,
      })
      setDrafts((x) => ({ ...x, [idx]: {} }))
      await load()
    } catch (er) { setErrs((e) => ({ ...e, [idx]: er.message })) }
    finally { setBusy((b) => ({ ...b, [idx]: false })) }
  }

  async function uploadRound(idx, f) {
    if (!f) return
    setBusy((b) => ({ ...b, [idx]: true })); setErrs((e) => ({ ...e, [idx]: '' }))
    try {
      const fd = new FormData()
      fd.append('file', f)
      await api.upload(`/submissions/${sub.id}/rounds/${idx}/file`, fd)
      await load()
    } catch (er) { setErrs((e) => ({ ...e, [idx]: er.message })) }
    finally { setBusy((b) => ({ ...b, [idx]: false })) }
  }

  return (
    <section className="card mt-6 p-6">
      <h3 className="text-lg font-bold">🧩 Round deliverables</h3>
      <p className="mb-4 mt-1 text-sm text-slate-400">
        One artifact per round — keep each stage separate (e.g. <b>Round 1: PPT deck</b>, <b>Round 2: prototype video</b>).
        Saving a round again <b>updates</b> it. Judges see everything here while scoring.
      </p>
      <div className="mb-4 flex items-center gap-3 text-xs font-bold">
        <span className="rounded-full bg-indigo-500/15 px-3 py-1 text-indigo-300">{done}/{board.rounds.length} rounds delivered</span>
        {board.locked && <span className="rounded-full bg-rose-500/15 px-3 py-1 text-rose-300">🔒 frozen — event ended</span>}
      </div>
      <div className="space-y-3">
        {board.rounds.map((r) => {
          const d = r.deliverable
          const draft = drafts[r.index] || {}
          const cur = {
            link_url: draft.link_url !== undefined ? draft.link_url : (d?.link_url || ''),
            note: draft.note !== undefined ? draft.note : (d?.note || ''),
          }
          const roundClosed = r.closed && !board.locked ? true : board.locked
          const overdue = r.closed && !d
          return (
            <div key={r.index} className={`rounded-xl border p-4 ${overdue ? 'border-rose-800/60 bg-rose-950/10' : 'border-slate-800 bg-slate-950/40'}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-white">{r.name}</p>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${d ? 'bg-emerald-500/15 text-emerald-300' : overdue ? 'bg-rose-500/15 text-rose-300' : 'bg-slate-700/60 text-slate-400'}`}>
                  {d ? '✅ DELIVERED' : overdue ? '⛔ DEADLINE PASSED' : '🕐 PENDING'}
                </span>
              </div>
              {r.description && <p className="mb-3 text-xs text-slate-500">{r.description}</p>}
              <div className="mb-3 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                  {r.deliverable_kind === 'link' ? '🔗 Link only' : r.deliverable_kind === 'file' ? '📎 File upload only' : '🆓 Link or file — your call'}
                </span>
                {r.accept && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">🗂 {r.accept}</span>}
                {r.deadline && (
                  <span className={`rounded-full px-2 py-0.5 ${r.closed ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-500/15 text-amber-300'}`}>
                    ⏰ due {new Date(r.deadline + 'Z').toLocaleString()}
                  </span>
                )}
              </div>
              {d?.file_name && (
                <a href={`/api/submissions/rounds/files/${d.id}`}
                   className="mb-2 inline-block rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-indigo-300 hover:border-indigo-500">
                  📎 {d.file_name} ↓
                </a>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={inputCls} placeholder="Artifact link (drive / youtube / figma…)"
                  value={cur.link_url} onChange={(e) => set(r.index, 'link_url', e.target.value)}
                  disabled={roundClosed || r.deliverable_kind === 'file'} />
                <input className={inputCls} placeholder="Note for judges (optional)"
                  value={cur.note} onChange={(e) => set(r.index, 'note', e.target.value)}
                  disabled={roundClosed} maxLength={200} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy[r.index] || roundClosed}
                  onClick={() => saveRound(r.index)}
                  className="rounded-lg bg-indigo-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-400 disabled:opacity-50">
                  {busy[r.index] ? 'Saving…' : d ? '💾 Update round' : '💾 Save round'}
                </button>
                <label className={`rounded-lg border border-slate-700 px-4 py-1.5 text-xs font-bold text-slate-300 ${roundClosed || r.deliverable_kind === 'link' ? 'hidden' : 'cursor-pointer hover:border-slate-500'}`}>
                  {busy[r.index] ? '⏳ Uploading…' : '⬆ Upload PPT / video / zip'}
                  <input type="file" className="hidden" disabled={board.locked || busy[r.index]}
                    accept=".ppt,.pptx,.pdf,.mp4,.zip,.png,.jpg,.jpeg,.ipynb,.docx"
                    onChange={(e) => { uploadRound(r.index, e.target.files?.[0]); e.target.value = '' }} />
                </label>
                {errs[r.index] && (
                  <p className="mt-2 w-full rounded-lg border border-rose-600/40 bg-rose-600/10 px-3 py-2 text-xs font-bold text-rose-300">
                    ⚠️ {errs[r.index]} — the round card is still PENDING; nothing was saved.
                  </p>
                )}
                {d?.updated_at && <span className="ml-auto text-[10px] text-slate-600">updated {new Date(d.updated_at + 'Z').toLocaleString()}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
