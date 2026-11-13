/* fx.js: sound effects, optional lo-fi study music, haptics, confetti and toasts.
   Everything is synthesized with the Web Audio API, so there are no audio files.
   Sound effects default to on, music to off; both toggles are remembered per device. */
(function () {
  'use strict';
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('fx-' + k); return v == null ? d : v === '1'; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('fx-' + k, v ? '1' : '0'); } catch (e) {} }
  };
  let sfxOn = ls.get('sfx', true), musicOn = ls.get('music', false);

  /* ---------- styles ---------- */
  const css = `
  .fxctl{display:flex;gap:6px;flex:none}
  .fxbtn{width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:var(--surface);color:var(--muted);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transition:transform .12s,color .15s,border-color .15s}
  .fxbtn svg{width:18px;height:18px}
  .fxbtn[aria-pressed="true"]{color:var(--accent,var(--c,var(--ink)));border-color:var(--accent,var(--c,var(--ink)))}
  .fxbtn.music[aria-pressed="true"] svg{animation:fxbob 1.6s ease-in-out infinite}
  @keyframes fxbob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-2px) rotate(-6deg)}}
  button,a.opt,a.back,.chip,.qopt,.tab,.jump,.btn{-webkit-tap-highlight-color:transparent}
  @media (prefers-reduced-motion: no-preference){
    button:not(:disabled),a.opt,a.back,.pills a{transition:transform .12s ease, background-color .15s, border-color .15s, color .15s, opacity .15s}
    button:not(:disabled):active,a.opt:active,a.back:active,.pills a:active{transform:scale(.96)}
    .qopt.ok{animation:fxpop .38s cubic-bezier(.3,1.6,.5,1)}
    .qopt.no,.qdrop select.no{animation:fxshake .4s ease}
    .qdrop select.ok{animation:fxpop .38s cubic-bezier(.3,1.6,.5,1)}
    .qfb{animation:fxrise .25s ease}
    .qcard.enter{animation:fxin .28s ease}
    .qstat.bump b{animation:fxbump .45s cubic-bezier(.3,1.6,.5,1)}
    .gotit[aria-pressed="true"]{animation:fxpop .35s cubic-bezier(.3,1.6,.5,1)}
    .fscene{transition:transform .22s ease,opacity .22s ease}
    .fscene.dragging{transition:none}
    .fscene.out-r{transform:translateX(120%) rotate(14deg)!important;opacity:0}
    .fscene.out-l{transform:translateX(-120%) rotate(-14deg)!important;opacity:0}
    .fscene.enter{animation:fxdeal .3s cubic-bezier(.2,.8,.3,1)}
  }
  @keyframes fxpop{0%{transform:scale(1)}40%{transform:scale(1.05)}100%{transform:scale(1)}}
  @keyframes fxshake{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(3px)}}
  @keyframes fxrise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  @keyframes fxin{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
  @keyframes fxbump{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}
  @keyframes fxdeal{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
  .fscene .stamp{position:absolute;top:56px;z-index:3;font-weight:800;font-size:1rem;letter-spacing:.06em;text-transform:uppercase;padding:4px 10px;border-radius:8px;border:2.5px solid;opacity:0;pointer-events:none;transition:opacity .1s}
  .fscene .stamp.r{left:18px;color:var(--good);border-color:var(--good);transform:rotate(-12deg)}
  .fscene .stamp.l{right:18px;color:var(--trap);border-color:var(--trap);transform:rotate(12deg)}
  .fxtoast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translate(-50%,20px);background:var(--ink);color:var(--bg,#fff);font-weight:700;padding:10px 18px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.2);opacity:0;pointer-events:none;z-index:60;transition:opacity .2s,transform .25s cubic-bezier(.3,1.5,.5,1);white-space:nowrap;font-family:var(--font-display,inherit)}
  .fxtoast.show{opacity:1;transform:translate(-50%,0)}
  .fxconfetti{position:fixed;inset:0;pointer-events:none;z-index:55}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------- audio engine ---------- */
  let ctx = null, master = null, sfxBus = null, musicBus = null;
  function audio() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
    return ctx;
  }
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  // One shaped note. opts: type, dur, vol, attack, at (delay seconds), slideTo (Hz), bus, cutoff
  function tone(freq, o) {
    const c = audio(); if (!c) return;
    o = o || {};
    const t = c.currentTime + (o.at || 0), dur = o.dur || 0.15, a = o.attack || 0.005;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.cutoff) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.cutoff; osc.connect(f); node = f; }
    node.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  let noiseBuf = null;
  function noise(o) {
    const c = audio(); if (!c) return;
    o = o || {};
    if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = c.currentTime + (o.at || 0), dur = o.dur || 0.12;
    const src = c.createBufferSource(); src.buffer = noiseBuf;
    const f = c.createBiquadFilter(); f.type = o.ftype || 'bandpass'; f.frequency.setValueAtTime(o.from || 1200, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    f.Q.value = o.q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t + (o.attack || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  const buzz = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };

  const S = {
    click()   { tone(1250, { dur: 0.045, vol: 0.05, type: 'sine', slideTo: 900 }); },
    tick()    { tone(880, { dur: 0.08, vol: 0.1, type: 'triangle' }); tone(1320, { dur: 0.12, vol: 0.08, type: 'triangle', at: 0.06 }); },
    untick()  { tone(660, { dur: 0.1, vol: 0.07, type: 'triangle', slideTo: 440 }); },
    correct() { [72, 76, 79].forEach((m, i) => tone(hz(m), { dur: 0.22, vol: 0.13, type: 'triangle', at: i * 0.065 })); tone(hz(84), { dur: 0.35, vol: 0.06, type: 'sine', at: 0.2 }); },
    wrong()   { tone(196, { dur: 0.22, vol: 0.12, type: 'square', slideTo: 140, cutoff: 900 }); tone(185, { dur: 0.28, vol: 0.08, type: 'square', slideTo: 120, cutoff: 700, at: 0.12 }); },
    flip()    { noise({ dur: 0.16, vol: 0.09, from: 600, to: 3200, q: 0.8 }); },
    swoosh()  { noise({ dur: 0.22, vol: 0.08, from: 2500, to: 500, q: 0.7 }); },
    got()     { noise({ dur: 0.2, vol: 0.06, from: 2500, to: 500, q: 0.7 }); [79, 84].forEach((m, i) => tone(hz(m), { dur: 0.25, vol: 0.1, type: 'triangle', at: 0.05 + i * 0.07 })); },
    again()   { noise({ dur: 0.2, vol: 0.06, from: 2000, to: 400, q: 0.7 }); tone(hz(64), { dur: 0.2, vol: 0.07, type: 'sine', at: 0.05, slideTo: hz(60) }); },
    streak(n) { const base = 72 + Math.min(12, Math.floor(n / 5) * 2); [0, 4, 7, 12, 16].forEach((s, i) => tone(hz(base + s), { dur: 0.3, vol: 0.1, type: 'triangle', at: i * 0.06 })); },
    fanfare() { [[72, 0], [76, 0.12], [79, 0.24], [84, 0.38], [79, 0.52], [84, 0.62]].forEach(([m, t], i) => tone(hz(m), { dur: i === 5 ? 0.7 : 0.18, vol: 0.12, type: 'triangle', at: t })); [48, 55, 60].forEach(m => tone(hz(m), { dur: 1.2, vol: 0.06, type: 'sine', at: 0.62 })); },
    tab()     { tone(1000, { dur: 0.06, vol: 0.06, type: 'triangle', slideTo: 1400 }); }
  };
  function play(name, arg) { if (!sfxOn) return; try { S[name](arg); } catch (e) {} }

  /* ---------- lo-fi study music (generative) ---------- */
  // Am9, Fmaj7, Cmaj7, G6: a gentle loop at 72 bpm with pads, a soft arpeggio, bass and a quiet hat.
  const CHORDS = [
    { root: 45, notes: [57, 60, 64, 67, 71] },
    { root: 41, notes: [57, 60, 64, 65, 69] },
    { root: 48, notes: [55, 59, 60, 64, 67] },
    { root: 43, notes: [55, 59, 62, 64, 67] }
  ];
  const BPM = 72, EIGHTH = 60 / BPM / 2;
  let musicTimer = null, nextT = 0, step = 0;
  function schedule() {
    const c = ctx; if (!c) return;
    while (nextT < c.currentTime + 0.4) {
      const bar = Math.floor(step / 8) % CHORDS.length, pos = step % 8, ch = CHORDS[bar], at = nextT - c.currentTime;
      const mb = { bus: musicBus };
      if (pos === 0) {
        ch.notes.slice(0, 4).forEach(m => tone(hz(m), Object.assign({ dur: EIGHTH * 8 + 0.6, vol: 0.035, type: 'sine', attack: 0.5, at, cutoff: 1100 }, mb)));
        ch.notes.slice(0, 3).forEach(m => tone(hz(m) * 1.004, Object.assign({ dur: EIGHTH * 8 + 0.4, vol: 0.018, type: 'triangle', attack: 0.7, at, cutoff: 800 }, mb)));
      }
      if (pos === 0 || pos === 5) tone(hz(ch.root), Object.assign({ dur: EIGHTH * 3, vol: 0.12, type: 'sine', attack: 0.02, at }, mb));
      if (Math.random() < (pos % 2 ? 0.45 : 0.75)) {
        const m = pick(ch.notes) + 12;
        tone(hz(m), Object.assign({ dur: 0.9, vol: 0.03, type: 'triangle', attack: 0.01, at: at + (pos % 2 ? 0.03 : 0), cutoff: 2200 }, mb));
      }
      if (pos % 2 === 1) noise({ bus: musicBus, at, dur: 0.05, vol: 0.012, from: 7000, ftype: 'highpass' });
      if (pos === 0 || pos === 4) noise({ bus: musicBus, at, dur: 0.12, vol: 0.05, from: 120, to: 50, ftype: 'lowpass' });
      nextT += EIGHTH; step++;
    }
  }
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function startMusic() {
    const c = audio(); if (!c || musicTimer) return;
    nextT = c.currentTime + 0.1; step = 0;
    musicBus.gain.cancelScheduledValues(c.currentTime);
    musicBus.gain.setValueAtTime(musicBus.gain.value, c.currentTime);
    musicBus.gain.linearRampToValueAtTime(0.55, c.currentTime + 2);
    schedule(); musicTimer = setInterval(schedule, 100);
  }
  function stopMusic() {
    if (!ctx || !musicTimer) return;
    clearInterval(musicTimer); musicTimer = null;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(musicBus.gain.value, ctx.currentTime);
    musicBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
  }
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } ctx.suspend().catch(() => {}); }
    else { ctx.resume().catch(() => {}); if (musicOn) startMusic(); }
  });
  // Browsers only allow audio after a tap, so remembered music starts on the first interaction.
  let unlocked = false;
  function unlock() { if (unlocked) return; unlocked = true; audio(); if (musicOn) startMusic(); }
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

  /* ---------- confetti ---------- */
  function confetti(x, y, n) {
    if (reduceMotion) return;
    const cv = document.createElement('canvas'); cv.className = 'fxconfetti';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; document.body.appendChild(cv);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const cs = getComputedStyle(document.documentElement);
    const cols = ['--accent', '--good', '--check', '--trap', '--sky', '--dm', '--ai', '--nw'].map(v => cs.getPropertyValue(v).trim()).filter(Boolean);
    if (!cols.length) cols.push('#e4572e', '#29a36a', '#f2b134', '#3d6fd8');
    x = x == null ? innerWidth / 2 : x; y = y == null ? innerHeight / 3 : y;
    const P = Array.from({ length: n || 90 }, () => {
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 7;
      return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 5, w: 5 + Math.random() * 6, h: 3 + Math.random() * 4, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: pick(cols), life: 0 };
    });
    let f = 0;
    (function frame() {
      g.clearRect(0, 0, innerWidth, innerHeight);
      P.forEach(p => { p.vy += 0.22; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.globalAlpha = Math.max(0, 1 - f / 110); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); });
      if (++f < 110) requestAnimationFrame(frame); else cv.remove();
    })();
  }
  function centerOf(el) { if (!el) return [null, null]; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }

  /* ---------- toast ---------- */
  let toastEl = null, toastT = 0;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'fxtoast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  /* ---------- toggles in the top bar ---------- */
  const ICON_SFX_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';
  const ICON_SFX_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>';
  const ICON_MUSIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
  function controls() {
    const host = document.querySelector('.cnav .in') || document.querySelector('.top');
    if (!host) return;
    const box = document.createElement('div'); box.className = 'fxctl';
    box.innerHTML = '<button type="button" class="fxbtn sfx"></button><button type="button" class="fxbtn music">' + ICON_MUSIC + '</button>';
    const back = host.querySelector('.back');
    if (host.classList.contains('top')) { box.style.marginLeft = 'auto'; host.appendChild(box); }
    else if (back) back.after(box); else host.prepend(box);
    const bS = box.querySelector('.sfx'), bM = box.querySelector('.music');
    const paint = () => {
      bS.innerHTML = sfxOn ? ICON_SFX_ON : ICON_SFX_OFF; bS.setAttribute('aria-pressed', sfxOn);
      bS.setAttribute('aria-label', sfxOn ? 'Sound effects on' : 'Sound effects off'); bS.title = bS.getAttribute('aria-label');
      bM.setAttribute('aria-pressed', musicOn); bM.setAttribute('aria-label', musicOn ? 'Study music on' : 'Study music off'); bM.title = bM.getAttribute('aria-label');
    };
    bS.addEventListener('click', () => { sfxOn = !sfxOn; ls.set('sfx', sfxOn); paint(); if (sfxOn) play('tick'); toast(sfxOn ? 'Sound effects on' : 'Sound effects off'); });
    bM.addEventListener('click', () => { musicOn = !musicOn; ls.set('music', musicOn); paint(); if (musicOn) startMusic(); else stopMusic(); toast(musicOn ? '♫ Lo-fi study music on' : 'Music off'); });
    paint();
  }

  /* ---------- automatic feedback for ordinary clicks ---------- */
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('button, a, .chip, summary');
    if (!t || t.closest('.fxctl')) return;
    if (t.matches('.qopt, [data-act], #pfCard, .moreb, .more')) return;  // these get their own sounds
    if (t.matches('.gotit')) { if (t.getAttribute('aria-pressed') === 'true') { play('tick'); buzz(12); } else play('untick'); return; }
    if (t.matches('.tab, [data-mode], .pills a')) { play('tab'); buzz(8); return; }
    if (t.matches('.chip')) { play(t.getAttribute('aria-expanded') === 'true' ? 'swoosh' : 'click'); return; }
    play('click'); buzz(6);
  });
  // Grading the full practice test: celebrate a good score.
  document.addEventListener('click', e => {
    const g = e.target.closest && e.target.closest('#gradeAll, #gradeAll2');
    if (!g) return;
    setTimeout(() => {
      const m = /([\d.]+)\s*\/\s*(\d+)/.exec((document.getElementById('total') || {}).textContent || '');
      if (!m) return;
      const pct = +m[1] / +m[2];
      if (pct >= 0.7) { play('fanfare'); confetti(null, null, 140); toast(pct >= 0.9 ? 'Outstanding! ' + Math.round(pct * 100) + '%' : 'Nice work! ' + Math.round(pct * 100) + '%'); }
      else play('tick');
    }, 60);
  });

  /* ---------- public API for play.js ---------- */
  window.FX = {
    reduceMotion,
    correct(el) { play('correct'); buzz(15); if (el) { const [x, y] = centerOf(el); confetti(x, y, 26); } },
    wrong() { play('wrong'); buzz([30, 40, 30]); },
    streak(n, el) {
      if (n >= 3 && (n === 3 || n % 5 === 0)) {
        play('streak', n); const [x, y] = centerOf(el); confetti(x, y, 50 + Math.min(100, n * 6));
        toast(n >= 20 ? '\u{1F525} ' + n + ' in a row! Unstoppable' : n >= 10 ? '\u{1F525} ' + n + ' in a row! On fire' : '\u{1F525} ' + n + ' in a row!');
      }
    },
    best(n) { if (n >= 3) toast('\u{1F3C6} New best streak: ' + n); },
    flip() { play('flip'); buzz(5); },
    got() { play('got'); buzz(10); },
    again() { play('again'); buzz(18); },
    done() { play('fanfare'); confetti(null, null, 160); },
    play, toast, confetti
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', controls); else controls();
})();
