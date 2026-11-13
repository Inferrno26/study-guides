/* progress.js: shared study progress, stored on each device (localStorage).
   - Spaced review (Leitner boxes): a missed item comes back tomorrow; each correct answer pushes it further out (1, 3, 7, 14, 30 days).
   - Topic mastery from those boxes.
   - Points (XP), levels, a daily goal, a day streak and badges, shared across all courses.
   - Midterm dates: set EXAMS below for everyone, or each student sets their own on the home page. */
(function () {
  'use strict';

  /* ---------- course setup ---------- */
  // Put the real midterm dates here (YYYY-MM-DD) to show the countdown for everyone.
  const EXAMS = { 'data-mining': '', 'ai': '', 'networks': '' };
  const COURSES = {
    'data-mining': { id: 'cen376', title: 'Data Mining', short: 'Data Mining' },
    'ai': { id: 'cen352', title: 'Artificial Intelligence', short: 'AI' },
    'networks': { id: 'compnet', title: 'Computer Networks', short: 'Networks' }
  };

  const INTERVALS = [0, 1, 3, 7, 14, 30];          // days until the next review, by box 1..5
  const BOX_SCORE = [0, 0.2, 0.45, 0.7, 0.9, 1];   // how much each box counts toward mastery
  const GOAL = 20;                                  // answers + cards per day
  // Day streaks need weeks to mean anything. Off for the midterm sprint; set to true for the finals.
  const STREAKS = false;
  const LEVELS = [
    [0, 'Intern'], [100, 'Junior Dev'], [250, 'Mid-level Dev'], [500, 'Senior Dev'],
    [850, 'Tech Lead'], [1300, 'Staff Engineer'], [1900, 'Principal Engineer'], [2700, 'Distinguished Engineer'], [3700, 'CTO']
  ];
  const BADGES = [
    { id: 'first', icon: '\u{1F331}', name: 'First steps', desc: 'Answer your first question' },
    { id: 'goal', icon: '\u{1F3AF}', name: 'Daily goal', desc: 'Hit the daily goal of ' + GOAL },
    { id: 'perfect10', icon: '\u{1F51F}', name: 'Perfect 10', desc: '10 correct answers in a row' },
    { id: 'unstoppable', icon: '\u{1F525}', name: 'Unstoppable', desc: '25 correct answers in a row' },
    { id: 'habit', icon: '\u{1F4C5}', name: 'Habit forming', desc: 'A 3-day study streak', streak: true },
    { id: 'week', icon: '\u{1F5D3}️', name: 'Week warrior', desc: 'A 7-day study streak', streak: true },
    { id: 'allthree', icon: '\u{1F531}', name: 'Triple threat', desc: 'Study all three courses' },
    { id: 'coverage', icon: '\u{1F5FA}\uFE0F', name: 'Full coverage', desc: 'Practise every topic in a course' },
    { id: 'review', icon: '\u{1F9F9}', name: 'Clean slate', desc: 'Finish a daily review' },
    { id: 'master', icon: '\u{1F393}', name: 'Topic master', desc: 'Reach 90% mastery in a topic' },
    { id: 'cards100', icon: '\u{1F0CF}', name: 'Card shark', desc: 'Go through 100 flashcards' },
    { id: 'correct100', icon: '\u{1F4AF}', name: 'Centurion', desc: '100 correct answers' },
    { id: 'early', icon: '\u{1F305}', name: 'Early bird', desc: 'Study before 8 in the morning' },
    { id: 'night', icon: '\u{1F989}', name: 'Night owl', desc: 'Study after 11 at night' }
  ].filter(b => STREAKS || !b.streak);

  /* ---------- storage ---------- */
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const now = () => new Date(Date.now() + (window.__dayShift || 0) * 86400000);
  const dayNum = d => { d = d || now(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); };
  const today = () => dayNum();

  /* ---------- events ---------- */
  const listeners = [];
  const emit = (type, data) => {
    listeners.forEach(f => { try { f(type, data); } catch (e) {} });
    const FX = window.FX; if (!FX) return;
    if (type === 'level') { FX.play('fanfare'); FX.confetti(null, null, 150); FX.toast('⭐ Level ' + data.level + ': ' + data.name + '!'); }
    else if (type === 'goal') { FX.play('streak', 10); FX.confetti(null, null, 90); FX.toast('\u{1F3AF} Daily goal done!' + (STREAKS ? (data.days > 1 ? ' \u{1F525} ' + data.days + '-day streak' : ' Streak started') : '')); }
    else if (type === 'badge') { setTimeout(() => { FX.play('tick'); FX.toast(data.icon + ' Badge unlocked: ' + data.name); }, type === 'badge' && data.delay ? data.delay : 0); }
  };

  /* ---------- global stats ---------- */
  const STATS_KEY = 'study-stats';
  const blank = () => ({ courses: {}, xp: 0, days: {}, answers: 0, correct: 0, cards: 0, reviews: 0, bestRun: 0, badges: {} });
  const stats = () => Object.assign(blank(), load(STATS_KEY, {}));

  function levelInfo(xp) {
    let i = 0;
    while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
    // Past the last named level, every 1200 XP is another CTO level.
    let name = LEVELS[i][1], lo = LEVELS[i][0], hi = i + 1 < LEVELS.length ? LEVELS[i + 1][0] : lo + 1200, level = i + 1;
    if (i === LEVELS.length - 1 && xp >= hi) { const extra = Math.floor((xp - lo) / 1200); level += extra; lo += extra * 1200; hi = lo + 1200; name = 'CTO ' + ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][Math.min(9, extra)]; }
    return { level, name, xp, lo, hi, pct: Math.min(1, (xp - lo) / (hi - lo)) };
  }
  function streakInfo(s) {
    s = s || stats();
    const t = today(), met = d => (s.days[d] || 0) >= GOAL;
    let n = 0, d = met(t) ? t : t - 1;
    while (STREAKS && met(d)) { n++; d--; }
    return { days: n, todayDone: met(t), todayCount: s.days[t] || 0, goal: GOAL, atRisk: !met(t) && n > 0 };
  }

  function award(xp, opts) {
    opts = opts || {};
    const s = stats();
    const before = levelInfo(s.xp).level, t = today(), wasMet = (s.days[t] || 0) >= GOAL;
    s.xp += xp;
    if (opts.count) s.days[t] = (s.days[t] || 0) + 1;
    if (opts.answer) { s.answers++; if (opts.ok) s.correct++; }
    if (opts.card) s.cards++;
    if (opts.run) s.bestRun = Math.max(s.bestRun, opts.run);
    if (opts.review) s.reviews++;
    if (opts.course) s.courses[opts.course] = 1;
    // Keep the day log small: 60 days is plenty for streaks.
    const keys = Object.keys(s.days); if (keys.length > 60) keys.sort((a, b) => a - b).slice(0, keys.length - 60).forEach(k => delete s.days[k]);
    save(STATS_KEY, s);
    const after = levelInfo(s.xp);
    const events = [];
    if (after.level > before) events.push(['level', after]);
    if (!wasMet && (s.days[t] || 0) >= GOAL) events.push(['goal', streakInfo(s)]);
    events.push(['xp', { xp, total: s.xp }]);
    checkBadges(s, opts);
    events.forEach(e => emit(e[0], e[1]));
  }

  function checkBadges(s, opts) {
    const h = now().getHours(), st = streakInfo(s), got = [];
    const has = id => !!s.badges[id];
    const give = id => { if (!has(id)) { s.badges[id] = today(); got.push(BADGES.find(b => b.id === id)); } };
    if (s.answers >= 1 || s.cards >= 1) give('first');
    if (st.todayDone) give('goal');
    if (s.bestRun >= 10) give('perfect10');
    if (s.bestRun >= 25) give('unstoppable');
    if (STREAKS && st.days >= 3) give('habit');
    if (STREAKS && st.days >= 7) give('week');
    if (Object.keys(s.courses || {}).length >= 3) give('allthree');
    if (opts.course) { const sm = summary(opts.course); if (sm.topics.length && sm.topics.every(t => t.seen > 0)) give('coverage'); }
    if (s.reviews >= 1) give('review');
    if (s.cards >= 100) give('cards100');
    if (s.correct >= 100) give('correct100');
    if (h >= 5 && h < 8) give('early');
    if (h >= 23 || h < 4) give('night');
    if (opts.topicMastery >= 0.9) give('master');
    if (got.length) { save(STATS_KEY, s); got.forEach((b, i) => emit('badge', Object.assign({ delay: 900 + i * 1900 }, b))); }
  }

  /* ---------- spaced review per course ---------- */
  const srsKey = c => c + '-srs';
  function getSrs(course) { return load(srsKey(course), {}); }
  function promote(course, id, ok) {
    const s = getSrs(course), r = s[id] || { b: 0, w: 0, n: 0 };
    const fresh = !r.n; r.n++;
    // Right on the very first try: you probably know it, so skip straight to the 3-day box.
    if (ok) r.b = fresh ? 2 : Math.min(5, (r.b || 0) + 1); else { r.b = 1; r.w++; }
    r.d = today() + INTERVALS[r.b];
    s[id] = r; save(srsKey(course), s);
    return r;
  }
  function dueIds(course) { const s = getSrs(course), t = today(); return Object.keys(s).filter(id => s[id].d <= t); }
  const meta = course => load(course + '-meta', null);
  function saveMeta(course, topics) { save(course + '-meta', { topics, at: today() }); }
  function topicMastery(course, topicId) {
    const m = meta(course); if (!m) return null;
    const tp = m.topics.find(t => t.id === topicId); if (!tp || !tp.keys.length) return null;
    const s = getSrs(course);
    return tp.keys.reduce((a, k) => a + BOX_SCORE[(s['i:' + k] || {}).b || 0], 0) / tp.keys.length;
  }
  function summary(course) {
    const m = meta(course), s = getSrs(course), due = dueIds(course).length;
    if (!m) return { started: Object.keys(s).length > 0, due, mastery: 0, topics: [], weak: 0, total: 0 };
    let sum = 0, n = 0, weak = 0;
    const topics = m.topics.map(tp => {
      let ts = 0, seen = 0;
      tp.keys.forEach(k => { const r = s['i:' + k]; const sc = BOX_SCORE[(r || {}).b || 0]; ts += sc; if (r) seen++; if (sc < 0.7) weak++; });
      sum += ts; n += tp.keys.length;
      return { id: tp.id, short: tp.short, n: tp.keys.length, seen, m: tp.keys.length ? ts / tp.keys.length : 0 };
    });
    return { started: Object.keys(s).length > 0, due, mastery: n ? sum / n : 0, topics, weak, total: n };
  }

  /* ---------- midterm dates ---------- */
  function examDate(slug) { const own = load('exam-' + slug, ''); return own || EXAMS[slug] || ''; }
  function setExam(slug, iso) { save('exam-' + slug, iso || ''); }
  function examInfo(slug) {
    const iso = examDate(slug); if (!iso) return null;
    const [y, mo, d] = iso.split('-').map(Number); if (!y) return null;
    const days = dayNum(new Date(y, mo - 1, d)) - today();
    return { iso, days };
  }
  function plan(slug) {
    const c = COURSES[slug], e = examInfo(slug); if (!c || !e || e.days < 0) return null;
    const sm = summary(c.id);
    const left = Math.max(1, e.days);
    const perDay = sm.total ? Math.max(sm.due, Math.ceil(sm.weak / left)) : 0;
    return { days: e.days, perDay, weak: sm.weak, due: sm.due };
  }

  /* ---------- public API ---------- */
  window.PROG = {
    GOAL, BADGES, COURSES, STREAKS,
    nextExam() { let best = null; Object.keys(COURSES).forEach(k => { const e = examInfo(k); if (e && e.days >= 0 && (!best || e.days < best.days)) best = { slug: k, title: COURSES[k].title, short: COURSES[k].short, days: e.days }; }); return best; }, slugToId: s => (COURSES[s] || {}).id,
    on(f) { listeners.push(f); },
    today, stats, level: () => levelInfo(stats().xp), streak: () => streakInfo(),
    getSrs, dueIds, summary, saveMeta, topicMastery, boxScore: b => BOX_SCORE[b || 0],
    examInfo, examDate, setExam, plan,
    // A quiz answer. id: 'i:<idea key>' or 'q:<question id>'. run: current correct streak.
    answer(course, id, ok, run) {
      const r = promote(course, id, ok);
      const topic = id.startsWith('i:') ? id.slice(2).split(':')[0] : null;
      award(ok ? 10 + Math.min(10, Math.max(0, (run || 0) - 1)) : 2, { count: true, answer: true, ok, run, course, topicMastery: topic ? topicMastery(course, topic) : 0 });
      return r;
    },
    card(course, key, ok) {
      const r = promote(course, 'i:' + key, ok);
      award(ok ? 5 : 2, { count: true, card: true, course, topicMastery: topicMastery(course, key.split(':')[0]) });
      return r;
    },
    reviewDone(course, n) { award(20 + Math.min(30, n || 0), { review: true }); }
  };
})();
