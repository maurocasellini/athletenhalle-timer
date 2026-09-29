// Keeps the screen on — "always on", like while watching a video.
// Two independent mechanisms run at the same time, so one covers when the other drops:
//   1. Screen Wake Lock API (iOS 16.4+, Android Chrome)
//   2. A tiny, muted, looping video that is always playing. Phones never dim the screen
//      while a video plays. Muted inline video may autoplay without a tap on iOS/Android.
// A watchdog re-arms both every few seconds and whenever the page becomes visible again.
import { webm, mp4 } from '../vendor/keepalive-media.js';

let wanted = false;
let sentinel = null;
let requesting = false;
let video = null;
let videoOk = false;
let watchdog = null;
const listeners = new Set();

function mode() {
  if (sentinel && videoOk) return 'both';
  if (sentinel) return 'native';
  if (videoOk) return 'video';
  return 'off';
}
let lastMode = 'off';
function emit() {
  const m = mode();
  if (m === lastMode) return;
  lastMode = m;
  listeners.forEach((fn) => fn(m));
}

export function onWakeChange(fn) {
  listeners.add(fn);
  fn(mode());
  return () => listeners.delete(fn);
}

async function requestNative() {
  if (sentinel || requesting || !('wakeLock' in navigator) || document.hidden) return;
  requesting = true;
  try {
    const s = await navigator.wakeLock.request('screen');
    if (!wanted) {
      s.release().catch(() => {});
      return;
    }
    sentinel = s;
    s.addEventListener('release', () => {
      if (sentinel === s) sentinel = null;
      emit();
      // the browser dropped it (tab switch, battery saver…) — try again right away
      if (wanted && !document.hidden) setTimeout(requestNative, 500);
    });
  } catch {
    // not allowed right now (no https, no tap yet, low power mode) — watchdog retries
  } finally {
    requesting = false;
    emit();
  }
}

function ensureVideo() {
  if (video) return video;
  video = document.createElement('video');
  // black 2×2 px in the corner of a black app: technically visible (iOS pauses videos it
  // considers hidden), practically invisible
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('muted', '');
  video.setAttribute('loop', '');
  video.setAttribute('aria-hidden', 'true');
  video.setAttribute('disablepictureinpicture', '');
  video.setAttribute('disableremoteplayback', '');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.loop = true;
  video.tabIndex = -1;
  video.className = 'keepalive-video';
  for (const [type, src] of [
    ['video/webm', webm],
    ['video/mp4', mp4],
  ]) {
    const s = document.createElement('source');
    s.type = type;
    s.src = src;
    video.appendChild(s);
  }
  // the mp4 fallback is longer than 1 s: keep it in its first second so it never "ends"
  video.addEventListener('timeupdate', () => {
    if (video.duration > 1 && video.currentTime > 0.5) video.currentTime = Math.random() * 0.4;
  });
  video.addEventListener('playing', () => {
    videoOk = true;
    emit();
  });
  video.addEventListener('pause', () => {
    videoOk = false;
    emit();
    if (wanted && !document.hidden) setTimeout(playVideo, 300);
  });
  document.body.appendChild(video);
  return video;
}

function playVideo() {
  if (!wanted || document.hidden) return;
  const v = ensureVideo();
  if (!v.paused && videoOk) return;
  v.muted = true;
  const p = v.play();
  if (p && p.catch)
    p.catch(() => {
      videoOk = false;
      emit();
    });
}

function arm() {
  if (!wanted) return;
  requestNative();
  playVideo();
}

// Call as early as possible (page load). Anything the browser refuses without a tap is
// picked up by the first touch and by the watchdog.
export function keepAwake() {
  wanted = true;
  arm();
  if (!watchdog) watchdog = setInterval(arm, 3000);
}

export function allowSleep() {
  wanted = false;
  clearInterval(watchdog);
  watchdog = null;
  if (sentinel) sentinel.release().catch(() => {});
  sentinel = null;
  if (video) video.pause();
  videoOk = false;
  emit();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) arm();
});
window.addEventListener('pageshow', arm);
window.addEventListener('focus', arm);
// first touches: allowed to start anything the browser blocked before
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) {
  document.addEventListener(ev, arm, { passive: true, capture: true });
}
