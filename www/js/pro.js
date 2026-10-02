// Full version (one-time in-app purchase) + 3-day trial. In a normal browser everything is open.
import { isNative, NativeStore } from './native.js';

const DAY = 86400000;
const state = { ready: !isNative, unlocked: !isNative, trialEnd: Infinity, price: null };
const listeners = new Set();
export const pro = state;
export const onProChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(state));

export async function refreshPro() {
  if (!isNative) return state;
  try {
    const r = await NativeStore.status();
    state.unlocked = !!r.unlocked;
    state.trialEnd = Number(r.trialEnd) || 0;
    state.price = r.price || null;
  } catch {
    // StoreKit unreachable: never lock people out because of an error
    state.trialEnd = Math.max(state.trialEnd === Infinity ? 0 : state.trialEnd, Date.now() + DAY);
  }
  state.ready = true;
  emit();
  return state;
}

export const inTrial = () => !state.unlocked && Date.now() < state.trialEnd;
export const proAccess = () => !isNative || !state.ready || state.unlocked || Date.now() < state.trialEnd;
export const trialLeftMs = () => Math.max(0, state.trialEnd - Date.now());

async function call(method) {
  try {
    const r = (await NativeStore[method]()) || {};
    if (typeof r.unlocked === 'boolean' && r.unlocked !== state.unlocked) {
      state.unlocked = r.unlocked;
      emit();
    }
    return r;
  } catch {
    return { result: 'failed', unlocked: state.unlocked };
  }
}
export const buyPro = () => call('purchase');
export const restorePro = () => call('restore');
export const redeemPro = () => call('redeemCode');

if (isNative && NativeStore) {
  try {
    NativeStore.addListener('entitlement', (d) => {
      const unlocked = !!(d && d.unlocked);
      if (unlocked === state.unlocked) return;
      state.unlocked = unlocked;
      emit();
    });
  } catch {}
  refreshPro();
  // re-check when coming back to the app (trial may have run out, a code may have been redeemed)
  document.addEventListener('visibilitychange', () => !document.hidden && refreshPro());
}
