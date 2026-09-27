import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { Navbar, StatusBadge, GENDER_OPTIONS, StockThumbModal } from '../components/ui'
import EventDisplay, { STYLE_OPTIONS, FULLSCREEN_STYLES } from '../components/eventDisplays'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </label>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500'

const AVATAR_CHOICES = ['⚡', '🚀', '🧠', '🦉', '🐉', '🏴‍☠️', '🤖', '🔥', '🛡️', '🎯', '🌊', '🦊', '🐺', '💎', '🎮', '🛸']

function InvitePanel({ team, eventSlug }) {
  const [mode, setMode] = useState('code') // code | link | email | username
  const [value, setValue] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const link = `${window.location.origin}/event/${eventSlug}?code=${team.invite_code}`

  function doCopy(text) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
    }
    setMsg('✅ Copied — share before they join!')
    setErr('')
  }

  async function invite() {
    setBusy(true); setMsg(''); setErr('')
    try {
      const payload = mode === 'email' ? { email: value.trim() } : { username: value.trim() }
      await api.post(`/teams/${team.id}/invite`, payload)
      setMsg(`✅ ${value.trim()} added directly to the team!`)
      setValue('')
    } catch (er) {
      setErr(er.message)
    } finally {
      setBusy(false)
    }
  }

  const TABS = [
    ['code', '🔑 Code'],
    ['link', '🔗 Link'],
    ['email', '✉️ Email'],
    ['username', '👤 Username'],
  ]

  return (
    <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950 p-3">
      <div className="mb-2 flex gap-1 text-xs">
        {TABS.map(([id, l]) => (
          <button
            key={id}
            type="button"
            onClick={() => { setMode(id); setErr(''); setMsg('') }}
            className={`rounded-lg px-2 py-1 font-bold ${mode === id ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {(mode === 'code' || mode === 'link') && (
        <div>
          <p className="mb-1 text-xs text-slate-400">
            {mode === 'code'
              ? 'Ask them to register and paste this on the event page:'
              : 'Anyone logged in who opens this link gets your code pre-filled:'}
          </p>
          <div className="flex gap-2">
            <code className="flex-1 break-all rounded bg-slate-900 px-2 py-1.5 font-mono text-xs text-indigo-300">
              {mode === 'code' ? team.invite_code : link}
            </code>
            <button
              type="button"
              onClick={() => doCopy(mode === 'code' ? team.invite_code : link)}
              className="rounded-lg bg-slate-800 px-3 text-xs font-bold text-white hover:bg-slate-700"
            >
              Copy
            </button>
          </div>
          {msg && <p className="mt-1 text-xs font-bold text-emerald-400">{msg}</p>}
        </div>
      )}

      {(mode === 'email' || mode === 'username') && (
        <form onSubmit={(e) => { e.preventDefault(); invite() }} className="space-y-2">
          <p className="text-xs text-slate-400">
            {mode === 'email'
              ? 'Their platform email — added instantly, no code needed:'
              : 'Their name/username — added instantly, no code needed:'}
          </p>
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
            placeholder={mode === 'email' ? 'teammate@example.com' : 'e.g. Alice Sharma'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {msg && <p className="text-xs font-bold text-emerald-400">{msg}</p>}
          {err && <p className="text-xs font-bold text-rose-400">{err}</p>}
          <button type="submit" disabled={busy || !value.trim()} className="w-full rounded-lg bg-indigo-500 py-1.5 text-sm font-bold text-white hover:bg-indigo-400 disabled:opacity-50">
            {busy ? 'Adding…' : '➕ Invite directly'}
          </button>
        </form>
      )}
    </div>
  )
}

const FILE_TYPE_OPTIONS = [
  { id: 'ppt', label: 'PPT deck', icon: '📊', accept: '.ppt,.pptx' },
  { id: 'pdf', label: 'PDF', icon: '📄', accept: '.pdf' },
  { id: 'mp4', label: 'MP4 video', icon: '🎬', accept: '.mp4' },
  { id: 'zip', label: 'ZIP archive', icon: '🗜️', accept: '.zip' },
  { id: 'image', label: 'Image', icon: '🖼️', accept: '.png,.jpg,.jpeg' },
  { id: 'ipynb', label: 'Notebook', icon: '📓', accept: '.ipynb' },
  { id: 'other', label: 'Other', icon: '📎', accept: '*' },
]
const FILE_TYPE_ICON = Object.fromEntries(FILE_TYPE_OPTIONS.map((f) => [f.id, f.icon]))

function SubmitPanel({ event, teamId, teamName }) {
  const [sub, setSub] = useState(null)
  const [locked, setLocked] = useState(false)
  const [title, setTitle] = useState('')
  const [repo, setRepo] = useState('')
  const [file, setFile] = useState(null)
  const [fileType, setFileType] = useState('ppt')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = () =>
    api.get(`/submissions/mine/${event.id}`).then((r) => {
      setLocked(!!r.locked)
      if (r.submission) {
        setSub(r.submission)
        setTitle((t) => t || r.submission.title || '')
        setRepo((v) => v || r.submission.repo_url || '')
      }
    }).catch(() => {})

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])

  async function ensureSubmission() {
    if (sub) return sub
    const created = await api.post(`/submissions?event_id=${event.id}`, {
      title: title.trim() || `${teamName || 'Team'} — Round 1`,
      repo_url: repo.trim() || null,
      extra_links: [],
    })
    setSub(created)
    return created
  }

  async function doUpload() {
    if (!file) { setErr('Pick a file from your desktop first'); return }
    setErr(''); setMsg(''); setBusy(true)
    try {
      const s = await ensureSubmission()
      const fd = new FormData()
      fd.append('file', file)
      fd.append('file_type', fileType)
      const token = localStorage.getItem('hp_token')
      const url = `/api/submissions/${s.id}/file${token ? `?hp_token=${encodeURIComponent(token)}` : ''}`
      const res = await fetch(url, {
        method: 'POST',
        body: fd,
        credentials: 'same-origin',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Upload failed')
      setSub(data)
      setFile(null)
      setMsg('✅ File uploaded!')
    } catch (er) {
      setErr(er.message)
    } finally {
      setBusy(false)
    }
  }

  async function doSubmit() {
    setErr(''); setMsg(''); setBusy(true)
    try {
      const s = await ensureSubmission()
      // persist the repo link the leader typed before locking the submission
      if (repo.trim() && repo.trim() !== (s.repo_url || '')) {
        await api.put(`/submissions/${s.id}`, { repo_url: repo.trim() })
      }
      const final = await api.post(`/submissions/${s.id}/submit`)
      setSub(final)
      setMsg('🚀 Submitted! Judges get it now.')
    } catch (er) {
      setErr(er.message)
    } finally {
      setBusy(false)
    }
  }

  const t = FILE_TYPE_OPTIONS.find((o) => o.id === fileType)
  const submitted = sub?.status === 'submitted'
  // creator decides if a project GitHub repo link is asked for (shown in the gallery)
  const asksRepo = (event.form_fields?.project_repo ?? true) !== false

  return (
    <div className="mt-4 rounded-lg border border-emerald-600/30 bg-emerald-500/5 p-3">
      <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-emerald-300">
        📦 Submit — your team's deliverable
      </p>

      {locked ? (
        <p className="text-xs font-bold text-rose-300">🔒 Round window has ended — uploads locked.</p>
      ) : submitted ? (
        <div>
          <p className="text-sm font-bold text-emerald-300">✅ Submitted: {sub.title}</p>
          {sub.repo_url && (
            <a href={sub.repo_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs font-bold text-indigo-300 hover:underline">
              🐱 {sub.repo_url}
            </a>
          )}
          {sub.file_name && (
            <p className="mt-1 text-xs text-slate-400">
              {FILE_TYPE_ICON[sub.file_type] || '📎'} {sub.file_name} ({sub.file_type?.toUpperCase()})
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500">Submitted at {new Date(sub.submitted_at).toLocaleString()}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            placeholder={`Deliverable title (e.g. ${teamName || 'Team'} — Round 1)`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          {/* project's GitHub repo — only when the event creator asked for it */}
          {asksRepo && (
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              placeholder="🐱 Project GitHub repo link (https://github.com/team/project)"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
            />
          )}

          {/* browse from desktop */}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-slate-700 bg-slate-950 px-3 py-2.5 text-sm hover:border-emerald-500">
            <span className="text-lg">{t?.icon || '📎'}</span>
            <span className="flex-1 truncate text-slate-300">
              {file ? file.name : 'Browse file from desktop…'}
            </span>
            <span className="text-xs font-bold text-emerald-300">Browse</span>
            <input
              type="file"
              className="hidden"
              accept={t?.accept === '*' ? undefined : t?.accept}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>

          {/* file type — define it under the submit area as requested */}
          <div>
            <p className="mb-1 text-[11px] font-bold text-slate-400">File type (mp4 / ppt / pdf / etc.):</p>
            <div className="grid grid-cols-4 gap-1.5">
              {FILE_TYPE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setFileType(o.id)}
                  title={o.label}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[10px] font-bold transition ${
                    fileType === o.id
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <span className="text-base">{o.icon}</span>
                  {o.id.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {sub?.file_name && !file && (
            <p className="text-xs text-emerald-300">
              ✔ Already uploaded: {FILE_TYPE_ICON[sub.file_type] || '📎'} {sub.file_name} — pick a new file to replace it
            </p>
          )}
          {msg && <p className="text-xs font-bold text-emerald-400">{msg}</p>}
          {err && <p className="text-xs font-bold text-rose-400">{err}</p>}

          <div className="flex gap-2">
            <button
              onClick={doUpload}
              disabled={busy || !file}
              className="flex-1 rounded-lg border border-emerald-600/60 py-1.5 text-sm font-bold text-emerald-300 hover:bg-emerald-600/10 disabled:opacity-50"
            >
              {busy ? 'Uploading…' : '⬆️ Upload draft'}
            </button>
            <button
              onClick={doSubmit}
              disabled={busy}
              title={asksRepo
                ? 'Final submit — pushed to judges & gallery; needs a title plus repo link or an uploaded file'
                : 'Final submit — pushed to judges & gallery; just a title is enough'}
              className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? 'Wait…' : '🚀 Submit final'}
            </button>
          </div>
          <p className="text-[10px] leading-snug text-slate-500">
            Submit final = sends to judges + public gallery (then read-only). Save/upload any time before the deadline.
            {asksRepo && ' 🐱 Repo link — shown right under the project in the gallery.'}
          </p>
        </div>
      )}
    </div>
  )
}

function PublicLeaderboard({ eventId }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    api.get(`/submissions/leaderboard-public/${eventId}`).then(setRows).catch(() => setRows([]))
  }, [eventId])

  if (!rows || rows.length === 0) return (
    <div className="card p-5">
      <h3 className="text-sm font-bold text-white">🏆 Current Leaderboard</h3>
      <p className="mt-1 text-xs text-slate-500">No scored projects yet — appears as judges score.</p>
    </div>
  )
  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-bold text-white">🏆 Current Leaderboard</h3>
      <ol className="space-y-2">
        {rows.slice(0, 5).map((r) => (
          <li key={r.submission_id} className="flex items-center gap-2 rounded-lg bg-slate-950/60 px-3 py-2 text-sm">
            <span className="w-6 text-center font-black text-amber-300">#{r.rank}</span>
            <span className="text-xl">{r.team_avatar || '⚡'}</span>
            <span className="flex-1 truncate font-semibold text-white">{r.team_name}</span>
            <span className="text-xs text-slate-500">{r.title}</span>
            <span className="font-black text-emerald-300">{r.pts} pts</span>
          </li>
        ))}
      </ol>
      {rows.length > 5 && <p className="mt-2 text-xs text-slate-500">+ {rows.length - 5} more in the gallery</p>}
    </div>
  )
}

function TeamPanel({ team, isLeader, onSaved }) {
  const [name, setName] = useState(team.name)
  const [tagline, setTagline] = useState(team.tagline || '')
  const [avatar, setAvatar] = useState(team.avatar_url || '⚡')
  const [isOpen, setIsOpen] = useState(!!team.is_open)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  // team cover thumbnail (leader picks while creating/editing profile)
  const [thumb, setThumb] = useState(!!team.has_thumbnail)
  const [thumbBusy, setThumbBusy] = useState(false)
  const [showStock, setShowStock] = useState(false)

  async function save(e) {
    e.preventDefault()
    setBusy(true); setMsg(''); setErr('')
    try {
      const updated = await api.patch(`/teams/${team.id}`, {
        name, tagline, avatar_url: avatar, is_open: isOpen,
      })
      onSaved(updated)
      setMsg('✅ Team updated')
    } catch (er) {
      setErr(er.message)
    } finally {
      setBusy(false)
    }
  }

  if (!isLeader) return null

  return (
    <form onSubmit={save} className="mt-4 rounded-lg border border-amber-600/30 bg-amber-500/5 p-3">
      <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-amber-300">
        👑 Leader controls
      </p>
      {msg && <p className="mb-1 text-xs font-bold text-emerald-400">{msg}</p>}
      {err && <p className="mb-1 text-xs font-bold text-rose-400">{err}</p>}
      <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" />
      <input className={`${inputCls} mt-2`} value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Tagline (optional)" maxLength={80} />
      <div className="mt-2">
        <p className="mb-1 text-xs text-slate-400">Team badge — your banner in the Team Hub</p>
        <div className="flex flex-wrap gap-1.5">
          {AVATAR_CHOICES.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvatar(a)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border text-lg ${
                avatar === a ? 'border-amber-400 bg-amber-400/20' : 'border-slate-700 bg-slate-900 hover:border-slate-500'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
      {/* team cover thumbnail — set it right here while creating/editing profile */}
      <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 p-2">
        <p className="mb-1.5 text-xs text-slate-400">🖼️ Team cover (thumbnail)</p>
        {thumb && (
          <img src={`/api/teams/${team.id}/thumbnail?t=${Date.now()}`} alt="team cover" className="mb-2 h-20 w-full rounded-lg border border-slate-700 object-cover" />
        )}
        <div className="flex gap-2">
          <label className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-indigo-500/50 px-2 py-1.5 text-[11px] font-bold text-indigo-300 hover:bg-indigo-500/10 ${thumbBusy ? 'opacity-50' : ''}`}>
            {thumbBusy ? '…' : '⬆ Upload'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={thumbBusy}
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setThumbBusy(true); setErr(''); setMsg('')
                try {
                  const fd = new FormData()
                  fd.append('file', f)
                  const updated = await api.upload(`/teams/${team.id}/thumbnail`, fd)
                  onSaved(updated)
                  setThumb(true)
                  setMsg('✅ Team cover updated')
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
            onClick={() => setShowStock(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-fuchsia-500/50 px-2 py-1.5 text-[11px] font-bold text-fuchsia-300 hover:bg-fuchsia-500/10"
          >
            🎨 Browse stock
          </button>
        </div>
      </div>

      <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} className="h-4 w-4 accent-amber-500" />
        List as open for anyone to join (Team Hub)
      </label>
      <button type="submit" disabled={busy} className="mt-2 w-full rounded-lg bg-amber-500 py-1.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
        {busy ? 'Saving…' : 'Save team profile'}
      </button>

      {showStock && (
        <StockThumbModal
          busy={thumbBusy}
          onClose={() => setShowStock(false)}
          onPick={async (file) => {
            setThumbBusy(true); setErr(''); setMsg('')
            try {
              const updated = await api.post(`/teams/${team.id}/thumbnail/stock`, { file })
              onSaved(updated)
              setThumb(true)
              setMsg('✅ Stock cover set!')
              setShowStock(false)
            } catch (er2) {
              setErr(er2.message)
            } finally {
              setThumbBusy(false)
            }
          }}
        />
      )}
    </form>
  )
}

export default function EventDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [event, setEvent] = useState(null)
  const [reg, setReg] = useState(null) // my registration for this event
  const [members, setMembers] = useState([])
  const [team, setTeam] = useState(null) // my team object (for leader controls)
  const [form, setForm] = useState({
    name: user?.name || '',
    age: '',
    gender: '',
    institution: '',
    college_year: '',
    email: user?.email || '',
    phone: '',
    whatsapp_invite: '',
    discord_invite: '',
    github_url: '',
    linkedin_url: '',
    skills: '',
    portfolio_url: '',
  })
  const [teamMode, setTeamMode] = useState('create') // create | join
  const [teamName, setTeamName] = useState('')
  const [inviteCode, setInviteCode] = useState(() => searchParams.get('code') || '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // prefill invite link (?code=XYZ) → switch to join mode
  useEffect(() => {
    if (searchParams.get('code')) {
      setTeamMode('join')
      setInviteCode(searchParams.get('code'))
    }
  }, [searchParams])

  useEffect(() => {
    api
      .get(`/events/${slug}`)
      .then((ev) => {
        setEvent(ev)
        if (user) {
          api
            .get('/registrations/mine')
            .then((regs) => {
              const mine = regs.find((r) => r.event_id === ev.id)
              if (mine) {
                setReg(mine)
                if (mine.team_id) loadMembers(mine.team_id, ev.id)
              }
            })
            .catch(() => {})
        }
      })
      .catch(() => setEvent(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, user])

  function loadMembers(teamId, eventId) {
    api
      .get(`/teams/${teamId}/members`)
      .then(setMembers)
      .catch(() => setMembers([]))
    api
      .get(`/teams/event/${eventId}`)
      .then((teams) => setTeam(teams.find((t) => t.id === teamId) || null))
      .catch(() => {})
  }

  async function submit(e) {
    e.preventDefault()
    if (!event) return
    const ff2 = event.form_fields || {}
    if ((ff2.gender ?? true) && !form.gender) {
      setErr('Please pick a gender (male 👦, female 👧, or "rather not say" 🤫)')
      return
    }
    setErr('')
    setBusy(true)
    try {
      const payload = {
        event_id: event.id,
        name: form.name,
        age: form.age ? Number(form.age) : null,
        gender: form.gender || null,
        institution: form.institution,
        college_year: form.college_year,
        email: form.email,
        phone: form.phone,
        whatsapp_invite: form.whatsapp_invite,
        discord_invite: form.discord_invite,
        github_url: form.github_url,
        linkedin_url: form.linkedin_url,
        skills: form.skills,
        portfolio_url: form.portfolio_url,
      }

      if (teamMode === 'create') {
        const teamPayload = { ...payload, team_name: teamName || `${form.name}'s Team` }
        const created = await api.post('/registrations', teamPayload)
        setReg(created)
        if (created.team_id) loadMembers(created.team_id, event.id)
      } else {
        const created = await api.post('/registrations', { ...payload, invite_code: inviteCode })
        setReg(created)
        if (created.team_id) loadMembers(created.team_id, event.id)
      }
    } catch (er) {
      setErr(er.message)
    } finally {
      setBusy(false)
    }
  }

  if (event === false) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-2xl font-bold">Event not found</h1>
          <button onClick={() => navigate('/')} className="mt-4 text-indigo-300 hover:underline">
            Back to events
          </button>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <p className="p-10 text-slate-400">Loading event…</p>
      </div>
    )
  }

  const regClosed =
    event.registration_deadline && new Date(event.registration_deadline) < new Date()

  // which registration fields this event asks for (set by the event creator)
  const ff = event.form_fields || {}
  const asks = (k) => ff[k] !== false

  const styleMeta = STYLE_OPTIONS.find((s) => s.id === event.display_style)
  const isFullscreenMap = FULLSCREEN_STYLES.has(event.display_style || 'treasure_map')

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="card overflow-hidden">
          <div className="h-2 w-full" style={{ background: event.cover }} />
          <div className="p-6">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={event.status} />
              <span className="text-sm text-slate-400">{event.mode}</span>
              {event.location && <span className="text-sm text-slate-400">· {event.location}</span>}
              {styleMeta && (
                <span className="ml-auto rounded-full border border-slate-700 px-2.5 py-0.5 text-[11px] font-bold text-slate-400">
                  {styleMeta.name}
                </span>
              )}
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white">
              {event.title}
            </h1>
            {event.tagline && <p className="mt-1 font-medium text-slate-400">{event.tagline}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {event.prize_pool && (
                <span className="inline-block rounded-lg bg-amber-500/10 px-3 py-1 text-sm font-bold text-amber-300">
                  💰 Prize pool: {event.prize_pool}
                </span>
              )}
              <button
                onClick={() => navigate(`/event/${slug}/teams`)}
                className="rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-3 py-1 text-sm font-bold text-indigo-300 hover:bg-indigo-500/20"
              >
                🤝 Browse teams in Team Hub →
              </button>
              <button
                onClick={() => navigate(`/event/${slug}/gallery`)}
                className="rounded-lg border border-purple-500/50 bg-purple-500/10 px-3 py-1 text-sm font-bold text-purple-300 hover:bg-purple-500/20"
              >
                🖼️ Project gallery →
              </button>
              {reg && (
                <button
                  onClick={() => navigate(`/event/${slug}/submit`)}
                  className="rounded-lg border border-emerald-600/50 bg-emerald-600/10 px-3 py-1 text-sm font-bold text-emerald-300 hover:bg-emerald-600/20"
                >
                  📦 My submission →
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Full-screen map styles break out of the page width */}
        {isFullscreenMap && (
          <div className="relative left-1/2 mt-6 w-screen -translate-x-1/2">
            <EventDisplay event={event} />
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Left: briefing (+ map for non-fullscreen styles) */}
          <div className="space-y-6 lg:col-span-2">
            <div className="card p-6">
              <h2 className="mb-3 text-lg font-bold">📜 Briefing — about this event</h2>
              <p className="text-sm leading-relaxed text-slate-300">{event.description}</p>
            </div>

            {/* current standings — team profile + name + pts, visible the moment the event opens */}
            <PublicLeaderboard eventId={event.id} />

            {event.about && (
              <div className="card p-6">
                <h2 className="mb-3 text-lg font-bold">📖 About the hackathon</h2>
                <div className="space-y-3 text-sm leading-relaxed text-slate-300">
                  {String(event.about).split('\n').filter(Boolean).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </div>
            )}

            {event.rounds && event.rounds.length > 0 && (
              <div className="card p-6">
                <h2 className="mb-1 text-lg font-bold">🎬 Rounds — how this hackathon unfolds</h2>
                <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {event.rounds.length} round{event.rounds.length === 1 ? '' : 's'} total
                </p>
                <ol className="space-y-3">
                  {event.rounds.map((r, i) => (
                    <li key={i} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base font-black text-white"
                        style={{ background: event.cover }}
                      >
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-bold text-white">{r.name}</p>
                        {r.description && <p className="mt-0.5 text-sm text-slate-400">{r.description}</p>}
                        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                          {r.deliverable_kind && r.deliverable_kind !== 'any' && (
                            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">
                              {r.deliverable_kind === 'link' ? '🔗 Link only' : '📎 File upload only'}
                            </span>
                          )}
                          {r.accept && <span className="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">🗂 {r.accept}</span>}
                          {r.deadline && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">
                              ⏰ due {new Date(r.deadline.endsWith('Z') ? r.deadline : r.deadline + 'Z').toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              {event.rules && event.rules.length > 0 && (
                <div className="card p-6">
                  <h2 className="mb-3 text-lg font-bold">📏 Rules & regulations</h2>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {event.rules.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-indigo-400">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {event.judging_criteria && event.judging_criteria.length > 0 && (
                <div className="card p-6">
                  <h2 className="mb-3 text-lg font-bold">⚖️ What judges look for</h2>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {event.judging_criteria.map((c, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-amber-400">★</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {(event.eligibility || event.contact_email || event.whatsapp_group || event.discord_group) && (
              <div className="card p-6">
                <h2 className="mb-3 text-lg font-bold">📞 Organizer & community</h2>
                <div className="space-y-3 text-sm">
                  {event.eligibility && (
                    <p className="flex gap-2 text-slate-300">
                      <span>🎫</span>
                      <span><span className="font-semibold text-white">Eligibility:</span> {event.eligibility}</span>
                    </p>
                  )}
                  {event.contact_email && (
                    <p className="flex gap-2 text-slate-300">
                      <span>✉️</span>
                      <span>
                        <span className="font-semibold text-white">Questions?</span>{' '}
                        Mail the organizer at{' '}
                        <a href={`mailto:${event.contact_email}`} className="font-bold text-indigo-300 hover:underline">
                          {event.contact_email}
                        </a>
                      </span>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {event.whatsapp_group && (
                      <a
                        href={event.whatsapp_group}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 font-bold text-emerald-300 hover:bg-emerald-500/20"
                      >
                        💬 Join the WhatsApp group
                      </a>
                    )}
                    {event.discord_group && (
                      <a
                        href={event.discord_group}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-4 py-2 font-bold text-indigo-300 hover:bg-indigo-500/20"
                      >
                        🎮 Join the Discord server
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!isFullscreenMap && <EventDisplay event={event} />}
          </div>

          {/* Right: registration / own team */}
          <div>
            {!user ? (
              <div className="card p-6 text-center">
                <p className="text-lg font-bold">🔒 Members only</p>
                <p className="mt-1 text-sm text-slate-400">
                  Log in to register, form a team and explore this event.
                </p>
                <button
                  onClick={() => navigate('/', { state: { scrollTo: 'login' } })}
                  className="mt-4 w-full rounded-lg bg-indigo-500 py-2 font-medium text-white hover:bg-indigo-400"
                >
                  Go to login
                </button>
              </div>
            ) : reg ? (
              <div className="card p-6">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-sm text-emerald-300">
                  ✓ You're registered
                </div>

                {(event.whatsapp_group || event.discord_group) && (
                  <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <p className="text-xs font-bold text-emerald-300">
                      🚀 One last step — join the event community so you don't miss a beat:
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {event.whatsapp_group && (
                        <a
                          href={event.whatsapp_group}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 py-1.5 text-sm font-bold text-white hover:bg-emerald-400"
                        >
                          💬 Join WhatsApp group
                        </a>
                      )}
                      {event.discord_group && (
                        <a
                          href={event.discord_group}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-2 rounded-lg bg-[#5865F2] py-1.5 text-sm font-bold text-white hover:bg-[#4752C4]"
                        >
                          🎮 Join Discord server
                        </a>
                      )}
                    </div>
                  </div>
                )}

                <h3 className="text-lg font-semibold">Your team</h3>
                {reg.team_code ? (
                  <>
                    <p className="mt-2 text-sm text-slate-400">Invite teammates — any way you like:</p>
                    <InvitePanel
                      team={team || { id: reg.team_id, invite_code: reg.team_code }}
                      eventSlug={event.slug}
                    />
                  </>
                ) : (
                  <div className="mt-2 rounded-lg border border-slate-700 bg-slate-950 p-3">
                    <p className="text-sm text-slate-300">You haven't joined a team yet.</p>
                    <button
                      onClick={() => navigate(`/event/${slug}/teams`)}
                      className="mt-2 w-full rounded-lg bg-indigo-500 py-1.5 text-sm font-bold text-white hover:bg-indigo-400"
                    >
                      🤝 Find a team with open slots
                    </button>
                  </div>
                )}

                {members.length > 0 && (
                  <div className="mt-4">
                    {team?.has_thumbnail && (
                      <img
                        src={`/api/teams/${team.id}/thumbnail`}
                        alt={`${team.name} cover`}
                        className="mb-3 h-28 w-full rounded-xl border border-slate-700 object-cover"
                      />
                    )}
                    <h4 className="mb-1 text-sm font-semibold text-slate-300">
                      {team ? (
                        <span className="flex items-center gap-2">
                          <span className="text-xl">{team.avatar_url || '⚡'}</span>
                          {team.name}
                        </span>
                      ) : 'Team members'}
                    </h4>
                    <ul className="mt-2 space-y-1 text-sm text-slate-400">
                      {members.map((m, i) => (
                        <li key={i} className="flex justify-between">
                          <span>
                            {i === 0 && '👑 '}
                            {m.name}
                          </span>
                          <span className="text-slate-500">{m.institution}</span>
                        </li>
                      ))}
                    </ul>
                    {team && (
                      <TeamPanel
                        team={team}
                        isLeader={team.created_by === user?.id}
                        onSaved={setTeam}
                      />
                    )}
                  </div>
                )}

                {/* Submit — right here where your team + members are shown */}
                {reg.team_id && (
                  <SubmitPanel
                    event={event}
                    teamId={reg.team_id}
                    teamName={team?.name || ''}
                  />
                )}
              </div>
            ) : regClosed ? (
              <div className="card p-6 text-center text-rose-300">
                Registration for this event is closed.
              </div>
            ) : (
              <form onSubmit={submit} className="card space-y-3 p-6">
                <h3 className="text-lg font-semibold">Event registration</h3>
                {err && <p className="text-sm text-rose-400">{err}</p>}

                {asks('name') && (
                  <Field label="Full name *">
                    <input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </Field>
                )}
                {(asks('age') || asks('college_year')) && (
                  <div className="grid grid-cols-2 gap-3">
                    {asks('age') && (
                      <Field label="Age">
                        <input type="number" className={inputCls} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
                      </Field>
                    )}
                    {asks('college_year') && (
                      <Field label="College year">
                        <input className={inputCls} placeholder="e.g. 2nd Year" value={form.college_year} onChange={(e) => setForm({ ...form, college_year: e.target.value })} />
                      </Field>
                    )}
                  </div>
                )}
                {asks('gender') && (
                  <div>
                    <span className="mb-1 block text-xs font-medium text-slate-400">Gender *</span>
                    <div className="grid grid-cols-3 gap-2">
                      {GENDER_OPTIONS.map((g) => (
                        <button
                          key={g.value}
                          type="button"
                          onClick={() => setForm({ ...form, gender: g.value })}
                          className={`flex flex-col items-center gap-1 rounded-xl border-2 py-2.5 transition ${
                            form.gender === g.value
                              ? 'border-indigo-500 bg-indigo-500/15'
                              : 'border-slate-700 hover:border-slate-500'
                          }`}
                        >
                          <span className="text-2xl">{g.icon}</span>
                          <span className="text-[11px] font-semibold text-slate-300">{g.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {asks('institution') && (
                  <Field label="Institution / College *">
                    <input required className={inputCls} value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} />
                  </Field>
                )}
                {asks('email') && (
                  <Field label="Email *">
                    <input required type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </Field>
                )}
                {asks('phone') && (
                  <Field label="Phone number">
                    <input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </Field>
                )}
                {asks('whatsapp_invite') && (
                  <Field label="WhatsApp number *">
                    <input required className={inputCls} placeholder="+91 90000 00000" value={form.whatsapp_invite} onChange={(e) => setForm({ ...form, whatsapp_invite: e.target.value })} />
                  </Field>
                )}
                {asks('discord_invite') && (
                  <Field label="Discord ID *">
                    <input required className={inputCls} placeholder="username#0000" value={form.discord_invite} onChange={(e) => setForm({ ...form, discord_invite: e.target.value })} />
                  </Field>
                )}
                {asks('github_url') && (
                  <Field label="GitHub profile">
                    <input className={inputCls} placeholder="https://github.com/username" value={form.github_url} onChange={(e) => setForm({ ...form, github_url: e.target.value })} />
                  </Field>
                )}
                {asks('linkedin_url') && (
                  <Field label="LinkedIn profile">
                    <input className={inputCls} placeholder="https://linkedin.com/in/username" value={form.linkedin_url} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} />
                  </Field>
                )}
                {asks('skills') && (
                  <Field label="Skills">
                    <input className={inputCls} placeholder="e.g. Python, React, ML" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} />
                  </Field>
                )}
                {asks('portfolio_url') && (
                  <Field label="Portfolio / website">
                    <input className={inputCls} placeholder="https://mysite.dev" value={form.portfolio_url} onChange={(e) => setForm({ ...form, portfolio_url: e.target.value })} />
                  </Field>
                )}

                <div className="rounded-lg border border-slate-800 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Team</p>
                  <div className="mb-2 flex gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => setTeamMode('create')}
                      className={`flex-1 rounded-lg px-3 py-1.5 ${teamMode === 'create' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'}`}
                    >
                      Create team
                    </button>
                    <button
                      type="button"
                      onClick={() => setTeamMode('join')}
                      className={`flex-1 rounded-lg px-3 py-1.5 ${teamMode === 'join' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'}`}
                    >
                      Join with code
                    </button>
                  </div>
                  {teamMode === 'create' ? (
                    <input className={inputCls} placeholder="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
                  ) : (
                    <>
                      <input className={inputCls} placeholder="Paste invite code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} />
                      <p className="mt-1.5 text-xs text-slate-500">
                        No code? You can also browse teams with open slots later from the{' '}
                        <span className="font-semibold text-indigo-300">Team Hub</span>.
                      </p>
                    </>
                  )}
                </div>

                <button type="submit" disabled={busy} className="w-full rounded-lg bg-indigo-500 py-2 font-medium text-white hover:bg-indigo-400 disabled:opacity-50">
                  {busy ? 'Submitting…' : teamMode === 'create' ? 'Register & create team' : 'Register & join team'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
