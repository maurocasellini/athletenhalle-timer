// Web Audio beeps + German voice cues + vibration.
import { settings } from './store.js';
import { voiceLang } from './i18n.js';
import { isNative, native } from './native.js';

let ctx = null;
let master = null;

export function unlockAudio() {
  if (isNative) return; // native audio session is set up by the iOS plugin
  try {
    // iOS 17+: 'ambient' mixes with Spotify & co. (needs the silent switch off);
    // 'playback' plays through the silent switch but stops other music.
    if (navigator.audioSession) navigator.audioSession.type = settings.get().mixMusic ? 'ambient' : 'playback';
  } catch {}
  // Older iOS: a playing <audio> element moves the page into the playback category,
  // after which Web Audio ignores the silent switch too.
  if (!settings.get().mixMusic && !navigator.audioSession) playSilentElement();
  else if (silentEl && !silentEl.paused) silentEl.pause();
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
let voiceFor = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const want = voiceLang();
  const pre = want.slice(0, 2);
  const vs = speechSynthesis.getVoices();
  const good = /premium|enhanced|erweitert|neural|natural/i;
  voice =
    vs.find((v) => v.lang === want && good.test(v.name)) ||
    vs.find((v) => v.lang === want) ||
    vs.find((v) => v.lang?.startsWith(pre) && good.test(v.name)) ||
    vs.find((v) => v.lang?.startsWith(pre)) ||
    null;
  voiceFor = want;
  return voice;
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = pickVoice;

export function speak(text) {
  if (!settings.get().voice || !text) return;
  if (isNative) return native('play', { text, lang: voiceLang(), ...nativeOpts() });
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voiceLang();
    if (voiceFor !== u.lang) pickVoice();
    if (voice || pickVoice()) u.voice = voice;
    u.rate = 1.05;
    u.volume = settings.get().volume ?? 0.9;
    speechSynthesis.speak(u);
  } catch {}
}

export function nativeOpts() {
  const st = settings.get();
  return { soundOn: st.sound, voiceOn: st.voice, hapticsOn: st.vibrate, volume: st.volume ?? 0.9 };
}

// in the app every cue is played by the native engine (works with the screen locked)
const webCue = {
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

export const cue = new Proxy(webCue, {
  get(target, name) {
    if (!isNative) return target[name];
    return () => native('play', { sound: name, haptic: name === 'count' || name === 'tap', ...nativeOpts() });
  },
});
