import { useEffect, useState } from 'react'

/**
 * MacbookIntro — cinematic first-visit intro for the Aventi landing page.
 * - DESKTOP ONLY (screen < 768px ⇒ skipped entirely, site loads straight away)
 * - plays once per browser session (sessionStorage: aventi_intro_done)
 * - sequence: hand presses power → screen wakes → browser opens → "aventi" is
 *   typed into the search bar → site loads inside the tiny screen → one
 *   continuous center zoom fills the display → the real page settles to 100%.
 */
const CSS = `
  #avx-stage{ position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center;
    background: radial-gradient(1200px 600px at 50% 118%, #141a33 0%, transparent 60%),
                radial-gradient(900px 500px at 50% -10%, #10142c 0%, transparent 55%), #04050a; }
  #avx-fade{ transition: opacity .7s ease; }
  #avx-laptop{ position:relative; width:min(620px, 84vw); }
  #avx-lid{ background:linear-gradient(180deg,#2a2f3d,#171b26 60%, #10131c);
    border-radius:16px 16px 4px 4px; padding:12px 14px 10px;
    box-shadow:0 30px 80px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.08); }
  #avx-cam{ width:6px;height:6px;border-radius:50%; background:#0a0d16; margin:0 auto 6px;
    box-shadow:inset 0 0 2px 1px rgba(120,160,255,.5); }
  #avx-screen{ position:relative; aspect-ratio:16/10; background:#000; border-radius:8px; overflow:hidden;
    border:1px solid #0b0e18; transition:box-shadow 1s ease; }
  #avx-screen.on{ box-shadow:inset 0 0 60px rgba(140,160,255,.12); }
  #avx-turnline{ position:absolute; left:50%; top:50%; width:0; height:2px; border-radius:2px;
    transform:translate(-50%,-50%); background:linear-gradient(90deg,transparent,#dfe7ff,transparent);
    box-shadow:0 0 18px 4px rgba(190,205,255,.85); opacity:0; z-index:5; pointer-events:none; }
  #avx-turnline.go{ animation:avxturn .85s cubic-bezier(.5,0,.2,1) forwards; }
  @keyframes avxturn{ 0%{width:0;height:2px;opacity:1} 42%{width:100%;height:2px;opacity:1} 100%{width:100%;height:100%;opacity:0;border-radius:0} }
  #avx-glow{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    background:radial-gradient(circle at 50% 52%, rgba(160,180,255,.26), rgba(20,26,50,.85) 55%, #060810 100%);
    opacity:0; transition:opacity .9s cubic-bezier(.65,0,.15,1); z-index:3; }
  #avx-screen.on #avx-glow{ opacity:1; }
  #avx-logo{ font-size:34px; filter:drop-shadow(0 0 18px rgba(140,160,255,.9)); animation:avxpulse 1.3s ease-in-out infinite; opacity:0; transition:opacity .5s; }
  #avx-screen.on #avx-logo{ opacity:1; }
  @keyframes avxpulse{ 50%{ transform:scale(1.09); filter:drop-shadow(0 0 28px rgba(150,170,255,1)); } }
  #avx-browser{ position:absolute; inset:5% 6%; background:#141a2c; border-radius:8px; overflow:hidden;
    display:flex; flex-direction:column; opacity:0; transform:translateY(8px) scale(.97);
    transition:opacity .65s cubic-bezier(.65,0,.15,1), transform .65s cubic-bezier(.65,0,.15,1); z-index:4;
    box-shadow:0 8px 30px rgba(0,0,0,.5); }
  #avx-browser.show{ opacity:1; transform:translateY(0) scale(1); }
  .avx-bar{ display:flex; align-items:center; gap:5px; background:#0d1222; padding:5px 8px; }
  .avx-dot{ width:7px;height:7px;border-radius:50%; }
  .avx-dot.r{background:#ff5f57} .avx-dot.y{background:#febc2e} .avx-dot.g{background:#28c840}
  #avx-urlbar{ flex:1; margin-left:6px; background:#1b2340; border-radius:10px; height:17px;
    display:flex; align-items:center; padding:0 10px; font-size:9px; color:#c4d0ff; gap:5px;
    letter-spacing:.6px; white-space:nowrap; overflow:hidden; transition:background .3s, box-shadow .3s; }
  #avx-urlbar.flash{ background:#2d3a78; box-shadow:0 0 0 1px rgba(150,170,255,.5), 0 0 12px rgba(120,140,255,.35); }
  .avx-caret{ width:1.5px; height:9px; background:#cfd8ff; animation:avxblink .75s steps(1) infinite; }
  @keyframes avxblink{ 50%{opacity:0} }
  #avx-view{ flex:1; position:relative; background:#0a0e1c; overflow:hidden; display:flex; align-items:center; justify-content:center; }
  .avx-spin{ display:flex; gap:6px; }
  .avx-spin i{ width:7px;height:7px;border-radius:50%; background:#5f6fd8; animation:avxbnc 1s ease-in-out infinite; }
  .avx-spin i:nth-child(2){ animation-delay:.16s } .avx-spin i:nth-child(3){ animation-delay:.32s }
  @keyframes avxbnc{ 45%{ transform:translateY(-8px); opacity:1 } 0%,100%{ opacity:.55 } }
  #avx-vp{ position:absolute; inset:0; overflow:hidden; pointer-events:none; opacity:0; transition:opacity .6s ease; }
  #avx-vp.on{ opacity:1; }
  #avx-hinge{ height:6px; background:linear-gradient(180deg,#0c0f18,#05070c); border-radius:0 0 6px 6px; }
  #avx-base{ position:relative; height:15px; border-radius:4px 4px 14px 14px;
    background:linear-gradient(180deg,#39404f,#20242f 55%, #14171f);
    box-shadow:0 14px 30px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.1); }
  #avx-base::before{ content:''; position:absolute; left:6%; right:6%; top:2px; height:4px; border-radius:3px;
    background:linear-gradient(90deg,#171b26,#1e2432,#171b26); }
  #avx-power{ position:absolute; right:4.5%; top:2px; width:10px; height:10px; border-radius:50%;
    background:#0c0f18; box-shadow:inset 0 0 3px #000, 0 0 0 1px rgba(255,255,255,.07); transition:box-shadow .4s; }
  #avx-power.lit{ box-shadow:0 0 12px 3px rgba(120,220,140,.85), inset 0 0 3px #7fdc96; background:#123318; }
  #avx-hand{ position:fixed; left:62vw; top:118vh; width:80px; z-index:9999; pointer-events:none;
    transition:left 1.05s cubic-bezier(.55,.1,.2,1), top 1.05s cubic-bezier(.55,.1,.2,1), transform .4s cubic-bezier(.5,0,.3,1);
    transform:rotate(-14deg); filter:drop-shadow(0 10px 14px rgba(0,0,0,.5)); }
  #avx-hand.press{ transform:rotate(-11deg) scale(.92) translateY(5px); }
  #avx-tap{ position:absolute; width:26px;height:26px;border-radius:50%; border:2px solid rgba(150,255,190,.9);
    transform:translate(-50%,-50%) scale(.2); opacity:0; pointer-events:none; }
  #avx-tap.go{ animation:avxrip .6s ease-out forwards; }
  @keyframes avxrip{ 25%{opacity:1} 100%{ transform:translate(-50%,-50%) scale(1.6); opacity:0 } }
  #avx-skip{ position:fixed; right:22px; top:20px; z-index:10000; border:1px solid rgba(255,255,255,.16);
    background:rgba(16,20,40,.66); color:#c9d3ff; backdrop-filter:blur(6px); border-radius:999px;
    padding:9px 18px; font-size:13px; cursor:pointer; letter-spacing:.3px; transition:background .25s, transform .25s; }
  #avx-skip:hover{ background:rgba(40,50,100,.8); transform:translateY(-1px); }
  #avx-pill{ position:fixed; left:22px; bottom:18px; z-index:10000; font-size:12px; opacity:.75; color:#c9d3ff;
    border:1px solid rgba(255,255,255,.16); background:rgba(16,20,40,.66); backdrop-filter:blur(6px);
    border-radius:999px; padding:7px 14px; }
  #avx-clone, #avx-clone *{ animation:none !important; backdrop-filter:none !important; -webkit-backdrop-filter:none !important; }
`

export default function MacbookIntro() {
  const [show, setShow] = useState(() =>
    typeof window !== 'undefined' &&
    window.innerWidth >= 768 &&
    !sessionStorage.getItem('aventi_intro_done')
  )

  useEffect(() => {
    if (!show) return
    const style = document.createElement('style')
    style.id = 'avx-styles'
    style.textContent = CSS
    document.head.appendChild(style)

    const $ = (s) => document.querySelector(s)
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    let stopped = false
    document.body.style.overflow = 'hidden'

    const landingEl = document.getElementById('aventi-landing-root')

    const finish = () => {
      if (stopped) return
      stopped = true
      sessionStorage.setItem('aventi_intro_done', '1')
      if (landingEl) landingEl.style.cssText = ''
      document.body.style.overflow = ''
      setShow(false)
    }

    const skip = () => finish()

    let alive = true
    async function boot() {
      await sleep(1100); if (!alive || stopped) return

      /* hand glides to the power button */
      const hand = $('#avx-hand'), btn = $('#avx-power')
      if (!hand || !btn) return finish()
      const br = btn.getBoundingClientRect()
      hand.style.left = (br.left + br.width / 2 - 30) + 'px'
      hand.style.top = (br.top + 46) + 'px'
      await sleep(620); if (!alive || stopped) return
      hand.style.left = (br.left + br.width / 2 - 46) + 'px'
      hand.style.top = (br.top - 20) + 'px'
      await sleep(700); if (!alive || stopped) return

      /* finger press */
      hand.classList.add('press')
      const tap = $('#avx-tap')
      tap.style.cssText = `position:fixed;left:${br.left + br.width / 2}px;top:${br.top + br.height / 2}px;z-index:9999;`
      tap.classList.add('go')
      btn.classList.add('lit')
      await sleep(420); if (!alive || stopped) return
      hand.classList.remove('press')
      await sleep(300); if (!alive || stopped) return

      /* hand leaves, power-on line sweeps, screen wakes */
      hand.style.left = '64vw'; hand.style.top = '118vh'
      $('#avx-turnline').classList.add('go')
      await sleep(500); if (!alive || stopped) return
      $('#avx-screen').classList.add('on')
      await sleep(1500); if (!alive || stopped) return

      /* browser opens */
      $('#avx-glow').style.opacity = '0'
      $('#avx-logo').style.opacity = '0'
      $('#avx-browser').classList.add('show')
      await sleep(750); if (!alive || stopped) return

      /* typing "aventi" in the search bar */
      const urltext = $('#avx-urltext')
      for (const ch of 'aventi') {
        urltext.textContent += ch
        await sleep(120 + Math.random() * 70); if (!alive || stopped) return
      }
      await sleep(550); if (!alive || stopped) return

      /* enter */
      $('#avx-urlbar').classList.add('flash')
      await sleep(340); if (!alive || stopped) return
      $('#avx-urlbar').classList.remove('flash')
      $('#avx-spin').hidden = false
      await sleep(1050); if (!alive || stopped) return
      $('#avx-spin').hidden = true

      /* mini Aventi page fades in inside the tiny screen (a snapshot of the real page) */
      const vp = $('#avx-vp')
      vp.hidden = false
      const W = window.innerWidth
      const s0 = vp.clientWidth / W
      let clone = null
      if (landingEl) {
        clone = landingEl.cloneNode(true)
        clone.id = 'avx-clone'
        clone.style.cssText = `position:absolute;left:0;top:0;width:${W}px;transform:scale(${s0});transform-origin:top left;pointer-events:none;`
        vp.appendChild(clone)
      }
      requestAnimationFrame(() => vp.classList.add('on'))
      await sleep(1900); if (!alive || stopped) return

      /* one continuous natural zoom: camera pushes into the screen's centre till the
         MacBook screen fills the display, then the REAL page settles to 100% */
      const laptop = $('#avx-laptop')
      const lid = $('#avx-lid')
      const P = vp.getBoundingClientRect()
      const R = lid.getBoundingClientRect()
      const S = $('#avx-screen').getBoundingClientRect()
      const K = Math.max(window.innerWidth / S.width, window.innerHeight / S.height) * 1.04
      if (clone) clone.style.top = (vp.clientHeight / 2 - (window.innerHeight / 2) * s0) + 'px'
      const cx = P.left + P.width / 2, cy = P.top + P.height / 2
      lid.style.transformOrigin = `${cx - R.left}px ${cy - R.top}px`
      lid.style.willChange = 'transform'
      laptop.style.willChange = 'opacity'
      const kVis = Math.max(1.01, K * s0)
      await sleep(350); if (!alive || stopped) return

      requestAnimationFrame(() => requestAnimationFrame(() => {
        lid.style.transition = 'transform 1.45s cubic-bezier(.5,0,.1,1)'
        lid.style.transform = `scale(${K})`
      }))

      setTimeout(() => {
        if (!alive || stopped) return
        const stage = $('#avx-stage')
        if (landingEl) {
          landingEl.style.cssText = `transform:scale(${kVis});transform-origin:50% 50%;opacity:0;transition:none;`
        }
        stage.classList.add('avx-fading')
        stage.style.opacity = '0'
        if (landingEl) {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            landingEl.style.transition = 'transform .75s cubic-bezier(.2,.6,.25,1), opacity .65s ease'
            landingEl.style.transform = 'scale(1)'
            landingEl.style.opacity = '1'
          }))
        }
        setTimeout(() => { if (alive && !stopped) finish() }, 820)
      }, 1480)
    }

    boot().catch(() => { if (alive) finish() })

    const onClick = (e) => { if (!e.target.closest('#aventi-landing-root')) skip() }
    document.addEventListener('click', onClick)

    return () => {
      alive = false
      document.removeEventListener('click', onClick)
      if (!stopped) {
        if (landingEl) landingEl.style.cssText = ''
        document.body.style.overflow = ''
      }
      const st = document.getElementById('avx-styles')
      if (st) st.remove()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!show) return null

  return (
    <div id="avx-stage">
      <div id="avx-laptop">
        <div id="avx-lid">
          <div id="avx-cam"></div>
          <div id="avx-screen">
            <div id="avx-glow"><div id="avx-logo">⚡</div></div>
            <div id="avx-turnline"></div>
            <div id="avx-browser">
              <div className="avx-bar">
                <span className="avx-dot r"></span><span className="avx-dot y"></span><span className="avx-dot g"></span>
                <div id="avx-urlbar"><span style={{ fontSize: '8px', opacity: '.75' }}>🔍</span><span id="avx-urltext"></span><span className="avx-caret"></span></div>
              </div>
              <div id="avx-view">
                <div className="avx-spin" id="avx-spin" hidden><i></i><i></i><i></i></div>
                <div id="avx-vp" hidden></div>
              </div>
            </div>
          </div>
        </div>
        <div id="avx-hinge"></div>
        <div id="avx-base"><div id="avx-power"></div></div>
      </div>

      <svg id="avx-hand" viewBox="0 0 100 118" aria-hidden="true">
        <g>
          <rect x="36" y="0" width="20" height="58" rx="10" fill="#f3c9a1" stroke="#d9a878" strokeWidth="3" />
          <rect x="10" y="46" width="70" height="62" rx="18" fill="#f3c9a1" stroke="#d9a878" strokeWidth="3" />
          <ellipse cx="14" cy="72" rx="12" ry="16" fill="#f3c9a1" stroke="#d9a878" strokeWidth="3" transform="rotate(24 14 72)" />
          <rect x="40" y="84" width="20" height="10" rx="5" fill="none" stroke="#d9a878" strokeWidth="3" opacity=".7" />
        </g>
      </svg>
      <div id="avx-tap"></div>

      <button id="avx-skip" onClick={() => {
        sessionStorage.setItem('aventi_intro_done', '1')
        const landingEl = document.getElementById('aventi-landing-root')
        if (landingEl) landingEl.style.cssText = ''
        document.body.style.overflow = ''
        setShow(false)
      }}>Skip intro →</button>
      <div id="avx-pill">⚡ Aventi — click anywhere to skip</div>
    </div>
  )
}
