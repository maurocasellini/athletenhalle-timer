// Web Audio beeps + German voice cues + vibration.
import { settings } from './store.js';

let ctx = null;
let master = null;

export function unlockAudio() {
  try {
    // iOS 17+: 'playback' plays through the ring/silent switch (volume buttons still apply);
    // 'ambient' obeys the switch but mixes with music.
    if (navigator.audioSession) navigator.audioSession.type = settings.get().ignoreMute ? 'playback' : 'ambient';
  } catch {}
  // Older iOS: a playing <audio> element moves the page into the playback category,
  // after which Web Audio ignores the silent switch too.
  if (settings.get().ignoreMute && !navigator.audioSession) playSilentElement();
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

let silentEl = null;
function silentWav() {
  // 0.5 s of 8 kHz mono silence
  const n = 4000, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
function playSilentElement() {
  try {
    if (!silentEl) {
      silentEl = document.createElement('audio');
      silentEl.setAttribute('x-webkit-airplay', 'deny');
      silentEl.preload = 'auto';
      silentEl.loop = true;
      silentEl.src = silentWav();
    }
    const p = silentEl.play();
    if (p && p.catch) p.catch(() => {});
  } catch {}
}

export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// iOS parks the AudioContext in 'suspended'/'interrupted' after calls, Siri, lock screen or
// a second audio app. It may only be resumed inside a user gesture, so every tap tries.
for (const ev of ['pointerdown', 'touchend', 'click']) {
  document.addEventListener(
    ev,
    () => {
      if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    },
    { passive: true, capture: true },
  );
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

// opts.hype: Ferdi mode — always spoken (even with voice off), faster, higher, full volume
export function speak(text, opts = {}) {
  if ((!settings.get().voice && !opts.hype) || !('speechSynthesis' in window) || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    if (voice || pickVoice()) u.voice = voice;
    u.rate = opts.hype ? 1.2 : 1.05;
    u.pitch = opts.hype ? 1.25 : 1;
    u.volume = opts.hype ? 1 : settings.get().volume ?? 0.9;
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
