import { useState } from 'react'
import { fmtDate } from './ui'

/* ============ display style registry (used by admin event builder too) ============ */

export const STYLE_OPTIONS = [
  {
    id: 'treasure_map',
    name: '🗺️ Treasure Map',
    blurb: 'Full-screen pirate scroll — follow the dotted trail level by level to the treasure.',
    preview: 'from-amber-200 to-orange-400 text-amber-950',
    previewIcon: '🏴‍☠️',
  },
  {
    id: 'desert_map',
    name: '🏜️ Desert Voyage',
    blurb: 'Ancient Egypt scroll — pyramids, bridges and dunes. Cross the desert to the pallets of gold.',
    preview: 'from-yellow-300 to-amber-700 text-amber-950',
    previewIcon: '🐫',
  },
  {
    id: 'world_map',
    name: '🌍 World Realm',
    blurb: 'A whole fantasy realm: ice peaks, green plains, jungle and ocean. Conquer the continents.',
    preview: 'from-emerald-400 to-sky-900 text-white',
    previewIcon: '🌍',
  },
  {
    id: 'board_map',
    name: '🎲 Board Sprint',
    blurb: 'Kids-style board game with a red & yellow tile path — hop square by square to the finish.',
    preview: 'from-sky-300 to-rose-400 text-rose-950',
    previewIcon: '🎲',
  },
  {
    id: 'town_map',
    name: '🏘️ Little Town',
    blurb: 'A cozy cartoon town — river, bridges, windmill and the lighthouse by the sea.',
    preview: 'from-green-300 to-teal-600 text-teal-950',
    previewIcon: '🏡',
  },
  {
    id: 'quest_map',
    name: '⚔️ Quest Map',
    blurb: 'Adventure-game style — dark biomes, forest & lava nodes, star ratings, treasure vault.',
    preview: 'from-emerald-700 to-slate-900 text-white',
    previewIcon: '🐉',
  },
  {
    id: 'timeline',
    name: '📋 Briefing Timeline',
    blurb: 'Clean, professional mission briefing — a straight timeline with all key dates.',
    preview: 'from-sky-700 to-indigo-900 text-white',
    previewIcon: '📋',
  },
]

/* ============ shared helpers ============ */

function daysBetween(a, b) {
  return Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000))
}

function DifficultyDots({ level }) {
  const words = ['Easy', 'Medium', 'Hard']
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-xs font-black uppercase tracking-widest">{words[level - 1]}</span>
      <span className="flex gap-0.5">
        {Array.from({ length: 3 }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full ${i < level ? 'bg-current' : 'bg-current opacity-25'}`}
          />
        ))}
      </span>
    </span>
  )
}

/* ============ 1) FULL-SCREEN TREASURE MAP ============ */

/** Positions of the pins along the dotted trail in treasure-map.jpg (percentages). */
const TREASURE_PINS = {
  level1: { left: '17%', top: '76%' },
  level2: { left: '47%', top: '56%' },
  level3: { left: '66%', top: '44%' },
  chest: { left: '85%', top: '18%' },
}

function TreasurePin({ pin, onSelect, active, icon, num, red }) {
  return (
    <button
      onClick={onSelect}
      style={{ left: pin.left, top: pin.top }}
      className="group absolute -translate-x-1/2 -translate-y-1/2"
      aria-label={`Map pin ${num}`}
    >
      {/* pulsing ring */}
      <span
        className={`absolute inset-0 -m-2 animate-ping rounded-full opacity-30 ${
          red ? 'bg-red-500' : 'bg-amber-400'
        }`}
      />
      <span
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 shadow-xl transition-transform group-hover:scale-110 sm:h-14 sm:w-14 ${
          active
            ? 'scale-110 border-yellow-300 bg-slate-900 text-2xl'
            : 'border-white/70 bg-slate-900/85 text-xl backdrop-blur-sm'
        }`}
      >
        {icon}
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-black text-slate-900">
          {num}
        </span>
      </span>
    </button>
  )
}

function TreasureMap({ event, wide }) {
  const dur = daysBetween(event.start_date, event.end_date)
  const [active, setActive] = useState('level1')

  const stops = {
    level1: {
      icon: '🎟️',
      num: 1,
      pin: TREASURE_PINS.level1,
      title: 'Boarding Point — Registration Closes',
      badge: 'green',
      when: fmtDate(event.registration_deadline),
      body: `The gate closes at ${fmtDate(event.registration_deadline)}. Register before this date to join the crew — after it, no one else gets on board.`,
      lives: !event.registration_deadline,
    },
    level2: {
      icon: '🚢',
      num: 2,
      pin: TREASURE_PINS.level2,
      title: 'The Voyage Begins — Event Starts',
      badge: 'yellow',
      when: fmtDate(event.start_date),
      body: `The event kicks off on ${fmtDate(event.start_date)} — ${event.mode}${
        event.location ? `, ${event.location}` : ''
      }. Teams start building from here, mentors come on board.`,
      level: 2,
    },
    level3: {
      icon: '🦑',
      num: 3,
      pin: TREASURE_PINS.level3,
      title: 'The Deep — Event Ends',
      badge: 'red',
      when: fmtDate(event.end_date),
      body: `The toughest stretch. Your project must ship by ${fmtDate(event.end_date)} — a ${dur}-day build window in total. Submissions lock after the deadline.`,
      level: 3,
    },
    chest: {
      icon: '🏆',
      num: 4,
      pin: TREASURE_PINS.chest,
      title: 'X Marks the Spot — The Treasure',
      badge: 'amber',
      when: 'Winners announced after judging',
      body: event.prize_pool
        ? `Total prize pool: ${event.prize_pool}. Every track below carries its own share of the loot.`
        : 'The winners take the glory home.',
      chest: true,
    },
  }
  const activeStop = stops[active]

  const badgeCls = {
    green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    yellow: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    red: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    amber: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
  }[activeStop.badge]

  // If registration_deadline is missing, skip level 1
  const orderedKeys = ['level1', 'level2', 'level3', 'chest'].filter(
    (k) => k !== 'level1' || event.registration_deadline,
  )

  const section = (
    <div className="relative overflow-hidden border-y-4 border-amber-900/70 shadow-2xl">
      {/* the scroll itself */}
      <img
        src="/treasure-map.jpg"
        alt="Treasure map"
        className="absolute inset-0 h-full w-full min-h-[540px] object-cover"
      />
      {/* cinematic vignette */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-transparent to-slate-950/85" />

      {/* header strip */}
      <div className="relative flex flex-col items-center pt-8 sm:pt-10">
        <p className="rounded-full bg-slate-950/70 px-4 py-1 text-[11px] font-black uppercase tracking-[0.3em] text-amber-200 backdrop-blur-sm">
          ☠ ☠ ☠ &nbsp; The Treasure Trail &nbsp; ☠ ☠ ☠
        </p>
        <h2 className="mt-3 text-center font-serif text-2xl font-black text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] sm:text-4xl">
          Follow the Dotted Path to Fortune
        </h2>
        <p className="mt-2 max-w-xl rounded-lg bg-slate-950/60 px-4 py-1.5 text-center text-xs font-semibold text-amber-100 backdrop-blur-sm sm:text-sm">
          {event.title} · {event.mode}
          {event.location ? ` · ${event.location}` : ''} — tap a numbered pin to reveal the
          briefing for that level.
        </p>
      </div>

      {/* pins along the trail — sized with a stable inner area */}
      <div className="relative mx-auto h-[420px] max-w-6xl sm:h-[520px]">
        {orderedKeys.map((k) => (
          <TreasurePin
            key={k}
            pin={stops[k].pin}
            icon={stops[k].icon}
            num={stops[k].num}
            active={active === k}
            red={stops[k].badge === 'red'}
            onSelect={() => setActive(k)}
          />
        ))}
      </div>

      {/* briefing drawer */}
      <div className="relative pb-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-700/80 bg-slate-950/85 p-5 shadow-2xl backdrop-blur-md sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-3xl">{activeStop.icon}</span>
            <div>
              <p className="text-base font-extrabold text-white sm:text-lg">{activeStop.title}</p>
              <p className="text-sm font-bold text-amber-300">{activeStop.when}</p>
            </div>
            <span className={`ml-auto rounded-full border px-3 py-1 ${badgeCls}`}>
              {activeStop.chest ? (
                <span className="text-xs font-black uppercase tracking-widest">Final level</span>
              ) : (
                <DifficultyDots level={activeStop.num > 3 ? 3 : activeStop.num} />
              )}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{activeStop.body}</p>

          {activeStop.chest && event.tracks?.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-amber-300">
                💰 Loot chest — every track has its own prize
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {event.tracks.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"
                  >
                    <span className="text-lg">🪙</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-amber-100">{t.name}</p>
                      <p className="text-xs font-bold text-amber-300">{t.prize}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return section
}

/* ============ image-based full-screen map (generic engine) ============ */

function ImagePin({ pin, onSelect, active, icon, num, accent }) {
  return (
    <button
      onClick={onSelect}
      style={{ left: pin.left, top: pin.top }}
      className="group absolute -translate-x-1/2 -translate-y-1/2"
      aria-label={`Map pin ${num}`}
    >
      <span
        className={`absolute inset-0 -m-2 animate-ping rounded-full opacity-30 ${accent.ping}`}
      />
      <span
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 text-xl shadow-xl backdrop-blur-sm transition-transform group-hover:scale-110 sm:h-14 sm:w-14 sm:text-2xl ${
          active ? `scale-110 ${accent.ring}` : `border-white/80 ${accent.pin}`
        }`}
      >
        {icon}
        <span
          className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${accent.num}`}
        >
          {num}
        </span>
      </span>
    </button>
  )
}

/** Shared full-screen image map: image + 4 interactive pins + briefing drawer. */
function ImageMap({ event, cfg }) {
  const dur = daysBetween(event.start_date, event.end_date)
  const [active, setActive] = useState('level1')
  const A = cfg.accent

  const stops = {
    level1: {
      icon: cfg.icons[0],
      num: 1,
      pin: cfg.pins.level1,
      title: `${cfg.stopNames[0]} — Registration Closes`,
      badge: 'green',
      when: fmtDate(event.registration_deadline),
      body: `The ${cfg.unit} opens until ${fmtDate(event.registration_deadline)}. Register now and gather your crew — after this, the ${cfg.unit} is sealed.`,
    },
    level2: {
      icon: cfg.icons[1],
      num: 2,
      pin: cfg.pins.level2,
      title: `${cfg.stopNames[1]} — Event Starts`,
      badge: 'amber',
      when: fmtDate(event.start_date),
      body: `The event kicks off on ${fmtDate(event.start_date)} — ${event.mode}${
        event.location ? `, ${event.location}` : ''
      }. Teams begin the ${dur}-day build ${cfg.journeyWord} from here.`,
    },
    level3: {
      icon: cfg.icons[2],
      num: 3,
      pin: cfg.pins.level3,
      title: `${cfg.stopNames[2]} — Event Ends`,
      badge: 'red',
      when: fmtDate(event.end_date),
      body: `${cfg.dangerText} Everything must ship by ${fmtDate(event.end_date)} — a ${dur}-day build window in total. Submissions lock after the deadline.`,
    },
    chest: {
      icon: cfg.icons[3],
      num: 4,
      pin: cfg.pins.chest,
      title: `${cfg.stopNames[3]} — The Reward`,
      badge: 'gold',
      when: 'Winners announced after judging',
      body: event.prize_pool
        ? `Total prize pool: ${event.prize_pool}. Every track below claims its own share.`
        : 'The winners take the glory home.',
      chest: true,
    },
  }
  const activeStop = stops[active]

  const badgeCls = {
    green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    red: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    gold: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
  }[activeStop.badge]

  const orderedKeys = ['level1', 'level2', 'level3', 'chest'].filter(
    (k) => k !== 'level1' || event.registration_deadline,
  )

  return (
    <div className="relative overflow-hidden border-y-4 shadow-2xl" style={{ borderColor: A.border }}>
      <img
        src={cfg.img}
        alt={cfg.heading}
        className="absolute inset-0 h-full w-full min-h-[540px] object-cover"
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-transparent to-slate-950/85" />

      <div className="relative flex flex-col items-center pt-8 sm:pt-10">
        <p
          className="rounded-full bg-slate-950/70 px-4 py-1 text-[11px] font-black uppercase tracking-[0.3em] backdrop-blur-sm"
          style={{ color: A.tag }}
        >
          {cfg.kicker}
        </p>
        <h2 className="mt-3 text-center font-serif text-2xl font-black text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] sm:text-4xl">
          {cfg.heading}
        </h2>
        <p className="mt-2 max-w-xl rounded-lg bg-slate-950/60 px-4 py-1.5 text-center text-xs font-semibold text-slate-100 backdrop-blur-sm sm:text-sm">
          {event.title} · {event.mode}
          {event.location ? ` · ${event.location}` : ''} — {cfg.hint}
        </p>
      </div>

      <div className="relative mx-auto h-[420px] max-w-6xl sm:h-[520px]">
        {orderedKeys.map((k) => (
          <ImagePin
            key={k}
            pin={stops[k].pin}
            icon={stops[k].icon}
            num={stops[k].num}
            active={active === k}
            accent={A}
            onSelect={() => setActive(k)}
          />
        ))}
      </div>

      <div className="relative pb-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-700/80 bg-slate-950/85 p-5 shadow-2xl backdrop-blur-md sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-3xl">{activeStop.icon}</span>
            <div>
              <p className="text-base font-extrabold text-white sm:text-lg">{activeStop.title}</p>
              <p className={`text-sm font-bold ${A.when}`}>{activeStop.when}</p>
            </div>
            <span className={`ml-auto rounded-full border px-3 py-1 ${badgeCls}`}>
              {activeStop.chest ? (
                <span className="text-xs font-black uppercase tracking-widest">Final level</span>
              ) : (
                <DifficultyDots level={activeStop.num > 3 ? 3 : activeStop.num} />
              )}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{activeStop.body}</p>

          {activeStop.chest && event.tracks?.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-amber-300">
                💰 Rewards — every track has its own prize
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {event.tracks.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"
                  >
                    <span className="text-lg">🪙</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-amber-100">{t.name}</p>
                      <p className="text-xs font-bold text-amber-300">{t.prize}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---- style configs for the four new maps ---- */

const DESERT_CFG = {
  img: '/maps/desert.jpg',
  kicker: '🐫 🏜️ ☀️ · THE DESERT VOYAGE · ☀️ 🏜️ 🐫',
  heading: 'Cross the Dunes to the Golden Pyramid',
  hint: 'tap a numbered pin to reveal the briefing.',
  unit: 'caravan gate',
  journeyWord: 'expedition',
  dangerText: 'The dunes shift and hide the unprepared.',
  icons: ['🌉', '🛕', '💀', '🏆'],
  stopNames: ['Bridge of Entry', 'Rise of the Pyramid', "The Dragon's Dune", 'Vault of the Sun'],
  pins: {
    level1: { left: '10%', top: '82%' },
    level2: { left: '21%', top: '52%' },
    level3: { left: '64%', top: '44%' },
    chest: { left: '86%', top: '78%' },
  },
  accent: {
    pin: 'bg-stone-900/85', ping: 'bg-amber-400', ring: 'border-yellow-300 bg-stone-900',
    num: 'bg-amber-400 text-stone-900', border: '#92400e', tag: '#fbbf24', when: 'text-amber-300',
  },
}

const WORLD_CFG = {
  img: '/maps/world.jpg',
  kicker: '🌍 🗡️ 🛡️ · THE REALM CHALLENGE · 🛡️ 🗡️ 🌍',
  heading: 'Conquer Every Continent of the Realm',
  hint: 'tap a numbered pin to reveal the briefing.',
  unit: 'realm border',
  journeyWord: 'conquest',
  dangerText: 'Beyond the frozen wall the code runs cold.',
  icons: ['🏰', '🌴', '🏔️', '⚓'],
  stopNames: ['Citadel Gate', 'Jungle of Loops', 'The Frozen Wall', 'Harbor of Champions'],
  pins: {
    level1: { left: '41%', top: '41%' },
    level2: { left: '55%', top: '72%' },
    level3: { left: '63%', top: '13%' },
    chest: { left: '84%', top: '47%' },
  },
  accent: {
    pin: 'bg-emerald-950/85', ping: 'bg-emerald-400', ring: 'border-emerald-300 bg-emerald-950',
    num: 'bg-emerald-300 text-emerald-950', border: '#065f46', tag: '#6ee7b7', when: 'text-emerald-300',
  },
}

const BOARD_CFG = {
  img: '/maps/board.jpg',
  kicker: '🎲 ⭐ 🎈 · THE BOARD SPRINT · 🎈 ⭐ 🎲',
  heading: 'Hop the Tiles to the Finish Line',
  hint: 'tap a numbered pin to reveal the briefing.',
  unit: 'start tile',
  journeyWord: 'race',
  dangerText: 'Landing here is no childs play — the clock rolls fast.',
  icons: ['👦', '🎈', '⛺', '🏁'],
  stopNames: ['Start Square', 'The Balloon Lift', 'Camp Deadline', 'Finish Square'],
  pins: {
    level1: { left: '9%', top: '76%' },
    level2: { left: '29%', top: '20%' },
    level3: { left: '83%', top: '18%' },
    chest: { left: '90%', top: '74%' },
  },
  accent: {
    pin: 'bg-blue-950/85', ping: 'bg-rose-400', ring: 'border-yellow-300 bg-blue-950',
    num: 'bg-yellow-300 text-blue-950', border: '#1e3a8a', tag: '#fda4af', when: 'text-rose-300',
  },
}

const TOWN_CFG = {
  img: '/maps/town.jpg',
  kicker: '🏘️ 🚗 🌳 · LITTLE TOWN BIG TASKS · 🌳 🚗 🏘️',
  heading: 'Ship It Home Through Little Town',
  hint: 'tap a numbered pin to reveal the briefing.',
  unit: 'town gate',
  journeyWord: 'commute',
  dangerText: 'Rush hour in Little Town stops for no one.',
  icons: ['🏭', '⛲', '🌉', '🏡'],
  stopNames: ['Factory Entrance', 'Fountain Square', 'Old River Bridge', 'Home Sweet Home'],
  pins: {
    level1: { left: '14%', top: '78%' },
    level2: { left: '63%', top: '47%' },
    level3: { left: '83%', top: '68%' },
    chest: { left: '89%', top: '20%' },
  },
  accent: {
    pin: 'bg-teal-950/85', ping: 'bg-teal-400', ring: 'border-lime-300 bg-teal-950',
    num: 'bg-lime-300 text-teal-950', border: '#0f766e', tag: '#a7f3d0', when: 'text-teal-300',
  },
}

function DesertMap({ event }) { return <ImageMap event={event} cfg={DESERT_CFG} /> }
function WorldMap({ event }) { return <ImageMap event={event} cfg={WORLD_CFG} /> }
function BoardMap({ event }) { return <ImageMap event={event} cfg={BOARD_CFG} /> }
function TownMap({ event }) { return <ImageMap event={event} cfg={TOWN_CFG} /> }

/* ============ 2) QUEST MAP (adventure-game biomes) ============ */

function TrailNode({ side, gradient, ring, emoji, region, label, value, sub, stars = 3 }) {
  const text = (
    <div className={side === 'left' ? 'order-1 text-right' : 'order-3 text-left'}>
      <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">
        {region}
      </p>
      <p className="text-base font-extrabold text-white">{label}</p>
      <p className="text-sm font-semibold text-emerald-300">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  )
  return (
    <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
      {side === 'left' ? text : <div className="order-1" />}
      <div className="order-2 flex flex-col items-center">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br text-3xl shadow-lg shadow-black/50 ring-4 ${gradient} ${ring}`}
        >
          {emoji}
        </div>
        <div className="mt-1 text-[10px] leading-none text-amber-300">
          {'★'.repeat(stars)}
          <span className="text-slate-600">{'★'.repeat(Math.max(0, 3 - stars))}</span>
        </div>
      </div>
      {side === 'left' ? <div className="order-3" /> : text}
    </div>
  )
}

const BIOMES = [
  { icon: '🌲', gradient: 'from-emerald-700/80 to-emerald-950/90' },
  { icon: '🌋', gradient: 'from-orange-700/80 to-red-950/90' },
  { icon: '🧊', gradient: 'from-sky-700/80 to-blue-950/90' },
  { icon: '🏜️', gradient: 'from-amber-700/80 to-amber-950/90' },
  { icon: '🌊', gradient: 'from-cyan-700/80 to-teal-950/90' },
]

function QuestMap({ event }) {
  const dur = daysBetween(event.start_date, event.end_date)
  const nodes = [
    event.registration_deadline && {
      side: 'left',
      gradient: 'from-emerald-500 to-emerald-800',
      ring: 'ring-emerald-400/40',
      emoji: '🏕️',
      region: 'Base Camp · Forest',
      label: 'Registration closes',
      value: fmtDate(event.registration_deadline),
      sub: 'Enter before the gate shuts',
      stars: 1,
    },
    {
      side: 'right',
      gradient: 'from-sky-400 to-blue-700',
      ring: 'ring-sky-300/40',
      emoji: '🏔️',
      region: 'Ascent · Ice Peaks',
      label: 'The quest begins',
      value: fmtDate(event.start_date),
      sub: `Event starts — ${dur} day build window opens`,
      stars: 2,
    },
    {
      side: 'left',
      gradient: 'from-orange-500 to-red-700',
      ring: 'ring-orange-400/40',
      emoji: '🌋',
      region: 'Depths · Lava Core',
      label: 'The quest ends',
      value: fmtDate(event.end_date),
      sub: 'Ship before the eruption',
      stars: 3,
    },
  ].filter(Boolean)

  return (
    <div className="card relative overflow-hidden border-emerald-500/20 p-6 sm:p-8">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(50%_35%_at_85%_8%,rgba(249,115,22,0.14),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(45%_35%_at_10%_50%,rgba(56,189,248,0.12),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(55%_40%_at_90%_95%,rgba(16,185,129,0.12),transparent)]" />
        <div className="absolute bottom-2 left-2 select-none text-4xl opacity-30">🌲🌲</div>
        <div className="absolute right-3 top-3 select-none text-3xl opacity-30">🐉</div>
        <div className="absolute bottom-3 right-4 select-none text-3xl opacity-30">🌋</div>
      </div>

      <div className="relative">
        <h2 className="text-lg font-extrabold tracking-tight text-white">🗺️ Quest Map</h2>
        <p className="mb-6 text-sm font-medium text-slate-400">
          Your journey for <span className="font-bold text-indigo-300">{event.title}</span> — from
          base camp to the treasure vault.
        </p>

        <div className="relative space-y-6">
          <div
            aria-hidden
            className="absolute bottom-10 left-1/2 top-10 w-1 -translate-x-1/2 rounded-full bg-gradient-to-b from-emerald-400/30 via-sky-400/30 to-red-400/30"
          />
          <div className="flex justify-center">
            <span className="z-10 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              🚩 Start
            </span>
          </div>
          {nodes.map((n, i) => (
            <TrailNode key={i} {...n} />
          ))}

          <div className="flex justify-center">
            <div className="z-10 flex flex-col items-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-yellow-700 text-4xl shadow-lg shadow-black/50 ring-4 ring-amber-300/40">
                🏆
              </div>
              <p className="mt-1 text-[10px] text-amber-300">★★★</p>
              <p className="mt-1 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">
                Treasure Vault
              </p>
              {event.prize_pool ? (
                <p className="text-base font-extrabold text-amber-300">{event.prize_pool}</p>
              ) : (
                <p className="text-sm font-bold text-slate-300">Glory awaits</p>
              )}
            </div>
          </div>
        </div>

        {event.tracks?.length > 0 && (
          <div className="mt-8">
            <h3 className="mb-3 text-sm font-extrabold uppercase tracking-widest text-slate-400">
              ⚔️ Quest regions — pick your battlefield
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {event.tracks.map((t, i) => {
                const b = BIOMES[i % BIOMES.length]
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 rounded-xl border border-white/10 bg-gradient-to-br p-3 shadow-md ${b.gradient}`}
                  >
                    <div className="text-3xl drop-shadow">{b.icon}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold text-white">{t.name}</p>
                      <p className="text-xs font-bold text-amber-200 drop-shadow-sm">🪙 {t.prize}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ============ 3) TIMELINE (professional briefing) ============ */

function TimelineRow({ idx, title, when, desc, accent }) {
  return (
    <li className="relative pb-7 pl-10 last:pb-0">
      <span
        className={`absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold text-white ${accent}`}
      >
        {idx + 1}
      </span>
      <p className="text-sm font-extrabold text-white">{title}</p>
      <p className="text-sm font-semibold text-indigo-300">{when}</p>
      {desc && <p className="mt-1 text-sm leading-relaxed text-slate-400">{desc}</p>}
    </li>
  )
}

function EventTimeline({ event }) {
  const dur = daysBetween(event.start_date, event.end_date)
  const rows = [
    event.registration_deadline && {
      title: 'Registration deadline',
      when: fmtDate(event.registration_deadline),
      desc: 'Register and form your team before this date. Entries close automatically.',
      accent: 'bg-emerald-500',
    },
    {
      title: 'Event starts',
      when: fmtDate(event.start_date),
      desc: `The build window opens — ${event.mode}${event.location ? `, ${event.location}` : ''}.`,
      accent: 'bg-sky-500',
    },
    {
      title: 'Event ends',
      when: fmtDate(event.end_date),
      desc: `${dur}-day build window closes. Final submissions lock at this point.`,
      accent: 'bg-rose-500',
    },
  ].filter(Boolean)

  return (
    <div className="card p-6 sm:p-8">
      <h2 className="text-lg font-extrabold text-white">📋 Mission Briefing</h2>
      <p className="mb-6 text-sm text-slate-400">
        Everything on one clean timeline — when to register, when it starts, and when it ends.
      </p>

      <div className="relative">
        <div aria-hidden className="absolute bottom-2 left-[13px] top-2 w-0.5 bg-slate-700" />
        <ul>
          {rows.map((r, i) => (
            <TimelineRow key={i} idx={i} {...r} />
          ))}
        </ul>
      </div>

      {event.prize_pool && (
        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs font-extrabold uppercase tracking-widest text-amber-300">
            Prize pool
          </p>
          <p className="mt-1 text-2xl font-extrabold text-amber-200">{event.prize_pool}</p>
        </div>
      )}

      {event.tracks?.length > 0 && (
        <div className="mt-4 space-y-2">
          {event.tracks.map((t, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg bg-slate-950/60 px-4 py-2"
            >
              <span className="font-semibold text-slate-200">{t.name}</span>
              <span className="text-sm font-bold text-emerald-300">{t.prize}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ============ dispatcher ============ */

export const FULLSCREEN_STYLES = new Set([
  'treasure_map', 'desert_map', 'world_map', 'board_map', 'town_map',
])

export default function EventDisplay({ event }) {
  switch (event.display_style) {
    case 'quest_map':
      return <QuestMap event={event} />
    case 'timeline':
      return <EventTimeline event={event} />
    case 'desert_map':
      return <DesertMap event={event} />
    case 'world_map':
      return <WorldMap event={event} />
    case 'board_map':
      return <BoardMap event={event} />
    case 'town_map':
      return <TownMap event={event} />
    case 'treasure_map':
    default:
      return <TreasureMap event={event} />
  }
}
