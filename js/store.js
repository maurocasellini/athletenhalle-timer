// localStorage-backed persistence (guarded: private mode / blocked storage must not break the app)
const PREFIX = 'wt.';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function write(key, val) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(val));
  } catch {}
}

const DEFAULT_SETTINGS = {
  sound: true,
  voice: true,
  vibrate: true,
  volume: 0.9,
  keepAwake: true,
  halfway: true,
  bigDigits: true,
};

let _settings = { ...DEFAULT_SETTINGS, ...read('settings', {}) };
export const settings = {
  get: () => _settings,
  set(patch) {
    _settings = { ..._settings, ...patch };
    write('settings', _settings);
  },
};

export const configs = {
  get: (mode, defaults) => ({ ...structuredClone(defaults), ...read('cfg.' + mode, {}) }),
  set: (mode, cfg) => write('cfg.' + mode, cfg),
};

export const favorites = {
  all: () => read('favs', []),
  add(fav) {
    const list = favorites.all();
    list.unshift({ id: Date.now().toString(36), ...fav });
    write('favs', list.slice(0, 50));
  },
  remove(id) {
    write('favs', favorites.all().filter((f) => f.id !== id));
  },
};

export const history = {
  all: () => read('hist', []),
  add(entry) {
    const list = history.all();
    list.unshift({ at: Date.now(), ...entry });
    write('hist', list.slice(0, 100));
  },
  clear: () => write('hist', []),
};
