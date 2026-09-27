import { useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import ChatLounge from './ChatLounge'
import { GENDER_ICON } from './ui'

// Admin-side chat control tower: full lounge view (so admins can post
// announcements + moderate by hovering), plus flagged-message inbox and
// active mute list with unban buttons.

export default function ChatModPanel({ events }) {
  const { user } = useAuth()
  const [eventId, setEventId] = useState(events[0]?.id)
  const [queue, setQueue] = useState(null)
  const [err, setErr] = useState('')

  const load = (id) => api.get(`/chat/${id}/mod-queue`).then(setQueue).catch(() => setQueue(null))
  useEffect(() => { if (eventId) load(eventId) }, [eventId])

  async function unban(userId) {
    try { await api.post(`/chat/${eventId}/unban`, { user_id: userId }); load(eventId) } catch (e) { setErr(e.message) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-400">Event:</span>
        <select value={eventId || ''} onChange={(e) => setEventId(Number(e.target.value))}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500 min-w-64">
          {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
      </div>
      {err && <p className="text-sm text-rose-300">{err}</p>}

      <ChatLounge eventId={eventId} user={user} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h4 className="mb-1 font-bold">🚩 Reported messages</h4>
          <p className="mb-3 text-xs text-slate-500">
            Participants flagged these for you. Hover any message above to 🗑 remove — that also clears this report.
          </p>
          {!queue ? <p className="text-xs text-slate-500">Loading…</p>
            : queue.flagged.length === 0 ? <p className="text-xs text-emerald-300">✅ Nothing flagged — clean lounge!</p>
            : (
              <ul className="space-y-2">
                {queue.flagged.map((m) => (
                  <li key={m.id} className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2 text-xs">
                    <p className="text-slate-200">"{m.body?.slice(0, 140)}{m.body?.length > 140 ? '…' : ''}"</p>
                    <p className="mt-1 text-slate-400">
                      by <b>{GENDER_ICON[m.author_gender] || '🧑'} {m.author_name}</b>
                      {m.report_reason && <> — {m.report_reason}</>}
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <button onClick={async () => { await api.post(`/chat/message/${m.id}/moderate?action=remove`); load(eventId) }}
                        className="rounded border border-rose-500/40 px-2 py-0.5 text-[10px] font-bold text-rose-300 hover:bg-rose-500/10">🗑 Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </div>

        <div className="card p-4">
          <h4 className="mb-1 font-bold">🔇 Muted participants</h4>
          <p className="mb-3 text-xs text-slate-500">They can read & react but not post in General.</p>
          {!queue ? <p className="text-xs text-slate-500">Loading…</p>
            : queue.mutes.length === 0 ? <p className="text-xs text-slate-500">No one muted.</p>
            : (
              <ul className="space-y-2">
                {queue.mutes.map((b) => (
                  <li key={b.user_id} className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white">{b.name} <span className="font-normal text-slate-400">({b.email})</span></p>
                      <p className="text-slate-400">{b.reason || 'no reason'} · by {b.by} · {b.created_at ? new Date(b.created_at).toLocaleString() : ''}</p>
                    </div>
                    <button onClick={() => unban(b.user_id)}
                      className="rounded border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/10">🔊 Unmute</button>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>
    </div>
  )
}
