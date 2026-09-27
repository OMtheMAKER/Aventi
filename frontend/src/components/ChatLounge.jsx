import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '../api'
import { GENDER_ICON } from './ui'

// Event lounge: 💬 general (all participants) · 👥 team (members-only)
// · 📢 announcements (organizers/judges post). Bitmoji by gender + roles.
// Every composer has an emoji/bitmoji picker.

const ROLE_BADGE = {
  organizer: { cls: 'bg-amber-500/20 text-amber-300', label: '👑 Organizer' },
  judge: { cls: 'bg-purple-500/20 text-purple-300', label: '⚖️ Judge' },
  participant: { cls: 'bg-slate-700/50 text-slate-300', label: '🧑 Participant' },
}

// emoji/bitmoji palette — grouped grab-and-send rows
const EMOJI_ROWS = [
  ['😀', '😂', '🤣', '😊', '😍', '😎', '🤔', '😴', '😜', '🙃', '😅', '🥳'],
  ['👍', '👎', '❤️', '🔥', '🎉', '💯', '🙌', '👏', '💪', '🫡', '🤝', '🫶'],
  ['🚀', '💡', '⚡', '🧠', '🤖', '💻', '⌨️', '📱', '🛠️', '🔧', '🎯', '🏆'],
  ['🐛', '🪲', '👨‍💻', '👩‍💻', '🧑‍💻', '👑', '⚖️', '🤫', '👦', '👧', '🧑', '🍕'],
]

function Bitmoji({ icon, name }) {
  return (
    <span title={name}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-700 bg-slate-800 text-lg select-none">
      {icon}
    </span>
  )
}

function EmojiPicker({ onPick, onClose }) {
  return (
    <div className="absolute bottom-12 left-2 z-30 w-64 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl"
      onClick={(e) => e.stopPropagation()}>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Bitmoji / emoji</span>
        <button onClick={onClose} className="text-slate-500 hover:text-white">✕</button>
      </div>
      {EMOJI_ROWS.map((row, i) => (
        <div key={i} className="grid grid-cols-12">
          {row.map((e) => (
            <button key={e} type="button" onClick={() => onPick(e)}
              className="rounded p-0.5 text-lg hover:bg-slate-700">
              {e}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function ChatLounge({ eventId, user }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const bodies = useRef({ general: '', announce: '', team: '' })
  const inputs = useRef({})
  const [pickerFor, setPickerFor] = useState(null)  // 'general' | 'announce' | 'team'
  const [tab, setTab] = useState('general')
  const [flagModal, setFlagModal] = useState(null)
  const [banModal, setBanModal] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(0)
  const bottomRef = useRef(null)
  const lastIdRef = useRef(0)
  const listRef = useRef([])

  const load = useCallback(async (initial = false) => {
    try {
      const d = await api.get(`/chat/${eventId}/messages?after_id=${initial ? 0 : lastIdRef.current}&limit=150`)
      setErr('')
      if (initial) {
        listRef.current = d.messages
      } else if (d.messages.length) {
        const ids = new Set(listRef.current.map((m) => m.id))
        listRef.current = [...listRef.current, ...d.messages.filter((m) => !ids.has(m.id))]
      }
      lastIdRef.current = listRef.current.reduce((a, m) => Math.max(a, m.id), 0)
      setData({ ...d, messages: listRef.current })
    } catch (e) { setErr(e.message) }
  }, [eventId])

  useEffect(() => {
    load(true)
    // Live push: a WebSocket pokes us on every new message; polling stays as a
    // fallback (slow while the socket is healthy, full-speed if it drops).
    let ws = null
    let pollMs = 4000
    let timer = null
    let closed = false
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${proto}://${location.host}/api/chat/ws/${eventId}`)
      ws.onopen = () => { pollMs = 30000 }
      ws.onmessage = () => load(false)
      ws.onclose = () => { pollMs = 4000 }
      ws.onerror = () => { try { ws.close() } catch { /* noop */ } }
    } catch { /* socket unsupported — polling alone covers it */ }
    const tick = async () => {
      if (closed) return
      await load(false)
      timer = setTimeout(tick, pollMs)
    }
    timer = setTimeout(tick, pollMs)
    return () => { closed = true; clearTimeout(timer); try { ws && ws.close() } catch { /* noop */ } }
  }, [load, eventId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data?.messages?.length, tab])

  async function refresh() { await load(true) }

  function insertEmoji(channel, emoji) {
    const el = inputs.current[channel]
    if (el && typeof el.selectionStart === 'number') {
      const v = el.value
      const pos = el.selectionStart
      bodies.current[channel] = v.slice(0, pos) + emoji + v.slice(el.selectionEnd)
      requestAnimationFrame(() => { el.value = bodies.current[channel]; el.selectionStart = el.selectionEnd = pos + emoji.length; el.focus() })
    } else {
      bodies.current[channel] += emoji
    }
    setData((d) => ({ ...d }))
  }

  async function send(channel) {
    const body = bodies.current[channel].trim()
    if (!body) return
    setBusy(1)
    try {
      await api.post(`/chat/${eventId}/messages?channel=${channel}`, { body })
      bodies.current[channel] = ''
      if (inputs.current[channel]) inputs.current[channel].value = ''
      await refresh()
    } catch (e) { setErr(e.message) } finally { setBusy(0) }
  }
  async function react(id, emoji) {
    try { await api.post(`/chat/message/${id}/react`, { emoji }); await refresh() } catch (e) { setErr(e.message) }
  }
  async function doReport() {
    if (!flagModal) return
    try {
      await api.post(`/chat/message/${flagModal.id}/report`, { reason })
      setFlagModal(null); setReason(''); await refresh()
    } catch (e) { setErr(e.message) }
  }
  async function doMod(id, action) {
    try { await api.post(`/chat/message/${id}/moderate?action=${action}`); await refresh() } catch (e) { setErr(e.message) }
  }
  async function doBan() {
    if (!banModal) return
    try {
      await api.post(`/chat/${eventId}/ban`, { user_id: banModal.user_id, reason })
      setBanModal(null); setReason(''); await refresh()
    } catch (e) { setErr(e.message) }
  }

  if (!data) {
    return (
      <div className="card p-8 text-center text-slate-400">
        {err ? `🔒 ${err}` : 'Loading lounge…'}
      </div>
    )
  }

  const myRole = data.my_role
  const isMod = myRole === 'organizer' || myRole === 'judge'
  const muted = data.my_ban?.banned
  const generalMsgs = data.messages.filter((m) => m.channel === 'general')
  const announceMsgs = data.messages.filter((m) => m.channel === 'announce')
  const teamMsgs = data.messages.filter((m) => m.channel === 'team')
  const hasTeam = !!data.my_team_id

  function authorIcon(m) {
    if (m.author_role === 'organizer') return '👑'
    if (m.author_role === 'judge') return '⚖️'
    return GENDER_ICON[m.author_gender] || '🧑'
  }

  function MsgRow({ m, announceCol }) {
    const badge = ROLE_BADGE[m.author_role] || ROLE_BADGE.participant
    return (
      <div className={`group flex gap-2.5 rounded-xl px-2.5 py-2 hover:bg-slate-800/40 ${m.removed ? 'opacity-60' : ''}`}>
        <Bitmoji icon={authorIcon(m)} name={m.author_name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-bold text-white">{m.author_name}</span>
            <span className={`rounded-full px-1.5 py-0 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
            <span className="text-[10px] text-slate-500">
              {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
            <span className="invisible ml-auto flex gap-1 group-hover:visible">
              {!m.removed && m.author_id !== user?.id && (
                <button onClick={() => { setFlagModal(m); setReason('') }} title="Report to moderators"
                  className="rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-slate-700 hover:text-rose-300">🚩</button>
              )}
              {isMod && !m.removed && (
                <button onClick={() => doMod(m.id, 'remove')} title="Moderator delete"
                  className="rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-slate-700 hover:text-rose-300">🗑</button>
              )}
              {isMod && m.removed && (
                <button onClick={() => doMod(m.id, 'restore')} title="Restore"
                  className="rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-slate-700 hover:text-emerald-300">↩️</button>
              )}
              {isMod && m.author_role === 'participant' && (
                <button onClick={() => { setBanModal({ user_id: m.author_id, name: m.author_name }); setReason('') }} title="Mute this person"
                  className="rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-slate-700 hover:text-amber-300">🔇</button>
              )}
            </span>
          </div>
          {m.removed ? (
            <p className="text-sm italic text-slate-500">
              🗑 message removed by moderators{isMod && m.body ? ` — "${m.body.slice(0, 80)}${m.body.length > 80 ? '…' : ''}"` : ''}
            </p>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm text-slate-200">{m.body}</p>
          )}
          {!m.removed && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {data.allowed_reactions.map((e) => {
                const count = m.reactions.buckets[e] || 0
                const mine = m.reactions.mine[e]
                return (
                  <button key={e} onClick={() => react(m.id, e)}
                    className={`rounded-full border px-2 py-0.5 text-xs transition ${
                      mine ? 'border-indigo-400 bg-indigo-500/25 text-white' : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}>
                    {e}{count ? ` ${count}` : ''}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  function Column({ msgs, channel, title, icon, canPost, lockNote }) {
    return (
      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
        onClick={() => pickerFor === channel && setPickerFor(null)}>
        <div className={`border-b border-slate-800 px-3 py-2 text-sm font-bold ${
          channel === 'announce' ? 'bg-amber-500/10 text-amber-300'
          : channel === 'team' ? 'bg-emerald-500/10 text-emerald-300'
          : 'text-slate-300'
        }`}>
          {icon} {title}
          <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">{msgs.length}</span>
        </div>
        <div className="min-h-72 flex-1 overflow-y-auto p-1" style={{ maxHeight: 380 }}>
          {msgs.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">
              {channel === 'general' ? 'No messages yet — send the first one! 👋'
               : channel === 'team' ? 'Squad zone — only your team members can read this chat.'
               : 'No announcements yet.'}
            </p>
          ) : (
            msgs.map((m) => <MsgRow key={m.id} m={m} announceCol={channel === 'announce'} />)
          )}
          <div ref={channel === tab ? bottomRef : undefined} />
        </div>
        <div className="relative border-t border-slate-800 p-2">
          {canPost ? (
            muted && channel === 'general' ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                🔇 You are muted{data.my_ban.reason ? `: ${data.my_ban.reason}` : ''} — reactions still work, posting doesn't.
              </p>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); send(channel) }} className="flex gap-2">
                <div className="relative">
                  <button type="button" title="Send a bitmoji / emoji"
                    onClick={() => setPickerFor(pickerFor === channel ? null : channel)}
                    className="h-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-base hover:border-indigo-500">
                    😊
                  </button>
                  {pickerFor === channel && (
                    <EmojiPicker onPick={(e) => insertEmoji(channel, e)} onClose={() => setPickerFor(null)} />
                  )}
                </div>
                <input
                  defaultValue={bodies.current[channel]}
                  onChange={(e) => { bodies.current[channel] = e.target.value; setTab(channel); setData((d) => ({ ...d })) }}
                  onClick={(e) => { inputs.current[channel] = e.target; setTab(channel) }}
                  onKeyUp={(e) => { inputs.current[channel] = e.target }}
                  placeholder={channel === 'general' ? 'Message the lounge…' : channel === 'team' ? 'Message your squad…' : '📢 Post an announcement…'}
                  maxLength={1200}
                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                />
                <button disabled={busy || !bodies.current[channel].trim()}
                  className="rounded-lg bg-indigo-500 px-4 text-sm font-bold text-white hover:bg-indigo-400 disabled:opacity-40">
                  ➤
                </button>
              </form>
            )
          ) : (
            <p className="px-3 py-1.5 text-center text-xs text-slate-500">{lockNote}</p>
          )}
        </div>
      </div>
    )
  }

  const teamTitle = hasTeam
    ? (teamMsgs[0]?.team_name ? `Team — ${teamMsgs[0].team_name}` : 'My Team')
    : (isMod ? 'Team walls' : 'My Team')

  return (
    <div className="card overflow-hidden p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-extrabold">💬 Event Lounge</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ROLE_BADGE[myRole]?.cls || ROLE_BADGE.participant.cls}`}>
          {ROLE_BADGE[myRole]?.label || '🧑 Participant'}
        </span>
      </div>
      {err && <p className="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300">{err}</p>}

      {/* mobile: tabs; desktop: 3 columns (2 if not on a team and not mod) */}
      <div className="mb-2 flex gap-1.5 lg:hidden">
        {[['general', '💬 General'], ['team', '👥 Team'], ['announce', '📢 Announce']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-bold ${tab === id ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className={`grid gap-3 ${hasTeam || isMod ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        <div className={tab === 'general' ? '' : 'hidden lg:block'}>
          <Column msgs={generalMsgs} channel="general" title="General" icon="💬" canPost lockNote="" />
        </div>
        {(hasTeam || isMod) && (
          <div className={tab === 'team' ? '' : 'hidden lg:block'}>
            <Column msgs={teamMsgs} channel="team" title={teamTitle} icon="👥" canPost={hasTeam}
              lockNote={hasTeam ? '' : '🔒 Members-only walls — organizers watch for safety, but only teammates post.'} />
          </div>
        )}
        <div className={`${tab === 'announce' ? '' : 'hidden lg:block'} ${!(hasTeam || isMod) && tab === 'team' ? 'hidden' : ''}`}>
          <Column msgs={announceMsgs} channel="announce" title="Announcements" icon="📢"
            canPost={myRole === 'organizer' || myRole === 'judge'} lockNote="🔒 Only organizers & judges post here — react away! 👇" />
        </div>
      </div>

      {!hasTeam && !isMod && (
        <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
          👥 <b>Team wall unlocks</b> when you join a team — from the Team Hub above or with an invite code.
        </p>
      )}

      {/* report dialog */}
      {flagModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setFlagModal(null)}>
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h4 className="mb-2 font-bold">🚩 Report message</h4>
            <p className="mb-3 text-sm text-slate-400">
              You are reporting <b className="text-white">{flagModal.author_name}</b>'s message to the event moderators.
            </p>
            <textarea rows={3} maxLength={240} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Why? (optional)"
              className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setFlagModal(null)} className="rounded-lg border border-slate-700 px-4 py-1.5 text-sm font-bold text-slate-300">Cancel</button>
              <button onClick={doReport} className="rounded-lg bg-rose-500 px-4 py-1.5 text-sm font-bold text-white">Report</button>
            </div>
          </div>
        </div>
      )}

      {/* ban dialog */}
      {banModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setBanModal(null)}>
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h4 className="mb-2 font-bold">🔇 Mute participant</h4>
            <p className="mb-3 text-sm text-slate-400">
              <b className="text-white">{banModal.name}</b> won't be able to post in General (they can still read & react).
            </p>
            <textarea rows={2} maxLength={240} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (shown to them, optional)"
              className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setBanModal(null)} className="rounded-lg border border-slate-700 px-4 py-1.5 text-sm font-bold text-slate-300">Cancel</button>
              <button onClick={doBan} className="rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-bold text-slate-950">Mute</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
