import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Navbar, fmtDay } from '../components/ui'

const FAQS = [
  {
    q: 'How do I register for a hackathon?',
    a: 'Open a live event from the Events page, log in as a participant, and fill the registration form on the right. You can then create your own team or join one with an invite code.',
  },
  {
    q: 'I don\'t have a team — what do I do?',
    a: 'No problem. Register normally, then open the event\'s Team Hub. Teams with open slots show a green badge — tap any of them and hit "Join". You can also share your own invite code from the event page.',
  },
  {
    q: 'When can I contact the admin?',
    a: 'Literally anytime — email or ping us. For event-specific questions, the event\'s own organizer email is on the event page under "Organizer & community".',
  },
  {
    q: 'I clicked an event but got sent to login?',
    a: 'Event pages are members-only. Log in (or create a free account) and you\'ll land right inside.',
  },
]

export default function Support() {
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [open, setOpen] = useState(0)

  useEffect(() => {
    api.get('/events').then(setEvents).catch(() => setEvents([]))
  }, [])

  const contactable = events.filter((e) => e.contact_email)

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="text-center">
          <p className="mx-auto inline-block rounded-full border border-slate-700 bg-slate-900 px-4 py-1 text-[11px] font-black uppercase tracking-[0.25em] text-indigo-300">
            🛟 Help &amp; Support
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight">
            Stuck somewhere? <span className="gradient-text">We've got you.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            Questions about a hackathon, trouble joining a team, or anything about the
            platform — reach the right human below.
          </p>
        </div>

        {/* contact cards */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="card p-6">
            <p className="text-2xl">🛡️</p>
            <h2 className="mt-2 text-lg font-bold text-white">Platform admin</h2>
            <p className="mt-1 text-sm text-slate-400">
              Platform-level issues — login trouble, wrong entries, anything that looks broken.
            </p>
            <a
              href="mailto:admin@platform.dev"
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-400"
            >
              ✉️ admin@platform.dev
            </a>
          </div>

          <div className="card p-6">
            <p className="text-2xl">📣</p>
            <h2 className="mt-2 text-lg font-bold text-white">Event organizers</h2>
            <p className="mt-1 text-sm text-slate-400">
              Each hackathon has its own organizer contact — mail them for event-specific
              questions (rules, rounds, venue, deadlines).
            </p>
            {contactable.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">No organizer contact published yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {contactable.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-950/60 px-3 py-2 text-sm">
                    <button onClick={() => navigate(`/event/${e.slug}`)} className="font-semibold text-white hover:text-indigo-300">
                      {e.title}
                    </button>
                    <a href={`mailto:${e.contact_email}`} className="text-xs font-bold text-indigo-300 hover:underline">
                      ✉️ {e.contact_email}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* FAQ accordion */}
        <h2 className="mb-4 mt-12 text-2xl font-bold">Frequently asked</h2>
        <div className="space-y-2">
          {FAQS.map((f, i) => (
            <div key={i} className="card overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? -1 : i)}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-white hover:bg-slate-900/40"
              >
                {f.q}
                <span className="text-slate-500">{open === i ? '▲' : '▼'}</span>
              </button>
              {open === i && <p className="border-t border-slate-800 px-5 pb-4 pt-3 text-sm text-slate-300">{f.a}</p>}
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-slate-500">
          Prefer face-to-face? Every live hackathon also lists WhatsApp &amp; Discord
          communities on its event page.
        </p>
      </div>
    </div>
  )
}
