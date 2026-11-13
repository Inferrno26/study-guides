/* Play tab: Quick quiz (one random question at a time) and Flashcards.
   Loaded after each guide's own script; reuses its MCQ, TF, PARAS, BANK and LESSONS data
   and its "learned" progress (known / toggleKnown). */
(function () {
  'use strict';
  if (typeof LESSONS === 'undefined' || !document.querySelector('.tabs')) return;

  /* ---------- helpers ---------- */
  const COURSE = (typeof STORE_KEY === 'string' ? STORE_KEY : 'guide').replace(/-known.*$/, '');
  const $ = (sel, root) => (root || document).querySelector(sel);
  const scratch = document.createElement('div');
  const strip = html => { scratch.innerHTML = String(html); return scratch.textContent.replace(/\s+/g, ' ').trim(); };
  const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const store = {
    get(k, d) { try { const s = getStore(); const v = s && s.getItem(COURSE + '-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { const s = getStore(); if (s) s.setItem(COURSE + '-' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const fx = (name, ...args) => { try { if (window.FX && FX[name]) FX[name](...args); } catch (e) {} };
  const replay = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const P = window.PROG || null;
  const SLUG = (location.pathname.split('/').filter(Boolean).pop() || '').replace(/\.html$/, '');
  const sid = q => q.key ? 'i:' + q.key : q.id;
  const pct = x => Math.round((x || 0) * 100) + '%';

  /* ---------- idea data ---------- */
  const IDEAS = [];
  LESSONS.forEach(les => {
    if (/lab/i.test(les.id)) return;
    les.ideas.forEach(it => {
      if (it.lab) return;
      const k = strip(it.k), t = strip(it.t);
      if (!k || !t) return;
      IDEAS.push({ les, it, k, t, key: les.id + ':' + it.k.replace(/<[^>]+>/g, '') });
    });
  });
  const TOPICS = LESSONS.filter(les => IDEAS.some(x => x.les === les));
  if (P) P.saveMeta(COURSE, TOPICS.map(l => ({ id: l.id, short: l.short, keys: IDEAS.filter(x => x.les === l).map(x => x.key) })));
  const ideaEl = key => Array.from(document.querySelectorAll('.idea')).find(el => el.dataset.key === key);
  const isKnown = key => typeof known !== 'undefined' && known.has(key);
  function markKnown(key) {
    if (isKnown(key)) return;
    const el = ideaEl(key);
    if (el && typeof toggleKnown === 'function') toggleKnown(el);
  }
  function goToIdea(key) {
    showTab('ideas');
    const el = ideaEl(key); if (!el) return;
    if (el.style.display === 'none') { const s = $('#q'); if (s && s.value) { s.value = ''; s.dispatchEvent(new Event('input')); } }
    setOpen(el, true);
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' }), 30);
  }
  // Other ideas to use as wrong answers: same topic first, then the rest.
  function others(x, n, field) {
    const seen = new Set([x[field].toLowerCase()]);
    const out = [];
    const add = list => { for (const y of shuffle(list)) { const v = y[field]; if (out.length >= n) break; if (!seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(y); } } };
    add(IDEAS.filter(y => y.les === x.les && y !== x));
    if (out.length < n) add(IDEAS.filter(y => y.les !== x.les));
    return out;
  }
  const mentions = (x) => x.k.length > 3 && x.t.toLowerCase().includes(x.k.toLowerCase());

  /* ---------- question pools ---------- */
  function fillBlankQuestions() {
    const out = [];
    if (typeof PARAS === 'undefined') return out;
    PARAS.forEach((p, pIdx) => {
      p.parts.forEach((part, pi) => {
        if (typeof part !== 'number') return;
        // Build the paragraph with this blank as a marker and the other blanks filled in.
        let full = '';
        p.parts.forEach((x, xi) => { full += typeof x === 'number' ? (xi === pi ? '\u0000' : '<b>' + p.ans[x] + '</b>') : x; });
        full = full.replace(/\s+([.,;:!?])/g, '$1').replace(/\s+/g, ' ');
        const m = full.indexOf('\u0000');
        const endRe = /[.!?]\s+(?=[A-Z0-9<"(])/g;
        let start = 0, end = full.length, r;
        while ((r = endRe.exec(full))) { const stop = r.index + 1; if (stop <= m) start = r.index + r[0].length; else { end = stop; break; } }
        const sent = full.slice(start, end).trim();
        const [before, after] = sent.split('\u0000');
        const answer = p.ans[part];
        const inSentence = new Set(p.ans.filter(a => sent.includes('<b>' + a + '</b>')).concat(answer).map(a => a.toLowerCase()));
        const pool = (typeof BANK !== 'undefined' ? BANK : p.ans).filter(w => !inSentence.has(w.toLowerCase()));
        const opts = shuffle([answer].concat(shuffle(pool).slice(0, 3)));
        out.push({ type: 'drop', src: 'Practice test', id: 'q:para:' + pIdx + ':' + part, before, after, o: opts, a: opts.indexOf(answer),
          e: 'From ' + p.title.replace(/^Paragraph \d+:\s*/, '') + ' in the practice test.' });
      });
    });
    return out;
  }
  function buildPools() {
    const pools = { mcq: [], tf: [], drop: [] };
    (typeof MCQ !== 'undefined' ? MCQ : []).forEach((x, i) => pools.mcq.push({ type: 'mcq', src: 'Practice test', id: 'q:mcq:' + i, q: x.q, o: x.o, a: x.a, e: x.e }));
    (typeof TF !== 'undefined' ? TF : []).forEach((x, i) => pools.tf.push({ type: 'tf', src: 'Practice test', id: 'q:tf:' + i, q: x.q, a: x.a, e: x.e }));
    pools.drop = fillBlankQuestions();
    IDEAS.forEach(x => {
      const src = x.les.short;
      // Multiple choice: which description fits the term?
      const wrongD = others(x, 3, 't');
      if (wrongD.length >= 2) {
        const opts = shuffle([x].concat(wrongD));
        pools.mcq.push({ type: 'mcq', src, topic: x.les.id, key: x.key, q: 'Which description fits <b>' + x.k + '</b>?', o: opts.map(y => y.t), a: opts.indexOf(x), e: '<b>' + x.k + '</b>: ' + x.t });
      }
      // True / false: right or swapped description.
      const swap = others(x, 1, 't')[0];
      const truth = !swap || Math.random() < 0.5;
      pools.tf.push({ type: 'tf', src, topic: x.les.id, key: x.key,
        q: '<b>' + x.k + '</b> means: ' + (truth ? x.t : swap.t), a: truth,
        e: truth ? 'Yes, that is the right description.' : 'That describes <b>' + swap.k + '</b>. <b>' + x.k + '</b> means: ' + x.t });
      // Drop-down: pick the term for a description.
      if (!mentions(x)) {
        const wrongK = others(x, 3, 'k');
        if (wrongK.length >= 2) {
          const opts = shuffle([x].concat(wrongK));
          pools.drop.push({ type: 'drop', src, topic: x.les.id, key: x.key, desc: x.t, o: opts.map(y => y.k), a: opts.indexOf(x), e: '<b>' + x.k + '</b>: ' + x.t });
        }
      }
    });
    return pools;
  }

  /* ---------- tab + panel wiring ---------- */
  const tabs = $('.tabs');
  const tab = document.createElement('button');
  tab.className = 'tab'; tab.id = 'tab-play'; tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'false'); tab.setAttribute('aria-controls', 'panel-play');
  tab.textContent = 'Play';
  tabs.appendChild(tab);

  const panel = document.createElement('div');
  panel.id = 'panel-play'; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', 'tab-play');
  panel.innerHTML =
    (P ? '<div class="hud" id="phud"></div>' : '') +
    '<div class="pmodes" role="group" aria-label="Game mode">' +
      (P ? '<button type="button" data-mode="review" aria-pressed="false">Review<span class="pcount" id="pDue" hidden></span></button>' : '') +
      '<button type="button" data-mode="quiz" aria-pressed="true">Quick quiz</button>' +
      '<button type="button" data-mode="cards" aria-pressed="false">Flashcards</button>' +
    '</div><div id="pr" hidden></div><div id="pq"></div><div id="pf" hidden></div>';
  $('main').appendChild(panel);

  let playOn = false;
  let mode = store.get('mode', 'quiz'); if (!['quiz', 'cards', 'review'].includes(mode) || (mode === 'review' && !P)) mode = 'quiz';
  const hashFor = m => m === 'cards' ? 'cards' : m === 'review' ? 'review' : 'play';
  const origRender = render, origShowTab = showTab, origToggle = togglePanel;

  window.render = function () {
    if (!playOn) {
      panel.style.display = 'none'; document.body.classList.remove('play');
      tab.setAttribute('aria-selected', 'false');
      origRender(); return;
    }
    document.body.classList.remove('split'); document.body.classList.add('play');
    $('#panel-ideas').style.display = 'none'; $('#panel-test').style.display = 'none';
    panel.style.display = 'block';
    $('#tab-ideas').setAttribute('aria-selected', 'false'); $('#tab-test').setAttribute('aria-selected', 'false');
    tab.setAttribute('aria-selected', 'true');
    ['tab-ideas', 'tab-test'].forEach(id => $('#' + id).title = '');
    $('main').classList.add('one');
    const foot = $('footer'); if (typeof FOOT_HOME !== 'undefined' && foot) FOOT_HOME.appendChild(foot);
    setBarH();
  };
  window.showTab = function (name) {
    if (name === 'play' || name === 'quiz' || name === 'cards' || name === 'review') {
      if (name !== 'play') mode = name;
      playOn = true; current = 'play';
      const was = document.body.classList.contains('play');
      render(); setHash(hashFor(mode)); paintMode();
      if (!was) window.scrollTo(0, 0);
      return;
    }
    playOn = false; origShowTab(name);
  };
  window.togglePanel = function (name) {
    if (playOn) {
      playOn = false;
      if (isSplit()) { vis.ideas = name === 'ideas'; vis.test = name === 'test'; }
      origShowTab(name); return;
    }
    origToggle(name);
  };
  tab.addEventListener('click', () => showTab('play'));
  try { splitMQ.addEventListener('change', () => { if (playOn) render(); }); } catch (e) { try { splitMQ.addListener(() => { if (playOn) render(); }); } catch (e2) {} }
  window.addEventListener('hashchange', e => { let h = getHash(); try { h = new URL(e.newURL).hash || h; } catch (err) {} if (h === '#play' || h === '#quiz') showTab('quiz'); else if (h === '#cards') showTab('cards'); else if (h === '#review' && P) showTab('review'); });

  panel.querySelector('.pmodes').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    mode = b.dataset.mode; store.set('mode', mode); setHash(hashFor(mode)); paintMode();
  });
  function paintMode() {
    panel.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode));
    if (mode === 'quiz' && Quiz.reviewing()) Quiz.exitReview();
    const showQuiz = mode === 'quiz' || (mode === 'review' && Quiz.reviewing());
    $('#pq').hidden = !showQuiz; $('#pf').hidden = mode !== 'cards'; $('#pr').hidden = !(mode === 'review' && !Quiz.reviewing());
    if (showQuiz) Quiz.show(); else if (mode === 'cards') Cards.show(); else Review.show();
    paintHud();
  }
  function setMode(m) { mode = m; store.set('mode', m); setHash(hashFor(m)); paintMode(); }

  /* ---------- Quick quiz ---------- */
  const KIND = { mcq: 'Multiple choice', tf: 'True or false', drop: 'Drop-down' };
  const Quiz = (function () {
    const root = $('#pq');
    let newBest = false;
    let pools = buildPools(), decks = {}, filter = 'all', topic = 'all', cur = null, answered = false;
    const stats = { n: 0, ok: 0, streak: 0, best: store.get('quiz-best', 0) };
    let started = false;

    let reviewQ = null, rTotal = 0, rRight = 0, rStart = 0, requeued = new Set();
    function eligible(type) { return pools[type].filter(q => topic === 'all' || q.topic === topic); }
    // Weak spots: weight each question by how badly it (or its idea) is known and by topic mastery.
    function drawWeak() {
      const srs = P ? P.getSrs(COURSE) : {};
      const tm = {}; TOPICS.forEach(l => { tm[l.id] = P ? (P.topicMastery(COURSE, l.id) || 0) : 0; });
      const all = ['mcq', 'tf', 'drop'].reduce((a, t) => a.concat(eligible(t)), []).filter(q => q !== cur);
      if (!all.length) return null;
      const w = all.map(q => {
        const r = srs[sid(q)];
        let v = r ? (1 - P.boxScore(r.b)) + Math.min(1.2, r.w * 0.4) : (q.key ? 0.8 : 0.5);
        if (q.topic) v *= 0.5 + (1 - tm[q.topic]);
        if (r && r.d > P.today() && r.b >= 3) v *= 0.15;   // recently mastered: rarely
        return Math.max(0.02, v);
      });
      let x = Math.random() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < all.length; i++) { x -= w[i]; if (x <= 0) return all[i]; }
      return all[all.length - 1];
    }
    function questionFor(id) {
      if (id.startsWith('i:')) {
        const key = id.slice(2);
        const c = ['mcq', 'tf', 'drop'].reduce((a, t) => a.concat(pools[t].filter(q => q.key === key)), []);
        return c.length ? pick(c) : null;
      }
      return ['mcq', 'tf', 'drop'].reduce((f, t) => f || pools[t].find(q => q.id === id), null);
    }
    function draw() {
      if (filter === 'weak') return drawWeak();
      const types = (filter === 'all' ? ['mcq', 'tf', 'drop'] : [filter]).filter(t => eligible(t).length);
      if (!types.length) return null;
      const type = pick(types);
      if (!decks[type] || !decks[type].length) {
        if (decks[type]) pools = buildPools(); // reshuffle generated true/false once a deck runs out
        decks[type] = shuffle(eligible(type));
        if (cur && decks[type].length > 1 && decks[type][decks[type].length - 1] === cur) decks[type].unshift(decks[type].pop());
      }
      return decks[type].pop();
    }
    function resetDecks() { decks = {}; }

    function frame() {
      const topicOpts = '<option value="all">All topics</option>' + TOPICS.map(l => '<option value="' + l.id + '">' + l.short + '</option>').join('');
      root.innerHTML =
        '<div class="pfilters" role="group" aria-label="Question type">' +
          ['all', 'mcq', 'tf', 'drop'].concat(P ? ['weak'] : []).map(t => '<button type="button" data-f="' + t + '" aria-pressed="' + (t === filter) + '"' + (t === 'weak' ? ' class="weakf"' : '') + '>' + (t === 'all' ? 'Mixed' : t === 'weak' ? '\u{1F3AF} Weak spots' : KIND[t]) + '</button>').join('') +
          '<select id="pqTopic" aria-label="Topic">' + topicOpts + '</select>' +
        '</div>' +
        '<div class="rbanner" id="pqBanner" hidden><span id="pqBannerTxt"></span><button type="button" class="jump" id="pqExit">End review</button></div>' +
        '<div class="qstats"><div class="qstat"><b id="pqScore">0/0</b><span>Correct</span></div><div class="qstat hot"><b id="pqStreak">0</b><span>Streak</span></div><div class="qstat"><b id="pqBest">' + stats.best + '</b><span>Best streak</span></div></div>' +
        '<div class="qcard" id="pqCard" aria-live="polite"></div>';
      $('#pqTopic', root).value = topic;
    }
    function paintStats() {
      $('#pqScore', root).textContent = stats.ok + '/' + stats.n;
      $('#pqStreak', root).textContent = stats.streak ? '\u{1F525} ' + stats.streak : '0';
      $('#pqBest', root).textContent = stats.best;
    }
    function paintBanner() {
      const b = $('#pqBanner', root); if (!b) return;
      b.hidden = reviewQ === null; root.classList.toggle('reviewing', reviewQ !== null);
      if (reviewQ !== null) $('#pqBannerTxt', root).textContent = '\u{1F9F9} Daily review \u00b7 ' + Math.min(rTotal, rTotal - reviewQ.length) + ' of ' + rTotal;
    }
    function finishReview() {
      const card = $('#pqCard', root), n = rStart, ok = rRight;
      reviewQ = null; paintBanner(); cur = null;
      if (P) P.reviewDone(COURSE, n);
      card.innerHTML = '<div class="fdone"><h3>Review done \u{1F389}</h3><p>' + ok + ' of ' + n + ' right on the first try. What you missed comes back tomorrow; the rest moves further out.</p>' +
        '<button type="button" class="btn primary" data-go="weak">\u{1F3AF} Practise weak spots</button><button type="button" class="btn" data-go="review">Back to review</button></div>';
      fx('done'); paintHud();
    }
    function next() {
      if (reviewQ !== null) {
        if (!reviewQ.length) { finishReview(); return; }
        cur = reviewQ.shift(); answered = false; paintBanner();
      } else cur = draw();
      answered = false;
      const card = $('#pqCard', root);
      if (!cur) { card.innerHTML = '<p class="qtext">No questions of this type for this topic. Try Mixed or another topic.</p>'; return; }
      let h = '<span class="qkind">' + KIND[cur.type] + '</span><span class="qsrc">' + cur.src + '</span>';
      if (cur.type === 'mcq') {
        h += '<p class="qtext">' + cur.q + '</p><div class="qopts">' +
          cur.o.map((o, i) => '<button type="button" class="qopt" data-i="' + i + '"><span class="ltr">' + 'ABCDE'[i] + '</span><span>' + o + '</span></button>').join('') + '</div>';
      } else if (cur.type === 'tf') {
        h += '<p class="qtext">' + cur.q + '</p><div class="qopts qtf"><button type="button" class="qopt" data-i="1">True</button><button type="button" class="qopt" data-i="0">False</button></div>';
      } else {
        const sel = '<select aria-label="Your answer"><option value="">Choose…</option>' + cur.o.map((o, i) => '<option value="' + i + '">' + strip(o) + '</option>').join('') + '</select>';
        h += cur.desc
          ? '<p class="qtext">Which key idea does this describe?</p><blockquote class="qdesc">' + cur.desc + '</blockquote><p class="qdrop block">' + sel + '</p>'
          : '<p class="qtext">Fill in the blank.</p><p class="qdrop">' + cur.before + ' ' + sel + cur.after + '</p>';
      }
      h += '<div id="pqFb"></div><div class="qnext" id="pqNext" hidden><button type="button" class="btn primary" id="pqGo">Next question →</button></div>';
      card.innerHTML = h;
      replay(card, 'enter');
    }
    function answer(i) {
      if (answered || !cur) return;
      answered = true;
      const right = cur.type === 'tf' ? (i === 1) === cur.a : i === cur.a;
      const lost = stats.streak;
      stats.n++; if (right) { stats.ok++; stats.streak++; } else stats.streak = 0;
      if (stats.streak > stats.best) { stats.best = stats.streak; store.set('quiz-best', stats.best); newBest = true; }
      if (!right && newBest && lost >= 3) fx('best', lost);
      if (!right) newBest = false;
      const card = $('#pqCard', root);
      if (P) P.answer(COURSE, sid(cur), right, stats.streak);
      if (reviewQ !== null) {
        if (!requeued.has(cur)) { if (right) rRight++; else { requeued.add(cur); reviewQ.splice(Math.min(reviewQ.length, 2 + Math.floor(Math.random() * 3)), 0, cur); rTotal++; } }
      }
      if (cur.type === 'drop') {
        const s = $('select', card); s.disabled = true; s.className = right ? 'ok' : 'no';
      } else {
        card.querySelectorAll('.qopt').forEach(b => {
          const bi = +b.dataset.i; b.disabled = true;
          const isAns = cur.type === 'tf' ? (bi === 1) === cur.a : bi === cur.a;
          if (isAns) b.classList.add('ok'); else if (bi === i) b.classList.add('no'); else b.classList.add('dim');
        });
      }
      const correctTxt = cur.type === 'tf' ? (cur.a ? 'True' : 'False') : cur.o[cur.a];
      $('#pqFb', card).innerHTML = '<div class="qfb ' + (right ? 'ok' : 'no') + '"><b>' + (right ? pick(['Correct!', 'Nice!', 'Spot on.', 'Yes!']) : 'Not quite. Answer: ' + correctTxt) + '</b><span class="exp">' + cur.e + '</span>' +
        (cur.key ? '<br><button type="button" class="more" data-key="' + cur.key.replace(/"/g, '&quot;') + '">Open the full explanation</button>' : '') + '</div>';
      $('#pqNext', card).hidden = false;
      paintStats();
      replay($('.qstat:nth-child(1)', root), 'bump');
      xpFloat(right ? 10 + Math.min(10, Math.max(0, stats.streak - 1)) : 2, $('#pqGo', card));
      if (reviewQ !== null) $('#pqGo', card).textContent = reviewQ.length ? 'Next \u2192' : 'Finish review \u2192';
      if (right) { replay($('.qstat:nth-child(2)', root), 'bump'); fx('correct', cur.type === 'drop' ? $('select', card) : card.querySelector('.qopt.ok')); fx('streak', stats.streak, $('.qstat:nth-child(2)', root)); }
      else fx('wrong');
      const go = $('#pqGo', card);
      try { go.focus({ preventScroll: true }); } catch (e) { go.focus(); }
      go.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    function bind() {
      root.addEventListener('click', e => {
        const f = e.target.closest('[data-f]');
        if (f) { setFilter(f.dataset.f); next(); return; }
        const o = e.target.closest('.qopt'); if (o) { answer(+o.dataset.i); return; }
        if (e.target.closest('#pqGo')) { next(); return; }
        if (e.target.closest('#pqExit')) { reviewQ = null; paintBanner(); setMode('review'); return; }
        const g = e.target.closest('[data-go]');
        if (g) { if (g.dataset.go === 'weak') { setFilter('weak', 'all'); setMode('quiz'); } else setMode('review'); return; }
        const m = e.target.closest('.more'); if (m) goToIdea(m.dataset.key);
      });
      root.addEventListener('change', e => {
        if (e.target.id === 'pqTopic') { topic = e.target.value; resetDecks(); next(); return; }
        if (e.target.matches('.qdrop select') && e.target.value !== '') answer(+e.target.value);
      });
    }
    function setFilter(f, tp) {
      filter = f; if (tp) topic = tp;
      if (started) { root.querySelectorAll('[data-f]').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === f)); $('#pqTopic', root).value = topic; }
      resetDecks();
    }
    return {
      show() { if (!started) { started = true; frame(); bind(); next(); } else if (!cur && reviewQ === null) next(); },
      reviewing: () => reviewQ !== null,
      startReview(ids) {
        const qs = shuffle(ids).map(questionFor).filter(Boolean);
        if (!started) { started = true; frame(); bind(); }
        reviewQ = qs; rTotal = rStart = qs.length; rRight = 0; requeued = new Set();
        next();
      },
      exitReview() { reviewQ = null; paintBanner(); next(); },
      practise(f, tp) { const wasStarted = started; setFilter(f, tp); if (wasStarted) next(); },
      key(e) {
        if (!cur) return;
        if (answered && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) { e.preventDefault(); next(); return; }
        if (answered) return;
        if (cur.type === 'tf') { if (/^[tT1]$/.test(e.key)) answer(1); else if (/^[fF2]$/.test(e.key)) answer(0); return; }
        if (cur.type === 'mcq') { const n = parseInt(e.key, 10); const l = 'abcde'.indexOf(e.key.toLowerCase()); const i = n >= 1 ? n - 1 : l; if (i >= 0 && i < cur.o.length) answer(i); }
      }
    };
  })();

  /* ---------- Flashcards ---------- */
  const Cards = (function () {
    const root = $('#pf');
    let topic = 'all', skipKnown = store.get('cards-skip', false), queue = [], total = 0, got = 0, missed = new Set(), flipped = false, started = false, current = null;

    function frame() {
      root.innerHTML =
        '<div class="pfilters">' +
          '<select id="pfTopic" aria-label="Topic"><option value="all">All topics</option>' + TOPICS.map(l => '<option value="' + l.id + '">' + l.short + '</option>').join('') + '</select>' +
          '<button type="button" id="pfSkip" aria-pressed="' + skipKnown + '">Skip learned</button>' +
          '<button type="button" id="pfShuffle">Shuffle</button>' +
        '</div><div id="pfBody"></div>';
      $('#pfTopic', root).value = topic;
    }
    function deal(list) {
      let cards = list || IDEAS.filter(x => (topic === 'all' || x.les.id === topic) && !(skipKnown && isKnown(x.key)));
      queue = shuffle(cards); total = queue.length; got = 0; missed = new Set();
      paint();
    }
    function paint() {
      const body = $('#pfBody', root);
      if (!queue.length) {
        const all = IDEAS.filter(x => topic === 'all' || x.les.id === topic);
        body.innerHTML = total
          ? '<div class="fdone"><h3>Deck done \u{1F389}</h3><p>' + got + ' of ' + total + ' cards marked as known' + (missed.size ? ', ' + missed.size + ' needed another look' : '') + '.</p>' +
            (missed.size ? '<button type="button" class="btn primary" data-act="missed">Again: only the ' + missed.size + ' I missed</button>' : '') +
            '<button type="button" class="btn" data-act="restart">Go through all again</button></div>'
          : '<div class="fdone"><h3>Nothing left here</h3><p>' + (skipKnown && all.length ? 'You have marked every card in this topic as learned.' : 'No cards for this topic.') + '</p>' +
            (skipKnown && all.length ? '<button type="button" class="btn primary" data-act="all">Show learned cards too</button>' : '') + '</div>';
        return;
      }
      current = queue[0];
      const x = current, done = total - queue.length;
      body.innerHTML =
        '<div class="fmeta"><span>Card ' + Math.min(done + 1, total) + ' of ' + total + '</span><span>' + got + ' known' + (missed.size ? ' · ' + missed.size + ' to repeat' : '') + '</span></div>' +
        '<div class="fbar"><div style="width:' + (100 * done / total) + '%"></div></div>' +
        '<div class="fscene enter"><span class="stamp r">Got it</span><span class="stamp l">Again</span><div class="fcard" id="pfCard" tabindex="0" role="button" aria-label="Flashcard. Press to flip.">' +
          '<div class="fface front">' + (isKnown(x.key) ? '<span class="known-badge">✓ Learned</span>' : '') +
            '<span class="les">' + x.les.short + '</span><div class="term">' + x.it.k + '</div><div class="hint">Tap to flip</div></div>' +
          '<div class="fface back"><span class="les">' + x.les.short + '</span><div class="bterm">' + x.it.k + '</div><div class="def">' + x.it.t + '</div>' +
            '<button type="button" class="moreb">Show full explanation</button><div class="full" hidden></div></div>' +
        '</div></div>' +
        '<div class="fact"><button type="button" class="btn no" data-act="again">↺ Still learning</button><button type="button" class="btn yes" data-act="got">✓ Got it</button></div>' +
        '<p class="ftip">Tap the card to flip. Swipe right for got it, left for still learning.</p>';
      flipped = false;
    }
    function flip() { const c = $('#pfCard', root); if (!c) return; flipped = !flipped; c.classList.toggle('flip', flipped); fx('flip'); }
    let busy = false;
    function advance(knewIt) {
      if (!current || busy) return;
      const x = queue.shift();
      if (P) P.card(COURSE, x.key, knewIt);
      xpFloat(knewIt ? 5 : 2, $('.fact', root));
      if (knewIt) { got++; markKnown(x.key); fx('got'); }
      else { missed.add(x); queue.splice(Math.min(queue.length, 3 + Math.floor(Math.random() * 3)), 0, x); fx('again'); } // comes back a few cards later
      const scene = $('.fscene', root);
      const finish = () => { busy = false; paint(); if (!queue.length && total) fx('done'); };
      if (scene && !reduceMotion) {
        busy = true; scene.classList.remove('dragging', 'enter');
        scene.querySelectorAll('.stamp').forEach(s => s.style.opacity = '');
        scene.classList.add(knewIt ? 'out-r' : 'out-l');
        setTimeout(finish, 230);
      } else finish();
    }
    function bind() {
      root.addEventListener('click', e => {
        const a = e.target.closest('[data-act]');
        if (a) {
          const act = a.dataset.act;
          if (act === 'got') advance(true);
          else if (act === 'again') advance(false);
          else if (act === 'missed') deal(Array.from(missed));
          else if (act === 'restart') deal();
          else if (act === 'all') { skipKnown = false; store.set('cards-skip', false); $('#pfSkip', root).setAttribute('aria-pressed', 'false'); deal(); }
          return;
        }
        if (e.target.id === 'pfSkip') { skipKnown = !skipKnown; store.set('cards-skip', skipKnown); e.target.setAttribute('aria-pressed', skipKnown); deal(); return; }
        if (e.target.id === 'pfShuffle') { deal(); return; }
        const mb = e.target.closest('.moreb');
        if (mb) {
          const full = mb.nextElementSibling;
          if (full.hidden) { full.innerHTML = current.it.d; full.hidden = false; mb.textContent = 'Hide full explanation'; }
          else { full.hidden = true; mb.textContent = 'Show full explanation'; }
        }
      });
      root.addEventListener('change', e => { if (e.target.id === 'pfTopic') { topic = e.target.value; deal(); } });
      // Tap to flip, swipe to answer.
      let x0 = null, y0 = 0, moved = false;
      root.addEventListener('pointerdown', e => { if (!e.target.closest('#pfCard') || e.target.closest('.moreb, .full')) { x0 = null; return; } x0 = e.clientX; y0 = e.clientY; moved = false; });
      root.addEventListener('pointermove', e => {
        if (x0 === null) return;
        const dx = e.clientX - x0;
        if (Math.abs(dx) > 10) moved = true;
        if (!moved || busy) return;
        const scene = $('.fscene', root); if (!scene) return;
        scene.classList.add('dragging');
        scene.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 18) + 'deg)';
        const r = scene.querySelector('.stamp.r'), l = scene.querySelector('.stamp.l');
        r.style.opacity = Math.max(0, Math.min(1, dx / 90)); l.style.opacity = Math.max(0, Math.min(1, -dx / 90));
      });
      const snapBack = () => { const scene = $('.fscene', root); if (!scene) return; scene.classList.remove('dragging'); scene.style.transform = ''; scene.querySelectorAll('.stamp').forEach(s => s.style.opacity = ''); };
      root.addEventListener('pointerup', e => {
        if (x0 === null) return;
        const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { const sc = $('.fscene', root); if (sc) sc.style.transform = ''; advance(dx > 0); return; }
        snapBack();
        if (!moved && Math.abs(dy) < 10) flip();
      });
      root.addEventListener('pointercancel', () => { x0 = null; snapBack(); });
      root.addEventListener('keydown', e => { if (e.target.id === 'pfCard' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); flip(); } });
    }
    return {
      show() { if (!started) { started = true; frame(); bind(); deal(); } },
      key(e) {
        if (!queue.length) return;
        if (e.key === 'ArrowRight') advance(true);
        else if (e.key === 'ArrowLeft') advance(false);
        else if ((e.key === ' ' || e.key === 'Enter') && e.target === document.body) { e.preventDefault(); flip(); }
      }
    };
  })();

  /* ---------- HUD: level, XP, daily goal, day streak ---------- */
  function ring(frac, label) {
    const r = 16, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac));
    return '<svg viewBox="0 0 40 40" class="ring" aria-hidden="true"><circle cx="20" cy="20" r="' + r + '" class="rt"/><circle cx="20" cy="20" r="' + r + '" class="rf" stroke-dasharray="' + c + '" stroke-dashoffset="' + (c * (1 - f)) + '"/></svg><span class="rl">' + label + '</span>';
  }
  function paintHud() {
    const hud = $('#phud'); if (!hud || !P) return;
    const lv = P.level(), st = P.streak(), due = P.dueIds(COURSE).length;
    hud.innerHTML =
      '<div class="hlv"><span class="hlvn">Lv ' + lv.level + '</span><span class="hlvname">' + lv.name + '</span>' +
        '<div class="hxp"><div style="width:' + (lv.pct * 100) + '%"></div></div><span class="hxpt">' + lv.xp + ' / ' + lv.hi + ' XP</span></div>' +
      '<div class="hgoal' + (st.todayDone ? ' done' : '') + '" title="Daily goal: ' + st.goal + ' answers or cards">' + ring(st.todayCount / st.goal, st.todayDone ? '✓' : st.todayCount) + '<span class="hcap">Today<br>' + Math.min(st.todayCount, st.goal) + '/' + st.goal + '</span></div>' +
      (P.STREAKS
        ? '<div class="hstreak' + (st.days ? ' on' : '') + (st.atRisk ? ' risk' : '') + '" title="Days in a row with the daily goal"><span class="hfl">\u{1F525}</span><b>' + st.days + '</b><span class="hcap">day' + (st.days === 1 ? '' : 's') + '</span></div>'
        : (() => { const e = P.examInfo(SLUG); return e && e.days >= 0
            ? '<div class="hstreak on hexam" title="Days until the midterm"><span class="hfl">\u23F3</span><b>' + e.days + '</b><span class="hcap">' + (e.days === 1 ? 'day' : 'days') + '<br>left</span></div>'
            : '<a class="hstreak hexam" href="index.html#' + SLUG + '" title="Set your midterm date"><span class="hfl">\u23F3</span><span class="hcap">Set<br>date</span></a>'; })());
    const b = $('#pDue'); if (b) { b.hidden = !due; b.textContent = due; }
  }
  function xpFloat(n, el) {
    if (!el || reduceMotion) return;
    const r = el.getBoundingClientRect(), f = document.createElement('span');
    f.className = 'xpfloat'; f.textContent = '+' + n + ' XP';
    f.style.left = (r.left + r.width / 2) + 'px'; f.style.top = (r.top - 6) + 'px';
    document.body.appendChild(f); setTimeout(() => f.remove(), 1100);
  }
  if (P) P.on((type) => { if (type === 'xp' || type === 'level' || type === 'goal') paintHud(); if (type === 'level') replay($('#phud .hlv'), 'bump'); });

  /* ---------- Review: due items, exam plan, topic mastery ---------- */
  const Review = (function () {
    const root = $('#pr');
    function nextDueText() {
      const srs = P.getSrs(COURSE), t = P.today();
      const ds = Object.values(srs).map(r => r.d).filter(d => d > t);
      if (!ds.length) return '';
      const d = Math.min.apply(null, ds), n = ds.filter(x => x === d).length, days = d - t;
      return n + ' item' + (n === 1 ? '' : 's') + ' due ' + (days === 1 ? 'tomorrow' : 'in ' + days + ' days') + '.';
    }
    function show() {
      if (!P) return;
      const due = P.dueIds(COURSE), sm = P.summary(COURSE), plan = P.plan(SLUG), ex = P.examInfo(SLUG);
      let h = '<div class="rcard">';
      if (due.length) {
        h += '<div class="rbig">' + due.length + '</div><p class="rlead">item' + (due.length === 1 ? '' : 's') + ' to review today</p>' +
          '<p class="rnote">Questions you missed or haven’t seen in a while. Clearing these is the fastest way to make things stick.</p>' +
          '<button type="button" class="btn primary rgo" data-r="start">Start review →</button>';
      } else if (!sm.started) {
        h += '<div class="rbig">\u{1F9E0}</div><p class="rlead">Nothing to review yet</p>' +
          '<p class="rnote">Every question you answer and every card you swipe is scheduled here. Misses come back tomorrow; right answers come back after 3 days, then a week, two weeks and a month.</p>' +
          '<button type="button" class="btn primary rgo" data-r="quiz">Start a quick quiz →</button>';
      } else {
        h += '<div class="rbig">✅</div><p class="rlead">All caught up for today</p><p class="rnote">' + nextDueText() + ' Keep going with your weak spots to raise your mastery.</p>' +
          '<button type="button" class="btn primary rgo" data-r="weak">\u{1F3AF} Practise weak spots →</button>';
      }
      h += '</div>';
      if (ex && ex.days >= 0) {
        h += '<div class="rexam"><b>' + (ex.days === 0 ? 'Midterm is today. Good luck! \u{1F340}' : ex.days === 1 ? 'Midterm tomorrow!' : 'Midterm in ' + ex.days + ' days') + '</b>' +
          (plan && plan.perDay && ex.days > 0 ? '<span>Aim for about ' + plan.perDay + ' questions or cards a day to cover your ' + plan.weak + ' weak ideas in time.</span>' : '') + '</div>';
      } else if (!ex) {
        h += '<div class="rexam muted"><span>Add your midterm date on the <a href="index.html#' + SLUG + '">course page</a> to get a daily plan.</span></div>';
      }
      h += '<div class="rmast"><div class="rmhead"><h3>Topic mastery</h3><b>' + pct(sm.mastery) + '</b></div>' +
        sm.topics.map(t => '<div class="rmrow"><div class="rmtop"><span>' + t.short + '</span><span class="rmp">' + pct(t.m) + '</span></div>' +
          '<div class="rmbar"><div style="width:' + (t.m * 100) + '%" class="' + (t.m >= 0.7 ? 'hi' : t.m >= 0.35 ? 'mid' : 'lo') + '"></div></div>' +
          '<button type="button" class="jump" data-r="topic" data-t="' + t.id + '">Practise</button></div>').join('') +
        '<p class="rnote small">Mastery grows as you answer an idea correctly on different days.</p></div>';
      root.innerHTML = h;
    }
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      const r = b.dataset.r;
      if (r === 'start') { const ids = P.dueIds(COURSE); $('#pr').hidden = true; $('#pq').hidden = false; Quiz.startReview(ids); }
      else if (r === 'quiz') { Quiz.practise('all', 'all'); setMode('quiz'); }
      else if (r === 'weak') { Quiz.practise('weak', 'all'); setMode('quiz'); }
      else if (r === 'topic') { Quiz.practise('weak', b.dataset.t); setMode('quiz'); }
    });
    return { show };
  })();

  document.addEventListener('keydown', e => {
    if (!playOn || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    if (e.target.closest && e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return; // let buttons work normally
    if (mode === 'cards') Cards.key(e); else if (mode === 'quiz' || Quiz.reviewing()) Quiz.key(e);
  });

  /* ---------- start ---------- */
  const h = window.INIT_HASH || getHash();
  if (h === '#play' || h === '#quiz') showTab('quiz');
  else if (h === '#cards') showTab('cards');
  else if (h === '#review' && P) showTab('review');
})();
