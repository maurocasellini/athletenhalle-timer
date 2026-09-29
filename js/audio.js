// Web Audio beeps + German voice cues + vibration.
import { settings } from './store.js';

let ctx = null;
let master = null;

export function unlockAudio() {
  try {
    // iOS 17+: play even when the ring/silent switch is on
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {}
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  // silent buffer — required by iOS to actually unlock output
  const b = ctx.createBuffer(1, 1, 22050);
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(master);
  s.start(0);
  // warm up speech synthesis inside the gesture as well
  if ('speechSynthesis' in window && !unlockAudio._spoke) {
    unlockAudio._spoke = true;
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
});

function tone(freq, ms, { at = 0, type = 'sine', gain = 1 } = {}) {
  if (!ctx || !settings.get().sound) return;
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  const vol = settings.get().volume ?? 0.9;
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * vol), t0 + 0.01);
  g.gain.setValueAtTime(gain * vol, t0 + ms / 1000 - 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + ms / 1000 + 0.02);
}

function vibrate(p) {
  if (settings.get().vibrate && navigator.vibrate) navigator.vibrate(p);
}

let voice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const vs = speechSynthesis.getVoices();
  voice = vs.find((v) => v.lang === 'de-DE' && /premium|enhanced|anna|petra|markus/i.test(v.name)) || vs.find((v) => v.lang?.startsWith('de')) || null;
  return voice;
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = pickVoice;

export function speak(text) {
  if (!settings.get().voice || !('speechSynthesis' in window) || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    if (voice || pickVoice()) u.voice = voice;
    u.rate = 1.05;
    u.volume = settings.get().volume ?? 0.9;
    speechSynthesis.speak(u);
  } catch {}
}

export const cue = {
  count(n) {
    tone(880, 140, { type: 'square', gain: 0.35 });
    vibrate(60);
  },
  work() {
    tone(1320, 550, { type: 'square', gain: 0.4 });
    vibrate([200]);
  },
  rest() {
    tone(990, 200, { type: 'triangle', gain: 0.6 });
    tone(660, 380, { at: 0.2, type: 'triangle', gain: 0.6 });
    vibrate([120, 80, 120]);
  },
  halfway() {
    tone(1100, 90, { type: 'sine', gain: 0.5 });
    tone(1100, 90, { at: 0.15, type: 'sine', gain: 0.5 });
  },
  tap() {
    tone(1500, 50, { type: 'sine', gain: 0.35 });
    vibrate(20);
  },
  done() {
    [0, 0.16, 0.32].forEach((at, i) => tone([1046, 1318, 1568][i], 160, { at, type: 'square', gain: 0.35 }));
    tone(2093, 700, { at: 0.5, type: 'square', gain: 0.35 });
    vibrate([200, 100, 200, 100, 400]);
  },
};
