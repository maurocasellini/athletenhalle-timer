// Keeps the screen on. Native Screen Wake Lock API first (iOS 16.4+, Android Chrome),
// NoSleep.js hidden-video fallback for older browsers. Re-acquired after tab switches.

let sentinel = null;
let noSleep = null;
let wanted = false;
let listeners = new Set();
let mode = 'off'; // 'native' | 'video' | 'off'

function emit() {
  listeners.forEach((fn) => fn(mode));
}

export function onWakeChange(fn) {
  listeners.add(fn);
  fn(mode);
  return () => listeners.delete(fn);
}

async function requestNative() {
  if (!('wakeLock' in navigator)) return false;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
      if (mode === 'native') {
        mode = 'off';
        emit();
      }
    });
    mode = 'native';
    emit();
    return true;
  } catch {
    return false;
  }
}

function enableVideo() {
  try {
    if (!noSleep && window.NoSleep) noSleep = new window.NoSleep();
    if (!noSleep) return false;
    const r = noSleep.enable();
    mode = 'video';
    emit();
    if (r && r.catch) r.catch(() => {});
    return true;
  } catch {
    return false;
  }
}

// Must be called from a user gesture the first time (video fallback needs it).
export async function keepAwake() {
  wanted = true;
  if (sentinel || (noSleep && noSleep.isEnabled)) return;
  if (await requestNative()) return;
  enableVideo();
}

export function allowSleep() {
  wanted = false;
  if (sentinel) sentinel.release().catch(() => {});
  sentinel = null;
  if (noSleep && noSleep.isEnabled) noSleep.disable();
  mode = 'off';
  emit();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && wanted && !sentinel) requestNative();
});
// Any tap re-arms the lock if the browser dropped it
document.addEventListener(
  'pointerdown',
  () => {
    if (wanted && !sentinel && !(noSleep && noSleep.isEnabled)) keepAwake();
  },
  { passive: true },
);
