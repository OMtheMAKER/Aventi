import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import { Navbar } from '../components/ui'
import VotingPanel, { useVoting } from '../components/voting'
import { useAuth } from '../auth'

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 pl-9 text-sm outline-none focus:border-indigo-500'

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
      <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-xs text-slate-500 hover:text-white">✕</button>
      )}
    </div>
  )
}

function CommentBlock({ submissionId, me, user }) {
  const [list, setList] = useState(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api.get(`/votes/${submissionId}/comments`).then(setList).catch(() => setList([]))
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId])

  async function del(id) {
    if (!confirm('Remove this comment?')) return
    try {
      await api.del(`/votes/comments/${id}`)
      load()
    } catch (er) {
      alert(er.message)
    }
  }

  async function post(e) {
    e.preventDefault()
    if (!me) return
    setBusy(true)
    try {
      await api.post(`/votes/${submissionId}/comments`, { body: draft })
      setDraft('')
      load()
    } catch (er) {
      alert(er.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-slate-500">
        💬 Comments {list?.length ? `(${list.length})` : ''}
      </p>
      <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
        {list === null ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-xs text-slate-500">No comments yet — be the first!</p>
        ) : (
          list.map((c) => {
            const canDel = me && user && (c.user_id === user.id || user.role === 'admin')
            return (
              <div key={c.id} className="group flex items-start justify-between gap-2 rounded-lg bg-slate-950/70 px-3 py-1.5 text-xs">
                <p className={c.removed ? 'italic text-slate-500' : ''}>
                  <span className="font-bold text-indigo-300">{c.user_name}: </span>
                  <span className="text-slate-200">{c.body}</span>
                </p>
                {canDel && !c.removed && (
                  <button
                    onClick={() => del(c.id)}
                    className="invisible rounded px-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300 group-hover:visible"
                    title={user.role === 'admin' && c.user_id !== user.id ? 'Organizer moderation' : 'Delete'}
                  >
                    🗑
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>
      {me ? (
        <form onSubmit={post} className="mt-2 flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs outline-none focus:border-indigo-500"
            placeholder="Encouragement, a question, feedback…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? '…' : 'Post'}
          </button>
        </form>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">Log in to comment.</p>
      )}
    </div>
  )
}

function ImagesModal({ card, onClose }) {
  const [idx, setIdx] = useState(0)
  const n = card.image_count || 0
  if (!n) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <p className="text-sm font-bold text-white">
            📸 {card.title} — screenshot {idx + 1}/{n}
          </p>
          <button onClick={onClose} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800">✕</button>
        </div>
        <div className="flex items-center justify-center bg-slate-950 p-2">
          <img
            src={`/api/submissions/${card.id}/images/${idx}`}
            alt={`screenshot ${idx + 1}`}
            className="max-h-[65vh] rounded-lg object-contain"
          />
        </div>
        {n > 1 && (
          <div className="flex items-center justify-center gap-2 border-t border-slate-800 p-3">
            <button
              onClick={() => setIdx((idx - 1 + n) % n)}
              className="rounded-lg border border-slate-700 px-4 py-1.5 text-sm font-bold text-slate-200 hover:bg-slate-800"
            >
              ◀ Prev
            </button>
            <button
              onClick={() => setIdx((idx + 1) % n)}
              className="rounded-lg border border-slate-700 px-4 py-1.5 text-sm font-bold text-slate-200 hover:bg-slate-800"
            >
              Next ▶
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ProjectCard({ card, me, user, v, onRefresh }) {
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [showImages, setShowImages] = useState(false)
  const [err, setErr] = useState('')

  const config = v?.config
  const myN = v?.myAlloc?.[card.id] || 0
  const canVote = config && config.voting_open &&
    (config.vote_access === 'open' || (config.vote_access === 'authenticated' ? !!me : !!v.emailToken))

  // simple: toggle pick (server enforces max_picks + dup). quadratic: ±1 unit.
  async function act(fn) {
    setErr(''); setBusy(true)
    try {
      await fn()
      onRefresh()
    } catch (er) {
      setErr(er.message)
    } finally {
      setBusy(false)
    }
  }
  const plus = () => act(() => v.vote(card.id, myN + 1))
  const minus = () => act(() => v.vote(card.id, myN - 1))
  const toggleSimple = () => act(() => v.vote(card.id, myN ? 0 : 1))

  return (
    <div className="card overflow-hidden">
      {/* T1: uploaded thumbnail as card cover (fallback = gradient) */}
      {card.has_thumbnail ? (
        <div className="relative h-40 w-full">
          <img
            src={`/api/submissions/${card.id}/thumbnail`}
            alt={card.title}
            className="h-40 w-full object-cover"
          />
          <span className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-2.5 py-1 text-[11px] font-bold text-indigo-200">
            {card.team_name}
          </span>
          {card.track && (
            <span className="absolute right-3 top-3 rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-black text-slate-950">
              🏷 {card.track}
            </span>
          )}
        </div>
      ) : (
        <div className="h-16 w-full bg-gradient-to-br from-indigo-500/40 to-purple-600/30 p-3">
          <span className="rounded-full bg-slate-950/70 px-2.5 py-1 text-[11px] font-bold text-indigo-200">
            {card.team_name}
          </span>
          {card.track && (
            <span className="float-right rounded-full bg-amber-500/90 px-2.5 py-1 text-[11px] font-black text-slate-950">
              🏷 {card.track}
            </span>
          )}
        </div>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-extrabold text-white">{card.title}</h3>
            {card.tagline && <p className="text-sm italic text-slate-400">{card.tagline}</p>}
          </div>
          {card.team_avatar && <span className="text-2xl">{card.team_avatar}</span>}
        </div>

        {card.description && (
          <p className={`mt-2 text-sm text-slate-300 ${showAll ? '' : 'line-clamp-2'}`}>
            {card.description}
          </p>
        )}
        {card.description && (
          <button onClick={() => setShowAll(!showAll)} className="mt-1 text-xs font-bold text-indigo-300 hover:underline">
            {showAll ? '▲ less' : '▼ more'}
          </button>
        )}

        {card.tech_stack && (
          <p className="mt-2 text-xs text-slate-500">🛠 {card.tech_stack}</p>
        )}
        {card.members?.length > 0 && (
          <p className="mt-1 text-xs text-slate-500">👥 {card.members.join(', ')}</p>
        )}

        {/* T1: organizer's custom Q&A shown in gallery */}
        {(card.custom_answers || []).length > 0 && (
          <div className="mt-3 space-y-1.5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
            {card.custom_answers.map((qa, i) => (
              <div key={i} className="text-xs">
                <span className="font-bold text-indigo-300">Q: {qa.question}</span>
                <p className="text-slate-300">{qa.answer}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {card.repo_url && (
            <a href={card.repo_url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800">
              🐱 GitHub repo
            </a>
          )}
          {card.live_url && (
            <a href={card.live_url} target="_blank" rel="noreferrer" className="rounded-lg border border-emerald-600/50 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-600/10">
              🌐 Live demo
            </a>
          )}
          {card.demo_video_url && (
            <a href={card.demo_video_url} target="_blank" rel="noreferrer" className="rounded-lg border border-rose-600/50 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-600/10">
              🎬 Demo video
            </a>
          )}
          {(card.image_count || 0) > 0 && (
            <button onClick={() => setShowImages(true)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800">
              📸 Screenshots ({card.image_count})
            </button>
          )}
          {(card.extra_links || []).map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800">
              🔗 {l.label}
            </a>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          {/* T3: mode-aware voting control */}
          {config?.vote_mode === 'quadratic' ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={minus}
                disabled={busy || !canVote || myN === 0}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-sm font-black text-slate-300 hover:bg-slate-800 disabled:opacity-30"
                title="Remove one vote"
              >
                −
              </button>
              <span className={`min-w-14 rounded-xl px-3 py-1.5 text-center text-sm font-extrabold ${myN ? 'bg-purple-500 text-white' : 'border border-purple-500/40 text-purple-300'}`}>
                {myN ? `❤️ ×${myN}` : '❤️ 0'}
              </span>
              <button
                onClick={plus}
                disabled={busy || !canVote}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-500/50 text-sm font-black text-purple-300 hover:bg-purple-500/10 disabled:opacity-30"
                title={myN ? `+1 vote costs ${(myN + 1) ** 2 - myN ** 2} credits` : '+1 vote costs 1 credit'}
              >
                +
              </button>
              {myN > 0 && (
                <span className="text-[10px] text-purple-300/70" title="quadratic cost: n votes on one project cost n² credits">
                  ⚡{myN ** 2}
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={toggleSimple}
              disabled={busy || !canVote}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-extrabold transition disabled:opacity-50 ${
                myN
                  ? 'bg-rose-500 text-white hover:bg-rose-400'
                  : 'border border-rose-500/50 text-rose-300 hover:bg-rose-500/10'
              }`}
            >
              {myN ? '❤️ Supported' : '🤍 Support'}
            </button>
          )}
          {/* tally: only visible after results are public (T3 hidden-window) */}
          {!card.votes_hidden && card.votes > 0 && (
            <span className="text-xs font-bold text-rose-300">❤️ {card.votes}</span>
          )}
          {card.votes_hidden && (
            <span className="text-[11px] text-slate-500" title="Tallies hidden until voting closes">🔒 results hidden</span>
          )}
          <span className="text-xs text-slate-500">
            {card.submitted_at ? new Date(card.submitted_at).toLocaleDateString() : ''}
          </span>
        </div>
        {err && <p className="mt-1.5 text-[11px] text-rose-300">{err}</p>}

        <CommentBlock submissionId={card.id} me={me} user={user} />
      </div>

      {showImages && <ImagesModal card={card} onClose={() => setShowImages(false)} />}
    </div>
  )
}

export default function Gallery() {
  const { slug } = useParams()
  const { user } = useAuth()
  const [event, setEvent] = useState(null)
  const [cards, setCards] = useState(null)
  const [q, setQ] = useState('')
  const [trackFilter, setTrackFilter] = useState('')
  const v = useVoting(event?.id, user)

  const loadCards = (e) =>
    api.get(`/submissions/gallery/${e.id}`).then(setCards).catch(() => setCards([]))

  useEffect(() => {
    api
      .get(`/events/${slug}`)
      .then((e) => {
        setEvent(e)
        loadCards(e)
      })
      .catch(() => setEvent(false))
  }, [slug])

  function onRefresh() {
    if (event) loadCards(event)
  }

  const trackNames = useMemo(
    () => [...new Set((cards || []).map((c) => c.track).filter(Boolean))],
    [cards],
  )

  const filtered = useMemo(() => {
    let list = cards || []
    if (trackFilter) list = list.filter((c) => c.track === trackFilter)
    const t = q.trim().toLowerCase()
    if (t) {
      list = list.filter((c) =>
        [c.title, c.tagline, c.team_name, c.tech_stack, c.track].filter(Boolean).some((v) => v.toLowerCase().includes(t)),
      )
    }
    return list
  }, [cards, q, trackFilter])

  if (event === false)
    return (
      <div className="min-h-screen">
        <Navbar />
        <p className="p-10 text-center text-slate-400">Event not found.</p>
      </div>
    )
  if (!event || cards === null)
    return (
      <div className="min-h-screen">
        <Navbar />
        <p className="p-10 text-slate-400">Loading gallery…</p>
      </div>
    )

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">🖼️ Project Gallery</h1>
            <p className="mt-1 text-slate-400">
              {event.title} — every submitted project. Order is shuffled per viewer, so no project gets position bias.
            </p>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm text-slate-300">
            {cards.length} project{cards.length === 1 ? '' : 's'}
          </span>
        </div>

        <VotingPanel event={event} user={user} v={v} onCast={onRefresh} />

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="min-w-64 flex-1">
            <SearchBox value={q} onChange={setQ} placeholder="Search by title, team, tech…" />
          </div>
          {trackNames.length > 0 && (
            <select
              value={trackFilter}
              onChange={(e) => setTrackFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            >
              <option value="">🏷 All tracks</option>
              {trackNames.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="card p-12 text-center text-slate-400">
            {cards.length === 0
              ? "No submissions yet — be the first to ship!"
              : `Nothing matches "${q}".`}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {filtered.map((c) => (
              <ProjectCard key={c.id} card={c} me={!!user} user={user} v={v} onRefresh={onRefresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
