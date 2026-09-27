import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Navbar, fmtDate, fmtDay, GENDER_ICON } from '../components/ui'
import { STYLE_OPTIONS } from '../components/eventDisplays'
import IntegrationsPanel from '../components/t4'
import ChatModPanel from '../components/ChatModPanel'

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-50'
const lbl = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400'
const searchCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 pl-9 text-sm outline-none focus:border-indigo-500'

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
      <input
        className={searchCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-xs text-slate-500 hover:text-white"
        >
          ✕
        </button>
      )}
    </div>
  )
}

function Stat({ label, value, active, onClick }) {
  // clickable overview card — opens a searchable list of whatever it counts
  return (
    <button
      onClick={onClick}
      className={`card p-5 text-left transition hover:border-indigo-500/60 hover:shadow-lg hover:shadow-indigo-500/10 ${
        active ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/50' : ''
      }`}
      title={`Click to see all ${label.toLowerCase()}`}
    >
      <div className="flex items-start justify-between">
        <p className="text-3xl font-bold text-white">{value}</p>
        <span className="text-lg opacity-60">{active ? '▲' : '📋'}</span>
      </div>
      <p className={`mt-1 text-sm ${active ? 'font-bold text-indigo-300' : 'text-slate-400'}`}>{label}</p>
    </button>
  )
}

/* ---------------- overview drill-down (click a stat card) ---------------- */

const STAT_DEFS = {
  participants: { icon: '👥', title: 'All participants', hint: 'name, email or event…' },
  admins: { icon: '👑', title: 'All admins', hint: 'name or email…' },
  events: { icon: '🎪', title: 'All events', hint: 'title, slug or mode…' },
  registrations: { icon: '📝', title: 'All registrations', hint: 'name, email, event or team…' },
  teams: { icon: '🤝', title: 'All teams', hint: 'team name, event or code…' },
  judges: { icon: '⚖️', title: 'All judges', hint: 'name or email…' },
}

function StatDetail({ kind, onOpenUser, onOpenEvent, onClose }) {
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    setRows(null); setQ(''); setErr('')
    async function load() {
      try {
        if (kind === 'participants') {
          setRows((await api.get('/admin/contestants')).map((c) => ({
            id: c.user_id, name: c.name, email: c.email,
            sub1: `${c.registrations} registration${c.registrations === 1 ? '' : 's'}`,
            sub2: c.events.join(' · ') || 'no events yet',
            meta: c.last_login ? `last login ${fmtDate(c.last_login)}` : 'never logged in',
            userId: c.user_id,
          })))
        } else if (kind === 'admins') {
          setRows((await api.get('/auth/admins')).map((a) => ({
            id: a.id, name: a.name, email: a.email,
            sub1: '👑 full admin access', sub2: '',
            meta: `admin since ${fmtDay(a.created_at)}`,
          })))
        } else if (kind === 'judges') {
          setRows((await api.get('/judging/judges')).map((j) => ({
            id: j.id, name: j.name, email: j.email,
            sub1: '⚖️ judge', sub2: '',
            meta: j.created_at ? `since ${fmtDay(j.created_at)}` : '',
          })))
        } else if (kind === 'events') {
          const evs = await api.get('/admin/events')
          setRows(evs.map((e) => ({
            id: e.id, name: e.title, email: e.slug,
            sub1: `${e.mode || ''} · ${e.registrations ?? 0} regs`,
            sub2: e.status === 'ongoing' ? '🔴 LIVE' : e.status,
            meta: fmtDay(e.start_date),
            slug: e.slug,
          })))
        } else if (kind === 'registrations') {
          const evs = await api.get('/admin/events')
          const all = []
          await Promise.all(evs.map(async (ev) => {
            try {
              const regs = await api.get(`/admin/events/${ev.id}/registrations`)
              regs.forEach((r) => all.push({
                id: `${ev.id}_${r.id}`, name: r.name, email: r.user_email || r.email || '',
                sub1: r.team_name ? `🤝 ${r.team_name}` : 'no team',
                sub2: `🎪 ${ev.title}`,
                meta: r.created_at ? fmtDate(r.created_at) : '',
              }))
            } catch { /* event with no regs access — skip */ }
          }))
          setRows(all)
        } else if (kind === 'teams') {
          const evs = await api.get('/admin/events')
          const all = []
          await Promise.all(evs.map(async (ev) => {
            try {
              const teams = await api.get(`/teams/event/${ev.id}`)
              teams.forEach((t) => all.push({
                id: `${ev.id}_${t.id}`, name: t.name, email: `code ${t.invite_code}`,
                sub1: `${t.avatar_url || ''} team`,
                sub2: `🎪 ${ev.title}`,
                meta: t.created_at ? fmtDay(t.created_at) : '',
              }))
            } catch { /* skip */ }
          }))
          setRows(all)
        }
      } catch (er) {
        setErr(er.message)
      }
    }
    load()
  }, [kind])

  const meta = STAT_DEFS[kind]
  const filtered = (rows || []).filter((r) => {
    const t = q.trim().toLowerCase()
    if (!t) return true
    return [r.name, r.email, r.sub1, r.sub2, r.meta].some((v) => String(v || '').toLowerCase().includes(t))
  })

  return (
    <section className="card p-5" style={{ borderColor: 'rgba(99,102,241,0.4)' }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-white">
          {meta.icon} {meta.title} <span className="ml-1 text-sm font-normal text-slate-500">({rows ? filtered.length : '…'}{rows ? `/${rows.length}` : ''})</span>
        </h3>
        <button onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300 hover:bg-slate-700">✕ close</button>
      </div>
      <SearchBox value={q} onChange={setQ} placeholder={`Search ${meta.title.toLowerCase()} — ${meta.hint}`} autoFocus />
      <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
        {err && <p className="text-sm font-bold text-rose-400">{err}</p>}
        {!rows && !err && <p className="p-4 text-center text-sm text-slate-500">Loading…</p>}
        {rows && filtered.length === 0 && (
          <p className="p-4 text-center text-sm text-slate-500">No match for "{q}"</p>
        )}
        {filtered.map((r) => (
          <button
            key={r.id}
            onClick={() => (r.userId ? onOpenUser(r.userId) : r.slug ? onOpenEvent(r.slug) : null)}
            className={`flex w-full items-center gap-3 rounded-lg bg-slate-950/60 px-4 py-2.5 text-left text-sm ${(r.userId || r.slug) ? 'hover:bg-slate-800 cursor-pointer' : 'cursor-default'}`}
            title={r.userId ? 'Click for full details' : r.slug ? 'Open event page' : ''}
          >
            <div className="flex-1">
              <span className="font-semibold text-white">{r.name}</span>
              {r.email && <span className="ml-2 text-slate-400">{r.email}</span>}
              {typeof r.sub2 === 'string' && r.sub2 && <span className="ml-2 text-xs text-indigo-300">{r.sub2}</span>}
            </div>
            <span className="text-xs text-slate-500">{r.sub1}</span>
            <span className="w-32 text-right text-xs text-slate-500">{r.meta}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/* ---------------- Event creator ---------------- */

const FIELD_TOGGLES = [
  { key: 'name', label: 'Full name', locked: true },
  { key: 'gender', label: 'Gender' },
  { key: 'email', label: 'Email' },
  { key: 'whatsapp_invite', label: 'WhatsApp number' },
  { key: 'discord_invite', label: 'Discord ID' },
  { key: 'github_url', label: 'GitHub profile' },
  { key: 'linkedin_url', label: 'LinkedIn profile' },
  { key: 'age', label: 'Age' },
  { key: 'institution', label: 'Institution / College' },
  { key: 'college_year', label: 'College year' },
  { key: 'phone', label: 'Phone number' },
  { key: 'skills', label: 'Skills' },
  { key: 'portfolio_url', label: 'Portfolio / website' },
  { key: 'project_repo', label: '🐱 Project GitHub repo → gallery' },
]

const defaultFields = Object.fromEntries(FIELD_TOGGLES.map((f) => [f.key, true]))

const ROUND_SUGGESTIONS = [
  'Idea & Team formation',
  'Build sprint',
  'Submit & Demo',
  'Screening / Quiz',
  'Prototype check',
  'Final pitch',
]

function ListEditor({ label, hints, values, onChange, textarea }) {
  const set = (i, v) => onChange(values.map((x, j) => (j === i ? v : x)))
  return (
    <div>
      <label className={lbl}>{label}</label>
      <div className="space-y-2">
        {values.map((v, i) => (
          <div key={i} className="flex gap-2">
            {textarea ? (
              <textarea rows={2} className={inputCls} placeholder={hints} value={v} onChange={(e) => set(i, e.target.value)} />
            ) : (
              <input className={inputCls} placeholder={hints} value={v} onChange={(e) => set(i, e.target.value)} />
            )}
            {values.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(values.filter((_, j) => j !== i))}
                className="rounded-lg border border-slate-700 px-3 text-slate-400 hover:bg-slate-800"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...values, ''])}
          className="text-sm font-semibold text-indigo-300 hover:underline"
        >
          + Add
        </button>
      </div>
    </div>
  )
}

function EventCreator({ onCreated }) {
  const [form, setForm] = useState({
    title: '',
    tagline: '',
    description: '',
    about: '',
    eligibility: '',
    contact_email: '',
    whatsapp_group: '',
    discord_group: '',
    min_team_size: 1,
    max_team_size: 4,
    mode: 'Online',
    location: '',
    start_date: '',
    end_date: '',
    registration_deadline: '',
    prize_pool: '',
    cover: '#6366f1',
  })
  const [style, setStyle] = useState('treasure_map')
  const [fields, setFields] = useState(defaultFields)
  const [tracks, setTracks] = useState([{ name: '', prize: '' }])
  const [rounds, setRounds] = useState([{ name: 'Round 1 — Idea & Team formation', description: '', deliverable_kind: 'any', accept: '', deadline: '' }])
  const [rules, setRules] = useState([''])
  const [criteria, setCriteria] = useState([''])
  const [subQuestions, setSubQuestions] = useState([''])
  // T2: organizer-configurable weighted rubric (empty = platform default)
  const [useCustomRubric, setUseCustomRubric] = useState(false)
  const [rubric, setRubric] = useState([
    { name: 'Innovation', weight: 30 },
    { name: 'Execution', weight: 30 },
    { name: 'Impact', weight: 20 },
    { name: 'Presentation', weight: 20 },
  ])
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  function updateTrack(i, k, v) {
    setTracks(tracks.map((t, j) => (j === i ? { ...t, [k]: v } : t)))
  }
  function updateRound(i, k, v) {
    setRounds(rounds.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setOk('')
    setBusy(true)
    try {
      const created = await api.post('/admin/events', {
        ...form,
        min_team_size: Number(form.min_team_size) || 1,
        max_team_size: Number(form.max_team_size) || 4,
        start_date: new Date(form.start_date).toISOString(),
        end_date: new Date(form.end_date).toISOString(),
        registration_deadline: form.registration_deadline
          ? new Date(form.registration_deadline).toISOString()
          : null,
        tracks: tracks.filter((t) => t.name.trim()),
        rounds: rounds.filter((r) => r.name.trim()).map((r) => ({
          ...r,
          deadline: r.deadline ? new Date(r.deadline).toISOString() : null,
        })),
        rules: rules.filter((r) => r.trim()),
        judging_criteria: criteria.filter((c) => c.trim()),
        submission_questions: subQuestions.filter((q) => q.trim()),
        rubric: useCustomRubric
          ? rubric.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), weight: Number(r.weight) || 0 }))
          : undefined,
        display_style: style,
        form_fields: fields,
      })
      setOk(`✅ Event "${created.title}" created! Participants can now see and join it.`)
      setForm({ ...form, title: '', tagline: '', description: '', about: '', prize_pool: '', location: '', contact_email: '', whatsapp_group: '', discord_group: '' })
      setTracks([{ name: '', prize: '' }])
      setRounds([{ name: 'Round 1 — ', description: '' }])
      setRules([''])
      setCriteria([''])
      setSubQuestions([''])
      setUseCustomRubric(false)
      setRubric([
        { name: 'Innovation', weight: 30 },
        { name: 'Execution', weight: 30 },
        { name: 'Impact', weight: 20 },
        { name: 'Presentation', weight: 20 },
      ])
      onCreated?.(created)
    } catch (er) {
      setErr(er.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-6 p-6">
      <div>
        <h3 className="text-lg font-bold">✨ Create new event</h3>
        <p className="text-sm text-slate-400">
          Full control — what the event is about, its rounds & rules, contact and community
          links, what the registration form asks, and how the page is displayed.
        </p>
      </div>

      {/* basics */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={lbl}>Event name *</label>
          <input required className={inputCls} placeholder="e.g. AI Agents Hackathon" value={form.title} onChange={set('title')} />
        </div>
        <div>
          <label className={lbl}>Tagline</label>
          <input className={inputCls} placeholder="One-liner that sets the vibe" value={form.tagline} onChange={set('tagline')} />
        </div>
      </div>
      <div>
        <label className={lbl}>Short description *</label>
        <textarea
          required
          rows={2}
          className={inputCls}
          placeholder="Two-line summary that appears on the event card"
          value={form.description}
          onChange={set('description')}
        />
      </div>
      <div>
        <label className={lbl}>About this hackathon — the deep briefing</label>
        <textarea
          rows={5}
          className={inputCls}
          placeholder="What is the event? Who is it for? What experience should participants expect? What makes this edition special?"
          value={form.about}
          onChange={set('about')}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={lbl}>Mode</label>
          <select className={inputCls} value={form.mode} onChange={set('mode')}>
            <option>Online</option>
            <option>Offline</option>
            <option>Hybrid</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Location</label>
          <input className={inputCls} placeholder="Mumbai / Remote" value={form.location} onChange={set('location')} />
        </div>
        <div>
          <label className={lbl}>Prize pool</label>
          <input className={inputCls} placeholder="$5,000" value={form.prize_pool} onChange={set('prize_pool')} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={lbl}>Starts *</label>
          <input required type="datetime-local" className={inputCls} value={form.start_date} onChange={set('start_date')} />
        </div>
        <div>
          <label className={lbl}>Ends *</label>
          <input required type="datetime-local" className={inputCls} value={form.end_date} onChange={set('end_date')} />
        </div>
        <div>
          <label className={lbl}>Registration deadline</label>
          <input type="datetime-local" className={inputCls} value={form.registration_deadline} onChange={set('registration_deadline')} />
        </div>
      </div>

      {/* team size */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={lbl}>Min team size</label>
          <input type="number" min={1} max={10} className={inputCls} value={form.min_team_size} onChange={set('min_team_size')} />
        </div>
        <div>
          <label className={lbl}>Max team size</label>
          <input type="number" min={1} max={10} className={inputCls} value={form.max_team_size} onChange={set('max_team_size')} />
        </div>
        <div>
          <label className={lbl}>Eligibility</label>
          <input className={inputCls} placeholder="e.g. Open to students worldwide" value={form.eligibility} onChange={set('eligibility')} />
        </div>
      </div>

      {/* rounds builder */}
      <div>
        <label className={lbl}>Rounds — every round the participants go through</label>
        <div className="space-y-2">
          {rounds.map((r, i) => (
            <div key={i} className="rounded-lg border border-slate-800 p-3">
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  placeholder={`Round ${i + 1} name/sprint title`}
                  list="round-names"
                  value={r.name}
                  onChange={(e) => updateRound(i, 'name', e.target.value)}
                />
                {rounds.length > 1 && (
                  <button type="button" onClick={() => setRounds(rounds.filter((_, j) => j !== i))} className="rounded-lg border border-slate-700 px-3 text-slate-400 hover:bg-slate-800">
                    ✕
                  </button>
                )}
              </div>
              <textarea
                rows={2}
                className={`${inputCls} mt-2`}
                placeholder="What happens in this round? What must the team deliver?"
                value={r.description}
                onChange={(e) => updateRound(i, 'description', e.target.value)}
              />
              {/* per-round deliverable requirements — shown to participants on the submit page */}
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div>
                  <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">📦 Required artifact</label>
                  <select className={inputCls} value={r.deliverable_kind || 'any'}
                    onChange={(e) => updateRound(i, 'deliverable_kind', e.target.value)}>
                    <option value="any">Any artifact (link or file)</option>
                    <option value="link">Link only (drive / video / figma)</option>
                    <option value="file">File upload only</option>
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">🗂 Accepted file types</label>
                  <input className={inputCls} placeholder="e.g. ppt, pptx, pdf (blank = any)"
                    value={r.accept || ''} onChange={(e) => updateRound(i, 'accept', e.target.value)} />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">⏰ Round deadline</label>
                  <input type="datetime-local" className={inputCls} value={r.deadline || ''}
                    onChange={(e) => updateRound(i, 'deadline', e.target.value)} />
                </div>
              </div>
              <p className="mt-1 text-[10px] text-slate-600">
                Participants see these on the submission page; writes block after the deadline, wrong file types are rejected.
              </p>
            </div>
          ))}
          <datalist id="round-names">
            {ROUND_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => setRounds([...rounds, { name: `Round ${rounds.length + 1} — `, description: '', deliverable_kind: 'any', accept: '', deadline: '' }])}
            className="text-sm font-semibold text-indigo-300 hover:underline"
          >
            + Add another round
          </button>
        </div>
      </div>

      {/* rules + judging */}
      <div className="grid gap-6 md:grid-cols-2">
        <ListEditor label="Rules & regulations (one per line)" hints="e.g. Teams of 1-4 people" values={rules} onChange={setRules} />
        <ListEditor label="Judging criteria (one per line)" hints="e.g. Innovation & impact" values={criteria} onChange={setCriteria} />
      </div>

      {/* contact & community */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <p className="mb-1 text-sm font-bold text-white">📞 Contact & community (optional)</p>
        <p className="mb-3 text-xs text-slate-500">
          This shows up on the event page so participants know who pulls the strings.
          Group links = direct join — participants get a "Join group" button right after registering.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={lbl}>Organizer contact email</label>
            <input type="email" className={inputCls} placeholder="you@hackathon.dev" value={form.contact_email} onChange={set('contact_email')} />
          </div>
          <div>
            <label className={lbl}>WhatsApp group invite</label>
            <input className={inputCls} placeholder="https://chat.whatsapp.com/..." value={form.whatsapp_group} onChange={set('whatsapp_group')} />
          </div>
          <div>
            <label className={lbl}>Discord server invite</label>
            <input className={inputCls} placeholder="https://discord.gg/..." value={form.discord_group} onChange={set('discord_group')} />
          </div>
        </div>
      </div>

      {/* accent color */}
      <div>
        <label className={lbl}>Accent color</label>
        <div className="flex items-center gap-3">
          <input type="color" value={form.cover} onChange={set('cover')} className="h-9 w-14 cursor-pointer rounded border border-slate-700 bg-slate-950" />
          <span className="font-mono text-sm text-slate-400">{form.cover}</span>
        </div>
      </div>

      {/* tracks builder */}
      <div>
        <label className={lbl}>Tracks / quest regions (+ prizes)</label>
        <div className="space-y-2">
          {tracks.map((t, i) => (
            <div key={i} className="flex gap-2">
              <input className={inputCls} placeholder={`Track ${i + 1} name`} value={t.name} onChange={(e) => updateTrack(i, 'name', e.target.value)} />
              <input className={`${inputCls} w-40`} placeholder="Prize" value={t.prize} onChange={(e) => updateTrack(i, 'prize', e.target.value)} />
              {tracks.length > 1 && (
                <button type="button" onClick={() => setTracks(tracks.filter((_, j) => j !== i))} className="rounded-lg border border-slate-700 px-3 text-slate-400 hover:bg-slate-800">
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setTracks([...tracks, { name: '', prize: '' }])} className="text-sm font-semibold text-indigo-300 hover:underline">
            + Add another track
          </button>
        </div>
      </div>

      {/* organizer-defined custom questions for the submission form (T1) */}
      <div>
        <label className={lbl}>Custom submission questions (optional)</label>
        <div className="space-y-2">
          {subQuestions.map((q, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={inputCls}
                placeholder={`e.g. What makes your project unique? (question ${i + 1})`}
                value={q}
                onChange={(e) => setSubQuestions(subQuestions.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {subQuestions.length > 1 && (
                <button type="button" onClick={() => setSubQuestions(subQuestions.filter((_, j) => j !== i))} className="rounded-lg border border-slate-700 px-3 text-slate-400 hover:bg-slate-800">
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setSubQuestions([...subQuestions, ''])} className="text-sm font-semibold text-indigo-300 hover:underline">
            + Add question
          </button>
          <p className="text-[11px] text-slate-500">Teams must answer these in the submission editor 📝</p>
        </div>
      </div>

      {/* T2: organizer-configurable weighted judging rubric */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
        <div className="mb-2 flex items-center justify-between">
          <label className={`${lbl} !mb-0`}>⚖️ Judging rubric (weighted criteria)</label>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-indigo-300">
            <input
              type="checkbox"
              checked={useCustomRubric}
              onChange={(e) => {
                setUseCustomRubric(e.target.checked)
                if (e.target.checked) {
                  const names = criteria.filter((c) => c.trim())
                  if (names.length) {
                    const base = Math.floor(100 / names.length)
                    const rem = 100 - base * names.length
                    setRubric(names.slice(0, 10).map((n, i) => ({ name: n.trim(), weight: base + (i < rem ? 1 : 0) })))
                  }
                }
              }}
              className="h-3.5 w-3.5 accent-indigo-500"
            />
            Customize for this event
          </label>
        </div>
        {!useCustomRubric ? (
          <p className="text-xs text-slate-500">
            Default rubric: <b className="text-slate-300">Innovation 30% · Execution 30% · Impact 20% · Presentation 20%</b>
            <br />💡 The <b>Judging criteria</b> you listed above automatically become this event's rubric
            (equal weights) — no need to type them twice. Tick "Customize" to tweak anything (must total 100%).
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-emerald-400/80">✨ Auto-filled from the Judging criteria above — just adjust the weights.</p>
            {rubric.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={inputCls}
                  placeholder={`Criterion ${i + 1} (e.g. Design)`}
                  value={c.name}
                  onChange={(e) => setRubric(rubric.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className={`${inputCls} w-24`}
                    value={c.weight}
                    onChange={(e) => setRubric(rubric.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))}
                  />
                  <span className="text-xs text-slate-500">%</span>
                </div>
                {rubric.length > 2 && (
                  <button type="button" onClick={() => setRubric(rubric.filter((_, j) => j !== i))} className="rounded-lg border border-slate-700 px-3 text-slate-400 hover:bg-slate-800">
                    ✕
                  </button>
                )}
              </div>
            ))}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setRubric([...rubric, { name: '', weight: 10 }])}
                disabled={rubric.length >= 10}
                className="text-sm font-semibold text-indigo-300 hover:underline disabled:opacity-40"
              >
                + Add criterion
              </button>
              <span
                className={`text-xs font-black ${
                  rubric.reduce((t, c) => t + (Number(c.weight) || 0), 0) === 100
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                Total: {rubric.reduce((t, c) => t + (Number(c.weight) || 0), 0)}%
                {rubric.reduce((t, c) => t + (Number(c.weight) || 0), 0) !== 100 && ' — must equal 100%'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Judges will see exactly these criteria (1-10 each) and a live weighted total ⚡
            </p>
          </div>
        )}
      </div>

      {/* display style picker */}
      <div>
        <label className={lbl}>How participants will see this event</label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {STYLE_OPTIONS.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={() => setStyle(s.id)}
              className={`rounded-xl border-2 p-0 text-left transition ${
                style === s.id
                  ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                  : 'border-slate-700 hover:border-slate-500'
              }`}
            >
              <div className={`flex h-16 items-center justify-center rounded-t-lg bg-gradient-to-br text-3xl ${s.preview}`}>
                {s.previewIcon}
              </div>
              <div className="p-3">
                <p className="text-sm font-bold text-white">{s.name}</p>
                <p className="mt-0.5 text-xs leading-snug text-slate-400">{s.blurb}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* form fields toggles */}
      <div>
        <label className={lbl}>What the registration form should ask</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FIELD_TOGGLES.map((f) => (
            <button
              type="button"
              key={f.key}
              disabled={f.locked}
              onClick={() => setFields({ ...fields, [f.key]: !fields[f.key] })}
              className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
                fields[f.key]
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-700 text-slate-500'
              }`}
            >
              {fields[f.key] ? '✓ ' : ''}
              {f.label}
              {f.locked && <span className="block text-[10px] opacity-70">always on</span>}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="text-sm font-bold text-rose-400">{err}</p>}
      {ok && <p className="text-sm font-bold text-emerald-400">{ok}</p>}

      <button type="submit" disabled={busy} className="rounded-xl bg-indigo-500 px-6 py-3 font-extrabold text-white hover:bg-indigo-400 disabled:opacity-50">
        {busy ? 'Creating…' : '🚀 Create event'}
      </button>
    </form>
  )
}

/* ---------------- Members manager ---------------- */

const MEMBER_COLS = [
  ['name', 'Name'],
  ['gender', 'Gender'],
  ['email', 'Email'],
  ['whatsapp_invite', 'WhatsApp'],
  ['discord_invite', 'Discord'],
  ['github_url', 'GitHub'],
  ['linkedin_url', 'LinkedIn'],
  ['age', 'Age'],
  ['institution', 'Institution'],
  ['college_year', 'Year'],
  ['phone', 'Phone'],
  ['skills', 'Skills'],
  ['portfolio_url', 'Portfolio'],
]

function MembersPanel({ eventId, eventTitle }) {
  const [rows, setRows] = useState(null)
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')

  const load = () =>
    api.get(`/admin/events/${eventId}/registrations`).then(setRows).catch(() => setRows([]))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  async function addMember(e) {
    e.preventDefault()
    setErr(''); setMsg('')
    try {
      await api.post(`/admin/events/${eventId}/members`, { user_email: email.trim() })
      setMsg(`✅ ${email.trim()} has been added to "${eventTitle}".`)
      setEmail('')
      load()
    } catch (er) {
      setErr(er.message)
    }
  }

  async function removeMember(id, name) {
    if (!window.confirm(`Remove ${name} from this event?`)) return
    await api.del(`/admin/registrations/${id}`).catch((er) => setErr(er.message))
    load()
  }

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return rows || []
    return (rows || []).filter((r) =>
      [r.name, r.email, r.institution, r.team_name, r.skills, r.gender]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t)),
    )
  }, [rows, q])

  if (rows === null) return <p className="p-4 text-sm text-slate-400">Loading members…</p>

  return (
    <div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <SearchBox value={q} onChange={setQ} placeholder={`Search ${rows.length} members — name, email, team…`} />
        <div className="flex items-center justify-end text-xs text-slate-500">
          {q && `${filtered.length} match${filtered.length === 1 ? '' : 'es'}`}
        </div>
      </div>
      <form onSubmit={addMember} className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label className={lbl}>Add a participant (by their platform email)</label>
          <input required type="email" className={inputCls} placeholder="user@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500">
          + Add member
        </button>
      </form>
      {msg && <p className="mb-2 text-sm font-bold text-emerald-400">{msg}</p>}
      {err && <p className="mb-2 text-sm font-bold text-rose-400">{err}</p>}

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500">{q ? 'No member matches that search.' : 'No registrations yet in this event.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                {MEMBER_COLS.map(([, l]) => (
                  <th key={l} className="whitespace-nowrap px-4 py-3">{l}</th>
                ))}
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/60 align-top">
                  {MEMBER_COLS.map(([k, l]) => (
                    <td key={l} className="max-w-44 truncate whitespace-nowrap px-4 py-3 text-slate-300">
                      {k === 'gender' && r[k] ? (
                        <span title={r[k]}>{GENDER_ICON[r[k]] || ''} {r[k]}</span>
                      ) : (
                        r[k] ?? <span className="text-slate-600">—</span>
                      )}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-3 text-indigo-300">
                    {r.team_name || '—'}
                    {r.team_code && <span className="ml-1 text-xs text-slate-500">({r.team_code})</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => removeMember(r.id, r.name)} className="rounded-lg border border-rose-600/50 px-2.5 py-1 text-xs font-bold text-rose-300 hover:bg-rose-600/10">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ---------------- Contestant detail sheet ---------------- */

function DetailRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-4 border-b border-slate-800/50 py-2 text-sm">
      <span className="shrink-0 font-semibold text-slate-400">{label}</span>
      <span className="break-all text-right text-slate-200">{value}</span>
    </div>
  )
}

function ContestantDetail({ userId, onClose }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    setData(null); setErr('')
    api.get(`/admin/contestants/${userId}/detail`).then(setData).catch((e) => setErr(e.message))
  }, [userId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        {err && <p className="text-rose-400">{err}</p>}
        {!data && !err && <p className="text-slate-400">Loading…</p>}
        {data && (
          <>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-extrabold text-white">{data.user.name}</h3>
                <p className="text-sm text-slate-400">{data.user.email}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Joined {fmtDate(data.user.created_at)} · Last login {fmtDate(data.last_login)}
                </p>
              </div>
              <button onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-1 text-sm text-slate-300 hover:bg-slate-800">✕ Close</button>
            </div>

            {data.registrations.length === 0 && (
              <p className="text-sm text-slate-500">This participant hasn't registered for any event yet.</p>
            )}
            {data.registrations.map((r) => (
              <div key={r.id} className="mb-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-bold text-indigo-300">{r.event_title || `Event #${r.event_id}`}</span>
                  {r.team_name && (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-300">
                      Team: {r.team_name}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">registered {fmtDate(r.created_at)}</span>
                </div>
                <DetailRow label="✉️ Email" value={r.email} />
                <DetailRow label="🚻 Gender" value={r.gender ? `${GENDER_ICON[r.gender] || ''} ${r.gender}` : null} />
                <DetailRow label="💬 WhatsApp" value={r.whatsapp_invite} />
                <DetailRow label="🎮 Discord" value={r.discord_invite} />
                <DetailRow label="📞 Phone" value={r.phone} />
                <DetailRow label="🐱 GitHub" value={r.github_url} />
                <DetailRow label="💼 LinkedIn" value={r.linkedin_url} />
                <DetailRow label="🛠 Skills" value={r.skills} />
                <DetailRow label="🌐 Portfolio" value={r.portfolio_url} />
                <DetailRow label="🏫 Institution" value={r.institution} />
                <DetailRow label="🎓 College year" value={r.college_year} />
                <DetailRow label="🎂 Age" value={r.age} />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

/* ---------------- Main ---------------- */

const TABS = [
  ['overview', '📊 Overview'],
  ['create', '✨ Create event'],
  ['events', '🛠️ Events & members'],
  ['people', '👥 Contestants DB'],
  ['judging', '⚖️ Judges & results'],
  ['integrations', '🔌 Integrations'],
  ['lounge', '💬 Lounge'],
  ['admins', '👑 Admins'],
]

/* ---------------- admin management ---------------- */

function AdminsPanel() {
  const [admins, setAdmins] = useState([])
  const [me, setMe] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = () => {
    api.get('/auth/admins').then(setAdmins).catch(() => {})
    api.get('/auth/me').then(setMe).catch(() => {})
  }
  useEffect(() => { load() }, [])

  async function create(e) {
    e.preventDefault()
    setBusy(true); setMsg(''); setErr('')
    try {
      const a = await api.post('/auth/admins', form)
      setMsg(`✅ Admin "${a.name}" created — share ${a.email} + the password with them (they log in from the Admin tab)`)
      setForm({ name: '', email: '', password: '' })
      load()
    } catch (er) {
      setErr(er.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="card p-5">
        <h3 className="mb-3 text-sm font-bold text-white">👑 Admin accounts ({admins.length})</h3>
        <ul className="space-y-2 text-sm">
          {admins.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-lg bg-slate-950/60 px-3 py-2">
              <span className="flex-1">
                <span className="font-semibold text-white">{a.name}</span>
                <span className="ml-2 text-slate-400">{a.email}</span>
              </span>
              {me?.id === a.id && (
                <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-bold text-indigo-300">you</span>
              )}
              <span className="text-[11px] text-slate-500">since {new Date(a.created_at).toLocaleDateString()}</span>
            </li>
          ))}
          {admins.length === 0 && <li className="text-slate-500">Loading…</li>}
        </ul>
      </div>

      <form onSubmit={create} className="card space-y-3 p-5">
        <h3 className="text-sm font-bold text-white">➕ Create another admin ID</h3>
        <p className="text-xs text-slate-500">
          The new admin gets the full console — create events, assign judges, and (careful!) create more admins.
        </p>
        <input
          required
          className={inputCls}
          placeholder="Full name (e.g. Riya Kapoor)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          required
          type="email"
          className={inputCls}
          placeholder="admin email (e.g. riya@raptors.dev)"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          required
          type="password"
          minLength={6}
          className={inputCls}
          placeholder="Temporary password (min 6 chars — they use it from the Admin login tab)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {msg && <p className="text-xs font-bold text-emerald-400">{msg}</p>}
        {err && <p className="text-xs font-bold text-rose-400">{err}</p>}
        <button
          type="submit"
          disabled={busy || !form.name.trim() || !form.email.trim() || form.password.length < 6}
          className="w-full rounded-lg bg-amber-500 py-2 text-sm font-black text-slate-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? 'Creating…' : '👑 Create admin'}
        </button>
      </form>
    </section>
  )
}

/* ---------------- judges & results ---------------- */

function JudgingPanel() {
  const [judges, setJudges] = useState([])
  const [events, setEvents] = useState([])
  const [assign, setAssign] = useState({ event_id: '', per_submission: 2 })
  const [board, setBoard] = useState(null)
  const [boardEvent, setBoardEvent] = useState('')
  const [assignQ, setAssignQ] = useState('') // search events in the assign picker
  const [boardQ, setBoardQ] = useState('') // search events in the leaderboard picker
  const [form, setForm] = useState({ email: '', name: '', password: '' })
  const [picked, setPicked] = useState([]) // judge ids selected for batch assign
  const [pvEvent, setPvEvent] = useState('')
  const [pvJudge, setPvJudge] = useState('')
  const [preview, setPreview] = useState(null)
  const [pvErr, setPvErr] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const loadJudges = () => api.get('/judging/judges').then(setJudges).catch(() => setJudges([]))
  useEffect(() => {
    loadJudges()
    api.get('/admin/events').then(setEvents).catch(() => {})
  }, [])

  async function addJudge(e) {
    e.preventDefault()
    setErr(''); setMsg('')
    try {
      await api.post('/judging/judges', form)
      setMsg(`✅ ${form.name} is now a judge`)
      setForm({ email: '', name: '', password: '' })
      loadJudges()
    } catch (er) {
      setErr(er.message)
    }
  }

  async function removeJudge(id, name) {
    if (!window.confirm(`Remove judge ${name}? Their assignments and scores are also deleted.`)) return
    await api.del(`/judging/judges/${id}`).catch((e) => setErr(e.message))
    setPicked((p) => p.filter((x) => x !== id))
    loadJudges()
  }

  async function doAssign(e) {
    e.preventDefault()
    setErr(''); setMsg('')
    try {
      const r = await api.post('/judging/assign', {
        event_id: Number(assign.event_id),
        per_submission: Number(assign.per_submission),
        ...(picked.length ? { judge_ids: picked } : {}),
      })
      setMsg(`✅ Assigned ${r.assigned} review jobs across ${r.judge_count} judges${picked.length ? ' (your selection)' : ''}`)
    } catch (er) {
      setErr(er.message)
    }
  }

  async function loadBoard(eventId) {
    setBoardEvent(eventId)
    if (!eventId) { setBoard(null); return }
    try {
      setBoard(await api.get(`/judging/leaderboard/${eventId}`))
    } catch (er) {
      setErr(er.message)
    }
  }

  return (
    <div className="space-y-6">
      {/* judge invite */}
      <div className="card p-6">
        <h3 className="mb-1 text-lg font-bold">⚖️ Invite judges</h3>
        <p className="mb-4 text-sm text-slate-400">
          Judges score only the projects assigned to them — backend-enforced, no front-end hiding.
        </p>
        <form onSubmit={addJudge} className="grid gap-3 sm:grid-cols-3">
          <input required className={inputCls} placeholder="Judge name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input required type="email" className={inputCls} placeholder="judge@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="flex gap-2">
            <input required className={inputCls} placeholder="Temporary password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400">+ Invite</button>
          </div>
        </form>
        {err && <p className="mt-2 text-sm font-bold text-rose-400">{err}</p>}
        {msg && <p className="mt-2 text-sm font-bold text-emerald-400">{msg}</p>}

        {judges.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                👆 Existing judges — tap to select for assignment
              </p>
              <div className="flex items-center gap-3 text-xs">
                <span className="font-bold text-indigo-300">
                  {picked.length ? `${picked.length} of ${judges.length} selected` : 'none selected = all judges used'}
                </span>
                {picked.length > 0 && (
                  <button type="button" onClick={() => setPicked([])} className="font-bold text-slate-400 hover:text-white">Clear</button>
                )}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {judges.map((j) => {
                const on = picked.includes(j.id)
                return (
                  <div
                    key={j.id}
                    role="button" tabIndex={0}
                    onClick={() => setPicked((p) => (on ? p.filter((x) => x !== j.id) : [...p, j.id]))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked((p) => (on ? p.filter((x) => x !== j.id) : [...p, j.id])) } }}
                    className={`group flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${
                      on
                        ? 'border-indigo-400 bg-indigo-500/15 ring-2 ring-indigo-400/40'
                        : 'border-slate-700 bg-slate-900 hover:border-slate-500 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${on ? 'bg-indigo-500/30' : 'bg-slate-800'}`}>⚖️</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-white">{j.name}
                        {on && <span className="ml-2 rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-black text-white">✓ SELECTED</span>}
                      </span>
                      <span className="block truncate text-xs text-slate-400">{j.email}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">
                        📋 {j.assignments ?? 0} assignments · ✅ {j.scores ?? 0} scored · 🏟 {j.events ?? 0} events
                      </span>
                    </span>
                    <button
                      title={`Remove ${j.name}`}
                      onClick={(e) => { e.stopPropagation(); removeJudge(j.id, j.name) }}
                      className="rounded-lg px-2 py-1 text-slate-500 opacity-0 transition-opacity hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"
                    >✕</button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ADMIN: View as Judge — see exactly what a chosen judge sees */}
      <div className="card p-6">
        <h3 className="mb-1 text-lg font-bold">👁 View as Judge</h3>
        <p className="mb-4 text-sm text-slate-400">
          Pick an event and a judge — you'll see their Judge Bench <b>read-only</b>: their assigned projects,
          round deliverables, rubric and any scores they've entered. Same data, same permissions, zero side-effects.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <select className={inputCls} value={pvEvent} onChange={(e) => setPvEvent(e.target.value)}>
            <option value="">— every event —</option>
            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
          </select>
          <select className={inputCls} value={pvJudge} onChange={(e) => setPvJudge(e.target.value)}>
            <option value="">— pick judge —</option>
            {judges.map((j) => <option key={j.id} value={j.id}>⚖️ {j.name} ({j.email})</option>)}
          </select>
          <button type="button" disabled={!pvJudge}
            onClick={async () => {
              setPvErr(''); setPreview(null)
              try {
                const items = await api.get(`/judging/preview-queue/${pvJudge}`)
                setPreview(pvEvent ? items.filter((i) => String(i.event_id) === pvEvent) : items)
              } catch (e) { setPvErr(e.message) }
            }}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400 disabled:opacity-50">
            👁 Load judge view
          </button>
        </div>
        {pvErr && <p className="mt-2 text-sm font-bold text-rose-400">{pvErr}</p>}
        {preview && (
          <div className="mt-4 space-y-2">
            {preview.length === 0 && <p className="text-sm text-slate-500">No assigned projects for this judge{pvEvent ? ' in that event' : ''}.</p>}
            {preview.map((i) => (
              <div key={i.submission_id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-white">🚀 {i.title} <span className="font-normal text-slate-500">— {i.team_name || 'no team'}</span></p>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${i.scored ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                    {i.scored ? '✅ SCORED' : '🕐 PENDING'}
                  </span>
                </div>
                {i.deliverables?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {i.deliverables.map((d, k) => (
                      <span key={k} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200">
                        <b className="text-indigo-300">{d.round_name}:</b>{' '}
                        {d.link_url
                          ? <a href={d.link_url} target="_blank" rel="noreferrer" className="text-indigo-300 underline decoration-dotted">open artifact ↗</a>
                          : d.file_name ? <a href={`/api/submissions/rounds/files/${d.id}`} className="text-indigo-300 underline decoration-dotted">📎 {d.file_name}</a> : 'saved'}
                        {d.note && <span className="text-slate-500"> — {d.note}</span>}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-400">
                  {i.rubric?.map((c) => (
                    <span key={c.name} className="rounded-full bg-slate-800 px-2 py-0.5">
                      {c.name} {c.weight}%{i.my_breakdown?.[c.name] != null ? ` — ${i.my_breakdown[c.name]}/10` : ''}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* batch assignment */}
      <div className="card p-6">
        <h3 className="mb-1 text-lg font-bold">🎲 Batch assign reviews</h3>
        <p className="mb-4 text-sm text-slate-400">
          Randomly puts N reviewers on every submitted project in an event. Wipes old assignments.{' '}
          {picked.length > 0
            ? <span className="font-bold text-indigo-300">Using only your {picked.length} selected judge{picked.length > 1 ? 's' : ''} — tap the cards above to change.</span>
            : <span>Uses <b>ALL</b> judges — tap judge cards above to restrict the pool.</span>}
        </p>
        <form onSubmit={doAssign} className="space-y-2">
          <SearchBox value={assignQ} onChange={setAssignQ} placeholder={`Search ${events.length} events — find the one to assign…`} />
          <div className="grid gap-3 sm:grid-cols-3">
            <select required className={inputCls} value={assign.event_id} onChange={(e) => setAssign({ ...assign, event_id: e.target.value })}>
              <option value="">— pick event —</option>
              {events
                .filter((e) => [e.title, e.slug].some((v) => String(v || '').toLowerCase().includes(assignQ.trim().toLowerCase())))
                .map((e) => (
                  <option key={e.id} value={e.id}>{e.title}</option>
                ))}
            </select>
          <select className={inputCls} value={assign.per_submission} onChange={(e) => setAssign({ ...assign, per_submission: e.target.value })}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n} reviewer{n === 1 ? '' : 's'} per project</option>
            ))}
          </select>
          <button disabled={!assign.event_id} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
            🎲 Assign batch
          </button>
          </div>
        </form>
      </div>

      {/* leaderboard + export */}
      <div className="card p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold">🏆 Normalized leaderboard</h3>
            <p className="text-sm text-slate-400">
              Z-normalized against each judge's own strictness, weighted by this event's rubric.
            </p>
          </div>
          {boardEvent && (
            <a
              href={`/api/judging/export/${boardEvent}.csv`}
              className="rounded-lg border border-emerald-600/50 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-600/10"
            >
              ⬇️ Results CSV
            </a>
          )}
        </div>

        {/* T2: CSV export at EVERY stage */}
        {boardEvent && (
          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/40 p-3">
            <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-500">
              📦 Export this event — every stage
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                ['registrations', '📝 Registrations'],
                ['submissions', '📦 Submissions'],
                ['scores', '⚖️ Raw scores'],
                ['judges', '🧑‍⚖️ Judge progress'],
                ['votes', '❤️ Votes & comments'],
              ].map(([stage, label]) => (
                <a
                  key={stage}
                  href={`/api/admin/export/${stage}/${boardEvent}.csv`}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800"
                >
                  ⬇ {label}
                </a>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <SearchBox value={boardQ} onChange={setBoardQ} placeholder={`Search ${events.length} events — find the one for the leaderboard…`} />
          <select className={inputCls} value={boardEvent} onChange={(e) => loadBoard(e.target.value)}>
            <option value="">— pick event to view leaderboard —</option>
            {events
              .filter((e) => [e.title, e.slug].some((v) => String(v || '').toLowerCase().includes(boardQ.trim().toLowerCase())))
              .map((e) => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
          </select>
        </div>

        {board && (
          <div className="mt-4 overflow-x-auto">
            {board.length === 0 ? (
              <p className="text-sm text-slate-500">No scored submissions in this event yet.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3">Reviews</th>
                    <th className="px-4 py-3">Raw avg</th>
                    <th className="px-4 py-3">Normalized z</th>
                  </tr>
                </thead>
                <tbody>
                  {board.map((r) => (
                    <tr key={r.submission_id} className="border-b border-slate-800/60">
                      <td className="px-4 py-3 font-black text-amber-300">#{r.rank}</td>
                      <td className="px-4 py-3 font-semibold text-white">{r.title}</td>
                      <td className="px-4 py-3 text-slate-400">{r.team_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{r.reviewers}</td>
                      <td className="px-4 py-3 text-slate-300">{r.avg_raw}</td>
                      <td className={`px-4 py-3 font-bold ${r.avg_normalized >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {r.avg_normalized >= 0 ? '+' : ''}{r.avg_normalized}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [stats, setStats] = useState(null)
  const [statsErr, setStatsErr] = useState('')
  const [events, setEvents] = useState([])
  const [contestants, setContestants] = useState([])
  const [manageEvent, setManageEvent] = useState(null)
  const [eventQ, setEventQ] = useState('')
  const [peopleQ, setPeopleQ] = useState('')
  const [detailUser, setDetailUser] = useState(null)
  const [statView, setStatView] = useState(null) // overview drill-down: participants|admins|events|registrations|teams

  const loadEvents = () => api.get('/admin/events').then(setEvents).catch(() => {})
  const loadStats = () =>
    api
      .get('/admin/stats')
      .then((s) => {
        setStats(s)
        setStatsErr('')
      })
      .catch((er) => setStatsErr(er.message || 'Could not load stats'))

  useEffect(() => {
    loadStats()
    loadEvents()
    api.get('/admin/contestants').then(setContestants).catch(() => {})
  }, [])

  async function deleteEvent(e) {
    if (!window.confirm(`Delete "${e.title}"? All its registrations and teams will also be deleted.`))
      return
    await api.del(`/admin/events/${e.id}`)
    if (manageEvent?.id === e.id) setManageEvent(null)
    loadEvents()
    loadStats()
  }

  const recentLogins = [...contestants]
    .filter((c) => c.last_login)
    .sort((a, b) => new Date(b.last_login) - new Date(a.last_login))
    .slice(0, 5)

  const filteredEvents = useMemo(() => {
    const t = eventQ.trim().toLowerCase()
    if (!t) return events
    return events.filter((e) =>
      [e.title, e.slug, e.mode].filter(Boolean).some((v) => String(v).toLowerCase().includes(t)),
    )
  }, [events, eventQ])

  const filteredPeople = useMemo(() => {
    const t = peopleQ.trim().toLowerCase()
    if (!t) return contestants
    return contestants.filter((c) =>
      [c.name, c.email, ...(c.events || [])].filter(Boolean).some((v) => String(v).toLowerCase().includes(t)),
    )
  }, [contestants, peopleQ])

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">🛡️ Admin Console</h1>
          <p className="mt-1 text-slate-400">
            Full control — create and delete events, manage members, view everyone.
          </p>
        </div>

        <div className="mb-6 flex gap-2 overflow-x-auto">
          {TABS.map(([id, l]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${
                tab === id ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="space-y-8">
            {stats ? (
              <>
                <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  <Stat label="Participants" value={stats.users} active={statView === 'participants'} onClick={() => setStatView(statView === 'participants' ? null : 'participants')} />
                  <Stat label="Admins" value={stats.admins} active={statView === 'admins'} onClick={() => setStatView(statView === 'admins' ? null : 'admins')} />
                  <Stat label="Events" value={stats.events} active={statView === 'events'} onClick={() => setStatView(statView === 'events' ? null : 'events')} />
                  <Stat label="Registrations" value={stats.registrations} active={statView === 'registrations'} onClick={() => setStatView(statView === 'registrations' ? null : 'registrations')} />
                  <Stat label="Teams" value={stats.teams} active={statView === 'teams'} onClick={() => setStatView(statView === 'teams' ? null : 'teams')} />
                </section>
                <p className="-mt-4 text-xs text-slate-500">👆 Click any number — its full list + search bar will open.</p>
                {statView && (
                  <StatDetail
                    kind={statView}
                    onOpenUser={(uid) => setDetailUser(uid)}
                    onOpenEvent={(slug) => navigate(`/event/${slug}`)}
                    onClose={() => setStatView(null)}
                  />
                )}
              </>
            ) : (
              <div className="card p-5 text-sm text-slate-400">
                {statsErr ? `Could not load stats: ${statsErr}. Try logging in again.` : 'Loading stats…'}
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="card p-6">
                <h3 className="mb-4 text-base font-bold">🕒 Recent logins</h3>
                {recentLogins.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No participant logins recorded yet. They'll appear here in real time.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {recentLogins.map((c) => (
                      <li key={c.user_id} className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-2 text-sm">
                        <span className="font-medium text-white">{c.name}</span>
                        <span className="text-slate-400">{fmtDate(c.last_login)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="card p-6">
                <h3 className="mb-4 text-base font-bold">📅 Events at a glance</h3>
                {events.length === 0 ? (
                  <p className="text-sm text-slate-500">No events yet — create one from the Create tab.</p>
                ) : (
                  <ul className="space-y-2">
                    {events.slice(0, 5).map((e) => (
                      <li key={e.id} className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-2 text-sm">
                        <span className="font-medium text-white">{e.title}</span>
                        <span className="text-slate-400">
                          {fmtDay(e.start_date)} · {e.registrations} regs
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        )}

        {tab === 'create' && (
          <EventCreator onCreated={() => { loadEvents(); loadStats() }} />
        )}

        {tab === 'events' && (
          <section className="space-y-6">
            <SearchBox
              value={eventQ}
              onChange={setEventQ}
              placeholder={`Search ${events.length} events — name, slug, mode…`}
            />
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Style</th>
                    <th className="px-4 py-3">Start</th>
                    <th className="px-4 py-3">End</th>
                    <th className="px-4 py-3">Regs</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((e) => (
                    <tr key={e.id} className="border-b border-slate-800/60">
                      <td className="px-4 py-3 font-medium text-white">
                        <button onClick={() => navigate(`/event/${e.slug}`)} className="hover:text-indigo-300">
                          {e.title}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                          {STYLE_OPTIONS.find((s) => s.id === e.display_style)?.previewIcon}{' '}
                          {(e.display_style || 'treasure_map').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{fmtDay(e.start_date)}</td>
                      <td className="px-4 py-3 text-slate-400">{fmtDay(e.end_date)}</td>
                      <td className="px-4 py-3 text-indigo-300">{e.registrations}</td>
                      <td className="space-x-2 whitespace-nowrap px-4 py-3">
                        <button
                          onClick={() => setManageEvent(manageEvent?.id === e.id ? null : e)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${
                            manageEvent?.id === e.id
                              ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                              : 'border-slate-600 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {manageEvent?.id === e.id ? 'Hide' : 'Members'}
                        </button>
                        <button onClick={() => deleteEvent(e)} className="rounded-lg border border-rose-600/50 px-2.5 py-1 text-xs font-bold text-rose-300 hover:bg-rose-600/10">
                          🗑 Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredEvents.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                        No events match "{eventQ}"
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {manageEvent && (
              <div className="card p-6">
                <h3 className="mb-1 text-lg font-bold">👥 Members — {manageEvent.title}</h3>
                <p className="mb-4 text-sm text-slate-400">
                  Every detail each participant entered in the form — email, WhatsApp number,
                  Discord ID, GitHub, LinkedIn and more.
                </p>
                <MembersPanel eventId={manageEvent.id} eventTitle={manageEvent.title} />
              </div>
            )}
          </section>
        )}

        {tab === 'judging' && <JudgingPanel />}

        {tab === 'integrations' && <IntegrationsPanel events={events} />}

        {tab === 'lounge' && <ChatModPanel events={events} />}

        {tab === 'admins' && <AdminsPanel />}

        {tab === 'people' && (
          <section>
            <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <SearchBox
                value={peopleQ}
                onChange={setPeopleQ}
                placeholder={`Search ${contestants.length} contestants — name, email, event…`}
              />
              <p className="text-xs text-slate-500">
                Click a row for the participant's full details (email, WhatsApp, Discord, links…)
              </p>
            </div>
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Last login</th>
                    <th className="px-4 py-3">Events</th>
                    <th className="px-4 py-3">Regs</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPeople.map((c) => (
                    <tr
                      key={c.user_id}
                      onClick={() => setDetailUser(c.user_id)}
                      className="cursor-pointer border-b border-slate-800/60 hover:bg-slate-900/60"
                      title="Click to view full details"
                    >
                      <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                      <td className="px-4 py-3 text-slate-400">{c.email}</td>
                      <td className="px-4 py-3 text-slate-400">{fmtDate(c.last_login)}</td>
                      <td className="px-4 py-3 text-slate-300">{c.events.join(', ') || '—'}</td>
                      <td className="px-4 py-3 text-indigo-300">{c.registrations}</td>
                    </tr>
                  ))}
                  {filteredPeople.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                        No contestants match "{peopleQ}"
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {detailUser && <ContestantDetail userId={detailUser} onClose={() => setDetailUser(null)} />}
    </div>
  )
}
