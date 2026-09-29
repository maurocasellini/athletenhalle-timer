// Mode definitions + compiler: every mode turns its config into a flat list of segments.
// A segment: { kind, label, dur (ms, Infinity = open), up (display counts up), round, rounds, set, sets, color }

export const KIND = {
  prep: { label: 'Vorbereiten', color: '#FFD60A', speak: 'Bereit machen' },
  work: { label: 'Arbeit', color: '#FF9F0A', speak: 'Los' },
  rest: { label: 'Pause', color: '#0A84FF', speak: 'Pause' },
  setrest: { label: 'Satzpause', color: '#BF5AF2', speak: 'Satzpause' },
  cool: { label: 'Cool-down', color: '#64D2FF', speak: 'Cool down' },
  up: { label: 'Läuft', color: '#FF9F0A', speak: 'Los' },
};

export const STEP_COLORS = ['#FF9F0A', '#30D158', '#FF453A', '#0A84FF', '#BF5AF2', '#FFD60A', '#64D2FF', '#FF375F'];

const t = (id, label, extra = {}) => ({ id, type: 'time', label, ...extra });
const n = (id, label, extra = {}) => ({ id, type: 'count', label, min: 1, max: 99, ...extra });

export const MODES = {
  tabata: {
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
    title: 'Stoppuhr',
    sub: 'Zeit messen mit Runden',
    icon: 'stoppuhr',
    defaults: { prep: 0 },
    fields: [t('prep', 'Vorbereiten', { min: 0 })],
  },
  intervalle: {
    title: 'Intervalle',
    sub: 'Eigene Abläufe bauen',
    icon: 'intervalle',
    custom: true,
    defaults: {
      prep: 10,
      cool: 0,
      blocks: [
        {
          name: 'Zirkel',
          repeats: 3,
          steps: [
            { name: 'Squats', dur: 40, kind: 'work', color: '#FF9F0A' },
            { name: 'Pause', dur: 20, kind: 'rest', color: '#0A84FF' },
            { name: 'Push-ups', dur: 40, kind: 'work', color: '#30D158' },
            { name: 'Pause', dur: 20, kind: 'rest', color: '#0A84FF' },
          ],
        },
      ],
    },
  },
  countdown: {
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
      const blocks = (c.blocks || []).filter((b) => b.steps && b.steps.length);
      blocks.forEach((b, bi) => {
        for (let r = 1; r <= b.repeats; r++) {
          b.steps.forEach((st, si) => {
            const isLastStep = r === b.repeats && si === b.steps.length - 1 && bi === blocks.length - 1;
            // skip a trailing rest at the very end of the workout
            if (isLastStep && st.kind === 'rest' && segs.some((x) => x.kind === 'work')) return;
            if (!(st.dur > 0)) return;
            segs.push(
              seg(st.kind === 'rest' ? 'rest' : 'work', st.dur, {
                label: st.name || KIND[st.kind === 'rest' ? 'rest' : 'work'].label,
                color: st.color || KIND[st.kind === 'rest' ? 'rest' : 'work'].color,
                round: r,
                rounds: b.repeats,
                block: b.name,
                blockIdx: bi + 1,
                blocks: blocks.length,
                speakName: true,
              }),
            );
          });
        }
      });
      break;
    }
  }
  if (c.cool > 0) segs.push(seg('cool', c.cool));
  return out;
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
