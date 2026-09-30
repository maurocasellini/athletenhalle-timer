// Mode definitions + compiler: every mode turns its config into a flat list of segments.
// A segment: { kind, label, dur (ms, Infinity = open), up (display counts up), round, rounds, set, sets, color }

export const KIND = {
  prep: { label: 'Bereit', color: '#E8893A', speak: 'Bereit machen' },
  work: { label: 'Arbeit', color: '#EFD814', speak: 'Los' },
  rest: { label: 'Pause', color: '#5B8FD9', speak: 'Pause' },
  setrest: { label: 'Satzpause', color: '#9A86E0', speak: 'Satzpause' },
  cool: { label: 'Cool-down', color: '#5FB8A6', speak: 'Cool down' },
  up: { label: 'Go', color: '#EFD814', speak: 'Los' },
};

export const STEP_COLORS = ['#EFD814', '#E8643A', '#E0578A', '#E8893A', '#9A86E0', '#5FB8A6', '#5B8FD9', '#EDEDED'];

const t = (id, label, extra = {}) => ({ id, type: 'time', label, ...extra });
const n = (id, label, extra = {}) => ({ id, type: 'count', label, min: 1, max: 99, ...extra });

export const MODES = {
  tabata: {
    tag: '20/10',
    title: 'Tabata',
    sub: 'Arbeit / Pause im Wechsel',
    icon: 'tabata',
    defaults: { prep: 10, work: 20, rest: 10, rounds: 8, sets: 1, setRest: 60, cool: 0 },
    fields: [
      t('prep', 'Vorbereiten', { min: 0 }),
      t('work', 'Arbeit', { min: 1, accent: 'work' }),
      t('rest', 'Pause', { min: 0, accent: 'rest' }),
      n('rounds', 'Runden'),
      n('sets', 'Sätze'),
      t('setRest', 'Pause zwischen Sätzen', { min: 0, showIf: (c) => c.sets > 1, accent: 'setrest' }),
      t('cool', 'Cool-down', { min: 0 }),
    ],
    presets: [
      { name: 'Klassisch 20/10 × 8', cfg: { work: 20, rest: 10, rounds: 8, sets: 1 } },
      { name: '40/20 × 10', cfg: { work: 40, rest: 20, rounds: 10, sets: 1 } },
      { name: '30/30 × 12', cfg: { work: 30, rest: 30, rounds: 12, sets: 1 } },
      { name: '4 Sätze Tabata', cfg: { work: 20, rest: 10, rounds: 8, sets: 4, setRest: 60 } },
    ],
  },
  runden: {
    tag: 'EMOM',
    title: 'Runden',
    sub: 'EMOM · E2MOM · Runden',
    icon: 'runden',
    defaults: { prep: 10, round: 60, rounds: 10, rest: 0, cool: 0 },
    fields: [
      t('prep', 'Vorbereiten', { min: 0 }),
      t('round', 'Rundendauer', { min: 1, accent: 'work' }),
      n('rounds', 'Runden'),
      t('rest', 'Pause zwischen Runden', { min: 0, accent: 'rest' }),
      t('cool', 'Cool-down', { min: 0 }),
    ],
    presets: [
      { name: 'EMOM 10', cfg: { round: 60, rounds: 10, rest: 0 } },
      { name: 'EMOM 20', cfg: { round: 60, rounds: 20, rest: 0 } },
      { name: 'E2MOM × 8', cfg: { round: 120, rounds: 8, rest: 0 } },
      { name: '5 × 3:00 / 1:00', cfg: { round: 180, rounds: 5, rest: 60 } },
    ],
  },
  stoppuhr: {
    tag: '0:00',
    title: 'Stoppuhr',
    sub: 'Zeit messen mit Runden',
    icon: 'stoppuhr',
    defaults: { prep: 0 },
    fields: [t('prep', 'Vorbereiten', { min: 0 })],
  },
  intervalle: {
    tag: 'MIX',
    title: 'Intervalle',
    sub: 'Eigene Abläufe bauen',
    icon: 'intervalle',
    custom: true,
    defaults: {
      prep: 10,
      repeats: 3,
      cool: 0,
      intervals: [
        { name: '', work: 40, rest: 20 },
        { name: '', work: 40, rest: 20 },
        { name: '', work: 40, rest: 20 },
      ],
    },
  },
  countdown: {
    tag: '5:00',
    title: 'Countdown',
    sub: 'Einfacher Timer',
    icon: 'countdown',
    defaults: { prep: 0, dur: 300 },
    fields: [t('prep', 'Vorbereiten', { min: 0 }), t('dur', 'Dauer', { min: 1, accent: 'work' })],
    presets: [
      { name: '1 Min', cfg: { dur: 60 } },
      { name: '3 Min', cfg: { dur: 180 } },
      { name: '5 Min', cfg: { dur: 300 } },
      { name: '10 Min', cfg: { dur: 600 } },
    ],
  },
  amrap: {
    tag: 'AMRAP',
    title: 'AMRAP',
    sub: 'So viele Runden wie möglich',
    icon: 'amrap',
    defaults: { prep: 10, dur: 600 },
    fields: [t('prep', 'Vorbereiten', { min: 0 }), t('dur', 'Zeitlimit', { min: 1, accent: 'work' })],
    presets: [
      { name: '8 Min', cfg: { dur: 480 } },
      { name: '12 Min', cfg: { dur: 720 } },
      { name: '20 Min', cfg: { dur: 1200 } },
    ],
  },
  fortime: {
    tag: 'FT',
    title: 'For Time',
    sub: 'So schnell wie möglich',
    icon: 'fortime',
    defaults: { prep: 10, cap: 900 },
    fields: [t('prep', 'Vorbereiten', { min: 0 }), t('cap', 'Time Cap (0 = keins)', { min: 0, accent: 'work' })],
  },
};

export const MODE_ORDER = ['tabata', 'runden', 'stoppuhr', 'intervalle', 'countdown', 'amrap', 'fortime'];

const S = 1000;
const seg = (kind, dur, extra = {}) => ({
  kind,
  label: KIND[kind].label,
  color: KIND[kind].color,
  dur: dur === Infinity ? Infinity : dur * S,
  up: false,
  ...extra,
});

export function compile(mode, c) {
  const segs = [];
  const out = { segments: segs, counter: false, laps: false, finishButton: false };
  if (c.prep > 0) segs.push(seg('prep', c.prep));

  switch (mode) {
    case 'tabata': {
      for (let s = 1; s <= c.sets; s++) {
        for (let r = 1; r <= c.rounds; r++) {
          segs.push(seg('work', c.work, { round: r, rounds: c.rounds, set: s, sets: c.sets }));
          const lastInSet = r === c.rounds;
          const lastOverall = lastInSet && s === c.sets;
          if (lastOverall) break;
          if (lastInSet && c.setRest > 0) segs.push(seg('setrest', c.setRest, { round: r, rounds: c.rounds, set: s, sets: c.sets }));
          else if (c.rest > 0) segs.push(seg('rest', c.rest, { round: r, rounds: c.rounds, set: s, sets: c.sets }));
        }
      }
      break;
    }
    case 'runden': {
      for (let r = 1; r <= c.rounds; r++) {
        segs.push(seg('work', c.round, { label: `Runde ${r}`, round: r, rounds: c.rounds }));
        if (c.rest > 0 && r < c.rounds) segs.push(seg('rest', c.rest, { round: r, rounds: c.rounds }));
      }
      break;
    }
    case 'stoppuhr':
      segs.push(seg('up', Infinity, { up: true, label: 'Stoppuhr' }));
      out.laps = true;
      break;
    case 'countdown':
      segs.push(seg('work', c.dur, { label: 'Countdown' }));
      break;
    case 'amrap':
      segs.push(seg('work', c.dur, { label: 'AMRAP' }));
      out.counter = true;
      break;
    case 'fortime':
      segs.push(seg('up', c.cap > 0 ? c.cap : Infinity, { up: true, label: 'For Time' }));
      out.counter = true;
      out.finishButton = true;
      break;
    case 'intervalle': {
      const ivs = normalizeIntervals(c).intervals.filter((iv) => iv.work > 0);
      const reps = Math.max(1, c.repeats || 1);
      for (let r = 1; r <= reps; r++) {
        ivs.forEach((iv, i) => {
          const name = intervalName(iv, i);
          const color = intervalColor(iv, i);
          segs.push(seg('work', iv.work, { label: name, color, round: r, rounds: reps, speakName: true }));
          const last = r === reps && i === ivs.length - 1;
          // no pause after the very last interval of the workout
          if (iv.rest > 0 && !last) segs.push(seg('rest', iv.rest, { round: r, rounds: reps }));
        });
      }
      break;
    }
  }
  if (c.cool > 0) segs.push(seg('cool', c.cool));
  return out;
}

export const intervalName = (iv, i) => (iv.name || '').trim() || `Intervall ${i + 1}`;
export const intervalColor = (iv, i) => iv.color || STEP_COLORS[i % (STEP_COLORS.length - 1)];

// Configs saved before the interval redesign used blocks of work/rest steps: fold them into
// the flat "interval + pause" list so old favourites keep working.
export function normalizeIntervals(c) {
  if (Array.isArray(c.intervals)) return c;
  const b = (c.blocks || [])[0];
  const intervals = [];
  for (const st of (b && b.steps) || []) {
    if (st.kind === 'rest') {
      if (intervals.length) intervals[intervals.length - 1].rest += st.dur;
    } else intervals.push({ name: st.name || '', work: st.dur, rest: 0, color: st.color });
  }
  c.intervals = intervals.length ? intervals : [{ name: '', work: 40, rest: 20 }];
  c.repeats = (b && b.repeats) || c.repeats || 1;
  delete c.blocks;
  return c;
}

export function totalMs(program) {
  let sum = 0;
  for (const s of program.segments) {
    if (s.dur === Infinity) return Infinity;
    sum += s.dur;
  }
  return sum;
}

export function summary(mode, cfg) {
  const p = compile(mode, cfg);
  const total = totalMs(p);
  const work = p.segments.filter((s) => s.kind === 'work').length;
  return { total, work, segments: p.segments.length };
}
