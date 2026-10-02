// Bridge to the app's native iOS plugin (ios/App/App/WorkoutAudio.swift).
// In a normal browser (development) everything falls back to Web Audio / Wake Lock.
const C = window.Capacitor;
export const isNative = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
export const NativeAudio = isNative ? C.registerPlugin('WorkoutAudio') : null;

// fire-and-forget: a failing native call must never break the timer UI
export function native(method, args) {
  if (!NativeAudio) return;
  try {
    const p = NativeAudio[method](args || {});
    if (p && p.catch) p.catch(() => {});
  } catch {}
}
