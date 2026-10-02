// Inline stroke icons (currentColor)
const s = (d, vb = 24) =>
  `<svg viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const dial = (cx = 12, cy = 12, r = 8) =>
  `<path d="M${cx} ${cy - r}a${r} ${r} 0 1 1 -${(r * 0.7).toFixed(2)} ${(r * 0.29).toFixed(2)}"/><path d="M${cx} ${cy}l-3.2-3.4"/><circle cx="${cx}" cy="${cy}" r="1.3" fill="currentColor"/>`;

export const I = {
  tabata: `<svg viewBox="0 0 44 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${dial(11, 12, 8.5)}${dial(33, 12, 8.5)}</svg>`,
  runden: s(dial(12, 12, 8.5)),
  stoppuhr: s('<circle cx="12" cy="13.5" r="8"/><path d="M12 13.5V9M10 2.5h4M12 2.5v3M18.5 6.5l1.3-1.3"/>'),
  intervalle: s('<path d="M4.6 9A8 8 0 0 1 19 7.5M19.4 15A8 8 0 0 1 5 16.5"/><path d="M19.5 3.5v4h-4M4.5 20.5v-4h4"/><path d="M12 8v4l2.5 2"/>'),
  countdown: s('<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>'),
  amrap: s('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/><path d="M9 12l2 2 4-4"/>'),
  fortime: s('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>'),
  user: s('<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-5.5 8-5.5s6.5 1.5 8 5.5"/>'),
  share: s('<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
  chevron: s('<path d="m9 5 7 7-7 7"/>'),
  back: s('<path d="m15 5-7 7 7 7"/>'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.3-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="currentColor"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2" fill="currentColor"/><rect x="14" y="4" width="4.5" height="16" rx="1.2" fill="currentColor"/></svg>`,
  next: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5v13a1 1 0 0 0 1.5.8L15 13v5.5a1 1 0 0 0 2 0v-13a1 1 0 0 0-2 0V11L5.5 4.7A1 1 0 0 0 4 5.5z" fill="currentColor" transform="translate(1.5 0)"/></svg>`,
  prev: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 5.5v13a1 1 0 0 1-1.5.8L9 13v5.5a1 1 0 0 1-2 0v-13a1 1 0 0 1 2 0V11l9.5-6.3A1 1 0 0 1 20 5.5z" fill="currentColor" transform="translate(-1.5 0)"/></svg>`,
  star: s('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3z"/>'),
  starFill: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3z" fill="currentColor"/></svg>`,
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  minus: s('<path d="M5 12h14"/>'),
  trash: s('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  copy: s('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  up: s('<path d="m6 15 6-6 6 6"/>'),
  down: s('<path d="m6 9 6 6 6-6"/>'),
  lock: s('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  unlock: s('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>'),
  sound: s('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  mute: s('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="m17 9 5 6M22 9l-5 6"/>'),
  sun: s('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  flag: s('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  check: s('<path d="m5 12 5 5L20 7"/>'),
  restart: s('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/>'),
  grip: s('<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>'),
};
