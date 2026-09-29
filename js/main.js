import { MODES, MODE_ORDER, KIND, STEP_COLORS, compile, totalMs, summary } from './modes.js';
import { Engine } from './engine.js';
import { cue, speak, unlockAudio } from './audio.js';
import { keepAwake, allowSleep, onWakeChange } from './wakelock.js';
import { settings, configs, favorites, history } from './store.js';
import { I } from './icons.js';

const app = document.getElementById('app');
const sheetRoot = document.getElementById('sheet-root');
const toastEl = document.getElementById('toast');

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function fmtSec(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
// countdown display rounds up (shows 0:01 until the very end), count-up rounds down
const fmtDown = (ms) => fmtSec(Math.ceil(Math.max(0, ms) / 1000));
const fmtUp = (ms) => fmtSec(Math.floor(Math.max(0, ms) / 1000));
const fmtTotal = (ms) => (ms === Infinity ? '∞' : fmtSec(ms / 1000));

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function encodeCfg(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeCfg(str) {
  try {
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

async function shareLink(url, title) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link kopiert');
  } catch {
    prompt('Link kopieren:', url);
  }
}

// Screen stays on across the whole app from the moment the page loads.
if (settings.get().keepAwake) keepAwake();

// ---------- router ----------
let current = null; // { mode, cfg, title }
let engine = null;
let runView = null;

function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, query] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  closeSheet();
  if (parts[0] !== 'run') teardownRun();
  if (parts[0] === 'm' && MODES[parts[1]]) {
    const params = new URLSearchParams(query || '');
    if (params.get('c')) {
      const data = decodeCfg(params.get('c'));
      if (data && typeof data === 'object') {
        const cfg = { ...structuredClone(MODES[parts[1]].defaults), ...data };
        configs.set(parts[1], cfg);
        toast('Workout übernommen');
      }
      window.history.replaceState(null, '', `#/m/${parts[1]}`);
    }
    return renderEditor(parts[1]);
  }
  if (parts[0] === 'run' && current) return renderRun();
  if (parts[0] === 'run') return go('/');
  renderHome();
}
function go(path) {
  if (location.hash === '#' + path) route();
  else location.hash = path;
}
window.addEventListener('hashchange', route);

// ---------- home ----------
function renderHome() {
  document.body.className = 'page-home';
  const favs = favorites.all();
  const hist = history.all().slice(0, 5);
  app.innerHTML = `
    <header class="topbar">
      <button class="round-btn" data-act="settings" aria-label="Einstellungen">${I.user}</button>
      <h1>Zeitschaltuhr</h1>
      <button class="round-btn" data-act="share-app" aria-label="Teilen">${I.share}</button>
    </header>
    <main class="home">
      <div class="grid">
        ${MODE_ORDER.map(
          (m, i) => `
          <a class="card mode-card ${i === MODE_ORDER.length - 1 && MODE_ORDER.length % 2 ? 'wide' : ''}" href="#/m/${m}">
            <span class="mode-icon ${m === 'tabata' ? 'double' : ''}">${I[MODES[m].icon]}</span>
            <span class="chev">${I.chevron}</span>
            <span class="mode-title">${MODES[m].title}</span>
            <span class="mode-sub">${MODES[m].sub}</span>
          </a>`,
        ).join('')}
      </div>

      <section class="section">
        <div class="section-head"><h2>Favoriten</h2></div>
        ${
          favs.length
            ? `<div class="list">${favs
                .map((f) => {
                  const sm = safeSummary(f.mode, f.cfg);
                  return `<div class="list-row fav">
                    <button class="fav-main" data-act="fav-open" data-id="${f.id}">
                      <span class="fav-icon">${I[MODES[f.mode]?.icon || 'runden']}</span>
                      <span class="fav-text"><b>${esc(f.name)}</b><small>${esc(MODES[f.mode]?.title || '')} · ${fmtTotal(sm.total)}</small></span>
                    </button>
                    <button class="icon-btn subtle" data-act="fav-del" data-id="${f.id}" aria-label="Löschen">${I.trash}</button>
                    <button class="play-mini" data-act="fav-play" data-id="${f.id}" aria-label="Starten">${I.play}</button>
                  </div>`;
                })
                .join('')}</div>`
            : `<p class="empty">Speichere Workouts mit dem ${I.star} im Editor – dann liegen sie hier für den Schnellstart.</p>`
        }
      </section>

      ${
        hist.length
          ? `<section class="section">
        <div class="section-head"><h2>Zuletzt</h2></div>
        <div class="list">${hist
          .map(
            (h) => `<div class="list-row hist"><span class="fav-icon">${I[MODES[h.mode]?.icon || 'runden']}</span>
            <span class="fav-text"><b>${esc(h.title)}</b><small>${new Date(h.at).toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' })} · ${new Date(h.at).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}${h.rounds ? ` · ${h.rounds} Runden` : ''}</small></span>
            <span class="hist-time">${fmtUp(h.dur)}</span></div>`,
          )
          .join('')}</div>
      </section>`
          : ''
      }
      <p class="wake-note" id="wake-note"></p>
    </main>`;
  bindWakeNote();
}

function bindWakeNote() {
  const el = document.getElementById('wake-note');
  if (!el) return;
  const off = onWakeChange((m) => {
    if (!document.body.contains(el)) return off();
    el.innerHTML =
      m === 'off'
        ? settings.get().keepAwake
          ? '<span class="dot"></span> Einmal tippen – dann bleibt der Bildschirm an'
          : 'Bildschirm darf sich ausschalten'
        : `<span class="dot on"></span> Bildschirm bleibt immer an`;
  });
}

function safeSummary(mode, cfg) {
  try {
    return summary(mode, { ...MODES[mode].defaults, ...cfg });
  } catch {
    return { total: 0 };
  }
}

// ---------- editor ----------
let editMode = null;
let editCfg = null;

function renderEditor(mode) {
  document.body.className = 'page-editor';
  const def = MODES[mode];
  if (editMode !== mode || !editCfg) {
    editMode = mode;
    editCfg = configs.get(mode, def.defaults);
  }
  const sameMode = app.querySelector('.editor') && app.dataset.mode === mode;
  const scroll = sameMode ? window.scrollY : 0;
  app.dataset.mode = mode;
  const sm = summary(mode, editCfg);
  app.innerHTML = `
    <header class="topbar">
      <button class="round-btn" data-act="home" aria-label="Zurück">${I.back}</button>
      <h1>${def.title}</h1>
      <div class="topbar-right">
        <button class="round-btn" data-act="save-fav" aria-label="Als Favorit speichern">${I.star}</button>
        <button class="round-btn" data-act="share-cfg" aria-label="Teilen">${I.share}</button>
      </div>
    </header>
    <main class="editor">
      <div class="summary card">
        <div class="sum-total">${sm.total === Infinity ? (mode === 'stoppuhr' ? '0:00' : 'offen') : fmtTotal(sm.total)}</div>
        <div class="sum-sub">${summaryText(mode, editCfg, sm)}</div>
        ${timeline(mode, editCfg)}
      </div>
      ${
        def.presets
          ? `<div class="chips">${def.presets.map((p, i) => `<button class="chip" data-act="preset" data-i="${i}">${esc(p.name)}</button>`).join('')}</div>`
          : ''
      }
      ${def.custom ? intervalEditor(editCfg) : fieldsEditor(def, editCfg)}
      <div class="spacer"></div>
    </main>
    <div class="start-bar">
      <button class="start-btn" data-act="start">${I.play}<span>Start</span></button>
    </div>`;
  window.scrollTo(0, scroll);
}

function summaryText(mode, cfg, sm) {
  switch (mode) {
    case 'tabata':
      return `${cfg.rounds} Runden × ${cfg.sets} ${cfg.sets > 1 ? 'Sätze' : 'Satz'} · ${fmtSec(cfg.work)} / ${fmtSec(cfg.rest)}`;
    case 'runden':
      return `${cfg.rounds} × ${fmtSec(cfg.round)}${cfg.rest ? ` · ${fmtSec(cfg.rest)} Pause` : ''}`;
    case 'stoppuhr':
      return 'Zählt hoch · Rundenzeiten per Tipp';
    case 'intervalle':
      return `${sm.segments} Abschnitte · ${(cfg.blocks || []).length} ${(cfg.blocks || []).length === 1 ? 'Block' : 'Blöcke'}`;
    case 'countdown':
      return 'Zählt runter bis 0';
    case 'amrap':
      return 'Runden zählen per Tipp auf den Zähler';
    case 'fortime':
      return cfg.cap ? `Time Cap ${fmtSec(cfg.cap)} · Runden zählen` : 'Ohne Time Cap · Runden zählen';
  }
  return '';
}

function timeline(mode, cfg) {
  const p = compile(mode, cfg);
  const total = totalMs(p);
  if (total === Infinity || !total || p.segments.length > 400) return '';
  return `<div class="timeline">${p.segments
    .map((s) => `<span style="flex:${s.dur};background:${s.color}"></span>`)
    .join('')}</div>`;
}

function fieldsEditor(def, cfg) {
  return `<div class="card group">${def.fields
    .filter((f) => !f.showIf || f.showIf(cfg))
    .map((f) => fieldRow(f, cfg[f.id]))
    .join('')}</div>`;
}

function fieldRow(f, val) {
  const dot = f.accent ? `<span class="dot" style="background:${KIND[f.accent].color}"></span>` : '';
  if (f.type === 'time') {
    return `<div class="row">
      <span class="row-label">${dot}${esc(f.label)}</span>
      <div class="stepper">
        <button class="step" data-act="dec" data-f="${f.id}" aria-label="weniger">${I.minus}</button>
        <button class="val" data-act="pick-time" data-f="${f.id}">${val === 0 && f.min === 0 ? '<span class="off">aus</span>' : fmtSec(val)}</button>
        <button class="step" data-act="inc" data-f="${f.id}" aria-label="mehr">${I.plus}</button>
      </div>
    </div>`;
  }
  return `<div class="row">
    <span class="row-label">${dot}${esc(f.label)}</span>
    <div class="stepper">
      <button class="step" data-act="dec" data-f="${f.id}" aria-label="weniger">${I.minus}</button>
      <button class="val" data-act="pick-count" data-f="${f.id}">${val}</button>
      <button class="step" data-act="inc" data-f="${f.id}" aria-label="mehr">${I.plus}</button>
    </div>
  </div>`;
}

function intervalEditor(cfg) {
  const blocks = cfg.blocks || [];
  return `
    <div class="card group">
      ${fieldRow({ id: 'prep', type: 'time', label: 'Vorbereiten', min: 0 }, cfg.prep)}
    </div>
    ${blocks
      .map(
        (b, bi) => `
      <div class="card block" data-bi="${bi}">
        <div class="block-head">
          <input class="block-name" data-in="block-name" data-bi="${bi}" value="${esc(b.name)}" placeholder="Block ${bi + 1}" maxlength="40">
          <div class="block-tools">
            <button class="icon-btn subtle" data-act="block-up" data-bi="${bi}" aria-label="nach oben" ${bi === 0 ? 'disabled' : ''}>${I.up}</button>
            <button class="icon-btn subtle" data-act="block-dup" data-bi="${bi}" aria-label="duplizieren">${I.copy}</button>
            <button class="icon-btn subtle" data-act="block-del" data-bi="${bi}" aria-label="löschen">${I.trash}</button>
          </div>
        </div>
        <div class="row">
          <span class="row-label">Wiederholungen</span>
          <div class="stepper">
            <button class="step" data-act="rep-dec" data-bi="${bi}">${I.minus}</button>
            <button class="val" data-act="rep-pick" data-bi="${bi}">${b.repeats}×</button>
            <button class="step" data-act="rep-inc" data-bi="${bi}">${I.plus}</button>
          </div>
        </div>
        <div class="steps">
          ${b.steps
            .map(
              (s, si) => `
            <div class="step-row">
              <button class="color-dot" data-act="step-color" data-bi="${bi}" data-si="${si}" style="background:${s.color}" aria-label="Farbe"></button>
              <div class="step-main">
                <input class="step-name" data-in="step-name" data-bi="${bi}" data-si="${si}" value="${esc(s.name)}" placeholder="${s.kind === 'rest' ? 'Pause' : 'Übung'}" maxlength="40">
                <button class="kind-pill ${s.kind}" data-act="step-kind" data-bi="${bi}" data-si="${si}">${s.kind === 'rest' ? 'Pause' : 'Arbeit'}</button>
              </div>
              <button class="val small" data-act="step-time" data-bi="${bi}" data-si="${si}">${fmtSec(s.dur)}</button>
              <div class="step-tools">
                <button class="icon-btn tiny" data-act="step-up" data-bi="${bi}" data-si="${si}" ${si === 0 ? 'disabled' : ''} aria-label="hoch">${I.up}</button>
                <button class="icon-btn tiny" data-act="step-del" data-bi="${bi}" data-si="${si}" aria-label="löschen">${I.close}</button>
              </div>
            </div>`,
            )
            .join('')}
        </div>
        <div class="block-add">
          <button class="ghost-btn" data-act="step-add" data-bi="${bi}" data-kind="work">${I.plus} Übung</button>
          <button class="ghost-btn" data-act="step-add" data-bi="${bi}" data-kind="rest">${I.plus} Pause</button>
        </div>
      </div>`,
      )
      .join('')}
    <button class="add-block" data-act="block-add">${I.plus} Block hinzufügen</button>
    <div class="card group">
      ${fieldRow({ id: 'cool', type: 'time', label: 'Cool-down', min: 0 }, cfg.cool)}
    </div>`;
}

function saveEdit() {
  configs.set(editMode, editCfg);
  renderEditor(editMode);
}

function fieldDef(id) {
  const def = MODES[editMode];
  if (def.fields) return def.fields.find((f) => f.id === id);
  return { id, type: 'time', min: 0 };
}

function stepTime(v, dir) {
  // sensible increments: 5 s up to 1 min, 15 s up to 5 min, 1 min above
  if (dir > 0) return v < 60 ? v + 5 : v < 300 ? v + 15 : v + 60;
  return v <= 60 ? v - 5 : v <= 300 ? v - 15 : v - 60;
}

// ---------- sheets ----------
function openSheet(html, onMount) {
  sheetRoot.innerHTML = `<div class="sheet-backdrop" data-act="sheet-close"></div><div class="sheet" role="dialog">${html}</div>`;
  requestAnimationFrame(() => sheetRoot.classList.add('open'));
  onMount?.(sheetRoot.querySelector('.sheet'));
}
function closeSheet() {
  if (!sheetRoot.classList.contains('open')) return;
  sheetRoot.classList.remove('open');
  setTimeout(() => {
    if (!sheetRoot.classList.contains('open')) sheetRoot.innerHTML = '';
  }, 250);
}

const ITEM_H = 44;
function wheel(id, values, selected, fmt = (v) => v) {
  return `<div class="wheel" data-wheel="${id}">
    <div class="wheel-pad"></div>
    ${values.map((v) => `<div class="wheel-item" data-v="${v}">${fmt(v)}</div>`).join('')}
    <div class="wheel-pad"></div>
  </div>`;
}
function mountWheel(el, values, selected) {
  const idx = Math.max(0, values.indexOf(selected));
  el.scrollTop = idx * ITEM_H;
  const mark = () => {
    const i = clamp(Math.round(el.scrollTop / ITEM_H), 0, values.length - 1);
    el.querySelectorAll('.wheel-item').forEach((it, j) => it.classList.toggle('sel', j === i));
    return values[i];
  };
  mark();
  let t;
  el.addEventListener('scroll', () => {
    mark();
    clearTimeout(t);
  });
  el.addEventListener('click', (e) => {
    const it = e.target.closest('.wheel-item');
    if (!it) return;
    const i = [...el.querySelectorAll('.wheel-item')].indexOf(it);
    el.scrollTo({ top: i * ITEM_H, behavior: 'smooth' });
  });
  return () => mark();
}

function openTimePicker(label, seconds, min, cb) {
  const mins = Array.from({ length: 100 }, (_, i) => i);
  const secs = Array.from({ length: 60 }, (_, i) => i);
  const quick = [10, 20, 30, 45, 60, 90, 120, 180, 300, 600];
  openSheet(
    `<div class="sheet-head"><button class="link" data-act="sheet-close">Abbrechen</button><b>${esc(label)}</b><button class="link strong" data-act="time-ok">Fertig</button></div>
     <div class="wheels">
       ${wheel('m', mins, Math.floor(seconds / 60), (v) => v)}
       <span class="wheel-unit">min</span>
       ${wheel('s', secs, seconds % 60, pad)}
       <span class="wheel-unit">sek</span>
       <div class="wheel-highlight"></div>
     </div>
     <div class="chips center">${quick.map((q) => `<button class="chip" data-act="time-quick" data-v="${q}">${fmtSec(q)}</button>`).join('')}</div>`,
    (sheet) => {
      const wm = sheet.querySelector('[data-wheel=m]');
      const ws = sheet.querySelector('[data-wheel=s]');
      const gm = mountWheel(wm, mins, Math.floor(seconds / 60));
      const gs = mountWheel(ws, secs, seconds % 60);
      sheetHandlers['time-ok'] = () => {
        const v = Math.max(min ?? 0, gm() * 60 + gs());
        closeSheet();
        cb(v);
      };
      sheetHandlers['time-quick'] = (el) => {
        closeSheet();
        cb(Math.max(min ?? 0, +el.dataset.v));
      };
    },
  );
}

function openCountPicker(label, value, min, max, cb) {
  const vals = Array.from({ length: max - min + 1 }, (_, i) => i + min);
  openSheet(
    `<div class="sheet-head"><button class="link" data-act="sheet-close">Abbrechen</button><b>${esc(label)}</b><button class="link strong" data-act="count-ok">Fertig</button></div>
     <div class="wheels single">${wheel('n', vals, value)}<div class="wheel-highlight"></div></div>`,
    (sheet) => {
      const g = mountWheel(sheet.querySelector('[data-wheel=n]'), vals, value);
      sheetHandlers['count-ok'] = () => {
        const v = g();
        closeSheet();
        cb(v);
      };
    },
  );
}

function openNamePrompt(title, initial, cb) {
  openSheet(
    `<div class="sheet-head"><button class="link" data-act="sheet-close">Abbrechen</button><b>${esc(title)}</b><button class="link strong" data-act="name-ok">Sichern</button></div>
     <div class="sheet-body"><input class="text-input" id="name-input" value="${esc(initial)}" maxlength="40" enterkeyhint="done"></div>`,
    (sheet) => {
      const inp = sheet.querySelector('#name-input');
      setTimeout(() => {
        inp.focus();
        inp.select();
      }, 50);
      const ok = () => {
        const v = inp.value.trim();
        if (!v) return;
        closeSheet();
        cb(v);
      };
      inp.addEventListener('keydown', (e) => e.key === 'Enter' && ok());
      sheetHandlers['name-ok'] = ok;
    },
  );
}

function openSettings() {
  const st = settings.get();
  const tg = (key, label, sub = '') => `
    <label class="row toggle-row">
      <span class="row-label">${label}${sub ? `<small>${sub}</small>` : ''}</span>
      <input type="checkbox" class="switch" data-set="${key}" ${st[key] ? 'checked' : ''}>
    </label>`;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  openSheet(
    `<div class="sheet-head"><span></span><b>Einstellungen</b><button class="link strong" data-act="sheet-close">Fertig</button></div>
     <div class="sheet-body">
       <div class="card group">
         ${tg('sound', 'Signaltöne')}
         ${tg('voice', 'Sprachansage', 'Sagt Übung / Pause an')}
         ${tg('vibrate', 'Vibration', 'Nur Android')}
         ${tg('keepAwake', 'Bildschirm immer an', 'Auch im Menü – im Timer sowieso immer')}
         ${tg('soundWhenMuted', 'Ton trotz Stumm-Schalter', 'iPhone: stoppt dabei laufende Musik')}
         <div class="row"><span class="row-label">Lautstärke</span><input type="range" min="0.1" max="1" step="0.05" value="${st.volume}" data-set="volume" class="range"></div>
         <div class="row"><span class="row-label">Test</span><button class="ghost-btn" data-act="test-sound">${I.sound} Ton testen</button></div>
       </div>
       ${
         standalone
           ? ''
           : `<div class="card tip"><b>Als App installieren</b><p>iPhone: Safari → Teilen → „Zum Home-Bildschirm“. Android: Menü → „App installieren“. Dann läuft der Timer im Vollbild und offline.</p></div>`
       }
       <div class="card tip"><b>Tipp</b><p>Auf dem iPhone den Stumm-Schalter prüfen, falls kein Ton kommt. Bildschirm bleibt während der App automatisch an.</p></div>
       ${history.all().length ? `<button class="ghost-btn danger wide" data-act="hist-clear">${I.trash} Verlauf löschen</button>` : ''}
     </div>`,
    (sheet) => {
      sheet.addEventListener('change', (e) => {
        const k = e.target.dataset.set;
        if (!k) return;
        settings.set({ [k]: e.target.type === 'checkbox' ? e.target.checked : +e.target.value });
        if (k === 'keepAwake') e.target.checked ? keepAwake() : allowSleep();
        if (k === 'soundWhenMuted') unlockAudio();
      });
      sheet.addEventListener('input', (e) => {
        if (e.target.dataset.set === 'volume') settings.set({ volume: +e.target.value });
      });
    },
  );
}

const sheetHandlers = {};

// ---------- actions ----------
const actions = {
  home: () => go('/'),
  settings: openSettings,
  'sheet-close': closeSheet,
  'share-app': () => shareLink(location.origin + '/', 'Zeitschaltuhr – Workout Timer'),
  'test-sound': () => {
    unlockAudio();
    cue.work();
    speak('Los geht’s');
  },
  'hist-clear': () => {
    if (!confirm('Verlauf wirklich löschen?')) return;
    history.clear();
    closeSheet();
    if (!location.hash || location.hash === '#/') renderHome();
  },
  'fav-open': (el) => {
    const f = favorites.all().find((x) => x.id === el.dataset.id);
    if (!f) return;
    editMode = f.mode;
    editCfg = { ...structuredClone(MODES[f.mode].defaults), ...structuredClone(f.cfg) };
    configs.set(f.mode, editCfg);
    go('/m/' + f.mode);
  },
  'fav-play': (el) => {
    const f = favorites.all().find((x) => x.id === el.dataset.id);
    if (!f) return;
    startRun(f.mode, { ...MODES[f.mode].defaults, ...f.cfg }, f.name);
  },
  'fav-del': (el) => {
    const f = favorites.all().find((x) => x.id === el.dataset.id);
    if (!f || !confirm(`„${f.name}“ löschen?`)) return;
    favorites.remove(f.id);
    renderHome();
  },
  preset: (el) => {
    const p = MODES[editMode].presets[+el.dataset.i];
    editCfg = { ...editCfg, ...p.cfg };
    saveEdit();
    toast(p.name);
  },
  inc: (el) => changeField(el.dataset.f, +1),
  dec: (el) => changeField(el.dataset.f, -1),
  'pick-time': (el) => {
    const f = fieldDef(el.dataset.f);
    openTimePicker(f.label || '', editCfg[f.id], f.min, (v) => {
      editCfg[f.id] = v;
      saveEdit();
    });
  },
  'pick-count': (el) => {
    const f = fieldDef(el.dataset.f);
    openCountPicker(f.label, editCfg[f.id], f.min, f.max, (v) => {
      editCfg[f.id] = v;
      saveEdit();
    });
  },
  'save-fav': () => {
    const def = MODES[editMode];
    openNamePrompt('Favorit speichern', `${def.title} ${fmtTotal(summary(editMode, editCfg).total)}`, (name) => {
      favorites.add({ name, mode: editMode, cfg: structuredClone(editCfg) });
      toast('Als Favorit gespeichert');
    });
  },
  'share-cfg': () => {
    const url = `${location.origin}/#/m/${editMode}?c=${encodeCfg(editCfg)}`;
    shareLink(url, `${MODES[editMode].title} – Zeitschaltuhr`);
  },
  start: () => startRun(editMode, editCfg, MODES[editMode].title),

  // interval builder
  'rep-inc': (el) => {
    const b = editCfg.blocks[+el.dataset.bi];
    b.repeats = clamp(b.repeats + 1, 1, 99);
    saveEdit();
  },
  'rep-dec': (el) => {
    const b = editCfg.blocks[+el.dataset.bi];
    b.repeats = clamp(b.repeats - 1, 1, 99);
    saveEdit();
  },
  'rep-pick': (el) => {
    const b = editCfg.blocks[+el.dataset.bi];
    openCountPicker('Wiederholungen', b.repeats, 1, 99, (v) => {
      b.repeats = v;
      saveEdit();
    });
  },
  'block-add': () => {
    editCfg.blocks.push({
      name: `Block ${editCfg.blocks.length + 1}`,
      repeats: 1,
      steps: [
        { name: 'Übung', dur: 45, kind: 'work', color: STEP_COLORS[editCfg.blocks.length % STEP_COLORS.length] },
        { name: 'Pause', dur: 15, kind: 'rest', color: KIND.rest.color },
      ],
    });
    saveEdit();
  },
  'block-del': (el) => {
    const bi = +el.dataset.bi;
    if (editCfg.blocks[bi].steps.length > 1 && !confirm('Block löschen?')) return;
    editCfg.blocks.splice(bi, 1);
    saveEdit();
  },
  'block-dup': (el) => {
    const bi = +el.dataset.bi;
    const copy = structuredClone(editCfg.blocks[bi]);
    copy.name = copy.name + ' (Kopie)';
    editCfg.blocks.splice(bi + 1, 0, copy);
    saveEdit();
  },
  'block-up': (el) => {
    const bi = +el.dataset.bi;
    if (bi < 1) return;
    const [b] = editCfg.blocks.splice(bi, 1);
    editCfg.blocks.splice(bi - 1, 0, b);
    saveEdit();
  },
  'step-add': (el) => {
    const b = editCfg.blocks[+el.dataset.bi];
    const rest = el.dataset.kind === 'rest';
    const workCount = b.steps.filter((s) => s.kind !== 'rest').length;
    b.steps.push(
      rest
        ? { name: 'Pause', dur: 15, kind: 'rest', color: KIND.rest.color }
        : { name: `Übung ${workCount + 1}`, dur: 40, kind: 'work', color: STEP_COLORS[workCount % STEP_COLORS.length] },
    );
    saveEdit();
  },
  'step-del': (el) => {
    const b = editCfg.blocks[+el.dataset.bi];
    b.steps.splice(+el.dataset.si, 1);
    saveEdit();
  },
  'step-up': (el) => {
    const b = editCfg.blocks[+el.dataset.bi];
    const si = +el.dataset.si;
    if (si < 1) return;
    [b.steps[si - 1], b.steps[si]] = [b.steps[si], b.steps[si - 1]];
    saveEdit();
  },
  'step-kind': (el) => {
    const s = editCfg.blocks[+el.dataset.bi].steps[+el.dataset.si];
    s.kind = s.kind === 'rest' ? 'work' : 'rest';
    if (s.kind === 'rest' && s.color !== KIND.rest.color) s.color = KIND.rest.color;
    else if (s.kind === 'work' && s.color === KIND.rest.color) s.color = KIND.work.color;
    saveEdit();
  },
  'step-color': (el) => {
    const s = editCfg.blocks[+el.dataset.bi].steps[+el.dataset.si];
    const i = STEP_COLORS.indexOf(s.color);
    s.color = STEP_COLORS[(i + 1) % STEP_COLORS.length];
    saveEdit();
  },
  'step-time': (el) => {
    const s = editCfg.blocks[+el.dataset.bi].steps[+el.dataset.si];
    openTimePicker(s.name || 'Dauer', s.dur, 1, (v) => {
      s.dur = v;
      saveEdit();
    });
  },
};

function changeField(id, dir) {
  const f = fieldDef(id);
  let v = editCfg[id];
  if (f.type === 'count') v = clamp(v + dir, f.min, f.max);
  else v = clamp(stepTime(v, dir), f.min ?? 0, 99 * 60 + 59);
  editCfg[id] = v;
  saveEdit();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  if (sheetHandlers[act] && sheetRoot.contains(el)) return sheetHandlers[act](el);
  if (actions[act]) {
    e.preventDefault();
    actions[act](el);
  }
});

// text inputs in the interval builder update without re-render (keeps keyboard open)
document.addEventListener('input', (e) => {
  const k = e.target.dataset.in;
  if (!k || !editCfg) return;
  const b = editCfg.blocks[+e.target.dataset.bi];
  if (k === 'block-name') b.name = e.target.value;
  if (k === 'step-name') b.steps[+e.target.dataset.si].name = e.target.value;
  configs.set(editMode, editCfg);
});

// hold +/- to repeat
let holdTimer, holdIv;
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.step[data-act]');
  if (!el) return;
  // buttons get replaced on every re-render, so re-find this one by position
  const pos = [...document.querySelectorAll('.step[data-act]')].indexOf(el);
  holdTimer = setTimeout(() => {
    holdIv = setInterval(() => {
      const again = document.querySelectorAll('.step[data-act]')[pos];
      if (again) actions[again.dataset.act]?.(again);
    }, 110);
  }, 450);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((t) =>
  document.addEventListener(t, () => {
    clearTimeout(holdTimer);
    clearInterval(holdIv);
  }),
);

// ---------- run ----------
function startRun(mode, cfg, title) {
  unlockAudio(); // inside the tap gesture
  keepAwake(); // a running workout always keeps the screen on
  current = { mode, cfg: structuredClone(cfg), title };
  go('/run');
}

function teardownRun() {
  if (engine) engine.destroy();
  engine = null;
  runView = null;
  document.body.classList.remove('locked');
  if (!settings.get().keepAwake) allowSleep();
}

function renderRun() {
  document.body.className = 'page-run';
  if (engine) engine.destroy();
  const program = compile(current.mode, current.cfg);
  if (!program.segments.length) {
    toast('Workout ist leer');
    return go('/m/' + current.mode);
  }
  const total = totalMs(program);
  const isStopwatch = program.laps;

  app.innerHTML = `
    <div class="run" id="run">
      <div class="run-bg"></div>
      <header class="run-top">
        <button class="round-btn glass" data-run="close" aria-label="Beenden">${I.close}</button>
        <div class="run-title">
          <b>${esc(current.title)}</b>
          <span class="wake-pill" id="wake-pill"></span>
        </div>
        <div class="topbar-right">
          <button class="round-btn glass" data-run="mute" aria-label="Ton">${settings.get().sound ? I.sound : I.mute}</button>
          <button class="round-btn glass" data-run="lock" aria-label="Sperren">${I.unlock}</button>
        </div>
      </header>

      <div class="run-main" data-run="toggle-area">
        <div class="phase" id="phase"></div>
        <div class="ring-wrap">
          <svg class="ring" viewBox="0 0 200 200" aria-hidden="true">
            <circle class="ring-bg" cx="100" cy="100" r="92"/>
            <circle class="ring-fg" id="ring" cx="100" cy="100" r="92" pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="0"/>
          </svg>
          <div class="clock">
            <div class="time" id="time">0:00</div>
            <div class="time-sub" id="time-sub"></div>
            <div class="paused-tag" id="paused-tag">Pausiert · tippen zum Fortsetzen</div>
          </div>
        </div>
        <div class="meta" id="meta"></div>
        <div class="next" id="next"></div>
      </div>

      ${program.counter ? `<button class="counter-btn" data-run="round"><span class="counter-n" id="counter">0</span><span class="counter-l">Runden · tippen für +1</span><span class="counter-split" id="split"></span></button>` : ''}
      ${isStopwatch ? `<div class="laps" id="laps"></div>` : ''}

      <div class="total ${total === Infinity ? 'hidden' : ''}">
        <div class="total-bar"><span id="total-fill"></span></div>
        <div class="total-row"><span id="total-el">0:00</span><span id="total-rem"></span></div>
      </div>

      <div class="controls">
        ${
          isStopwatch
            ? `<button class="ctl" data-run="lap" aria-label="Runde">${I.flag}<small>Runde</small></button>`
            : program.finishButton
              ? `<button class="ctl" data-run="undo-round" aria-label="Runde zurück">${I.minus}<small>−1 Runde</small></button>`
              : `<button class="ctl" data-run="prev" aria-label="Zurück">${I.prev}</button>`
        }
        <button class="ctl main" data-run="toggle" id="toggle" aria-label="Pause">${I.pause}</button>
        ${
          isStopwatch || program.finishButton
            ? `<button class="ctl" data-run="finish" aria-label="Fertig">${I.check}<small>Fertig</small></button>`
            : `<button class="ctl" data-run="next" aria-label="Weiter">${I.next}</button>`
        }
      </div>

      <div class="lock-shield" data-run="shield"><button class="round-btn glass big" data-run="unlock-hold">${I.lock}</button><span>Gedrückt halten zum Entsperren</span></div>
      <div class="done" id="done"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);
  runView = {
    root: $('run'),
    phase: $('phase'),
    time: $('time'),
    timeSub: $('time-sub'),
    ring: $('ring'),
    meta: $('meta'),
    next: $('next'),
    counter: $('counter'),
    split: $('split'),
    laps: $('laps'),
    totalFill: $('total-fill'),
    totalEl: $('total-el'),
    totalRem: $('total-rem'),
    toggle: $('toggle'),
    done: $('done'),
    total,
    last: {},
  };

  const offWake = onWakeChange((m) => {
    const pill = document.getElementById('wake-pill');
    if (!pill) return offWake();
    pill.innerHTML = m === 'off' ? '<span class="dot"></span> Bildschirm kann sperren' : '<span class="dot on"></span> Bildschirm bleibt an';
    pill.classList.toggle('warn', m === 'off');
  });

  engine = new Engine(program, {
    segment: onSegment,
    count: (n) => cue.count(n),
    halfway: (s) => {
      if (!settings.get().halfway) return;
      cue.halfway();
      if (s.dur >= 60000) speak('Halbzeit');
    },
    tick: updateRun,
    done: onDone,
  });
  engine.start();
}

function onSegment(seg, idx, { silent }) {
  if (!runView) return;
  runView.root.style.setProperty('--phase', seg.color);
  runView.root.dataset.kind = seg.kind;
  runView.root.classList.remove('flash');
  void runView.root.offsetWidth;
  runView.root.classList.add('flash');
  if (silent) return;
  const segs = engine.segs;
  const isWork = seg.kind === 'work' || seg.kind === 'up';
  if (isWork) cue.work();
  else if (seg.kind === 'prep') cue.halfway();
  else cue.rest();

  let text = seg.speakName ? seg.label : KIND[seg.kind].speak;
  if (isWork && seg.rounds > 1 && !seg.speakName) {
    const lastWork = !segs.slice(idx + 1).some((s) => s.kind === 'work');
    if (lastWork) text = 'Letzte Runde!';
    else if (seg.round && current.mode === 'runden') text = `Runde ${seg.round}`;
  }
  if (seg.kind === 'rest' || seg.kind === 'setrest') {
    const nx = segs[idx + 1];
    if (nx && nx.speakName) text = `Pause. Danach ${nx.label}`;
  }
  // give the beep a moment before the voice
  setTimeout(() => speak(text), 350);
}

function segMeta(seg) {
  const parts = [];
  if (seg.block && seg.blocks > 1) parts.push(esc(seg.block));
  if (seg.rounds > 1) parts.push(`Runde <b>${seg.round}</b>/${seg.rounds}`);
  if (seg.sets > 1) parts.push(`Satz <b>${seg.set}</b>/${seg.sets}`);
  return parts.join('<i>·</i>');
}

function setHTML(el, key, html) {
  if (!el || runView.last[key] === html) return;
  runView.last[key] = html;
  el.innerHTML = html;
}

function updateRun() {
  if (!runView || !engine) return;
  const e = engine;
  const seg = e.seg;
  if (!seg) return;
  const el = e.segElapsed();
  const v = runView;

  // big clock
  let main, sub = '';
  if (seg.up) {
    const upMs = el;
    main = fmtUp(upMs);
    if (e.p.laps) sub = '.' + pad(Math.floor((upMs % 1000) / 10));
    else if (seg.dur !== Infinity) sub = `Cap ${fmtTotal(seg.dur)}`;
  } else {
    main = fmtDown(seg.dur - el);
    sub = `von ${fmtTotal(seg.dur)}`;
  }
  setHTML(v.time, 'time', main);
  setHTML(v.timeSub, 'sub', sub);
  v.time.classList.toggle('long', main.length > 5);

  // ring
  let frac;
  if (seg.dur === Infinity) frac = (el % 60000) / 60000;
  else frac = clamp(el / seg.dur, 0, 1);
  const off = seg.up ? 1000 - frac * 1000 : frac * 1000;
  v.ring.style.strokeDashoffset = off.toFixed(1);

  setHTML(v.phase, 'phase', esc(seg.label));
  setHTML(v.meta, 'meta', segMeta(seg));

  const nx = e.segs[e.idx + 1];
  setHTML(v.next, 'next', nx ? `<span>Als Nächstes</span> <b style="color:${nx.color}">${esc(nx.label)}</b> ${nx.dur !== Infinity ? fmtTotal(nx.dur) : ''}` : e.p.laps || seg.up ? '' : '<span>Letzter Abschnitt</span>');

  // counter / laps
  if (v.counter) {
    setHTML(v.counter, 'counter', String(e.rounds));
    const s = e.roundSplits;
    const lastSplit = s.length ? s[s.length - 1] - (s.length > 1 ? s[s.length - 2] : 0) : null;
    setHTML(v.split, 'split', lastSplit != null ? `letzte Runde ${fmtUp(lastSplit)}` : '');
  }
  if (v.laps) {
    const html = e.laps
      .map((l, i) => ({ l, i }))
      .reverse()
      .map(({ l, i }) => `<div class="lap"><span>Runde ${i + 1}</span><span>${fmtUp(l.split)}.${pad(Math.floor((l.split % 1000) / 10))}</span><span class="dim">${fmtUp(l.at)}</span></div>`)
      .join('');
    setHTML(v.laps, 'laps', html);
  }

  // total
  if (v.total !== Infinity) {
    const done = e.scheduledElapsed();
    v.totalFill.style.width = ((done / v.total) * 100).toFixed(2) + '%';
    setHTML(v.totalEl, 'tel', fmtUp(done));
    setHTML(v.totalRem, 'trem', '−' + fmtDown(v.total - done));
  }

  const paused = e.started && !e.running && !e.finished;
  if (v.last.paused !== paused) {
    v.last.paused = paused;
    v.toggle.innerHTML = paused ? I.play : I.pause;
    v.root.classList.toggle('is-paused', paused);
  }
}

function onDone() {
  if (!runView) return;
  cue.done();
  setTimeout(() => speak('Geschafft! Stark!'), 900);
  const e = engine;
  const dur = e.totalElapsed();
  history.add({ mode: current.mode, title: current.title, dur, rounds: e.rounds || e.laps.length || 0 });
  updateRun();
  const v = runView;
  v.root.classList.add('finished');
  v.root.style.setProperty('--phase', '#30D158');
  const extra =
    e.rounds > 0
      ? `<div class="done-stat"><b>${e.rounds}</b><span>Runden</span></div>`
      : e.laps.length
        ? `<div class="done-stat"><b>${e.laps.length}</b><span>Runden</span></div>`
        : '';
  v.done.innerHTML = `
    <div class="done-card">
      <div class="done-emoji">${I.check}</div>
      <h2>Geschafft!</h2>
      <div class="done-stats">
        <div class="done-stat"><b>${fmtUp(dur)}</b><span>Zeit</span></div>
        ${extra}
      </div>
      <div class="done-actions">
        <button class="ghost-btn wide" data-run="again">${I.restart} Nochmal</button>
        <button class="start-btn" data-run="exit">Fertig</button>
      </div>
    </div>`;
}

let holdUnlockT;
const runActions = {
  toggle: () => engine?.toggle(),
  'toggle-area': () => engine?.toggle(),
  prev: () => engine?.prev(),
  next: () => engine?.next(),
  finish: () => engine?.finish(),
  lap: () => {
    if (!engine?.running) return;
    engine.lap();
    cue.tap();
  },
  round: () => {
    if (!engine?.running) return;
    engine.addRound();
    cue.tap();
  },
  'undo-round': () => {
    if (!engine || engine.rounds < 1) return;
    engine.rounds--;
    engine.roundSplits.pop();
    updateRun();
  },
  mute: (el) => {
    settings.set({ sound: !settings.get().sound, voice: !settings.get().sound });
    el.innerHTML = settings.get().sound ? I.sound : I.mute;
    toast(settings.get().sound ? 'Ton an' : 'Ton aus');
  },
  lock: () => {
    document.body.classList.add('locked');
    toast('Gesperrt – Schloss gedrückt halten');
  },
  close: () => {
    if (engine && engine.started && !engine.finished && !confirm('Workout beenden?')) return;
    current = null;
    go('/');
  },
  again: () => {
    const c = current;
    startRun(c.mode, c.cfg, c.title);
  },
  exit: () => {
    current = null;
    go('/');
  },
};

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-run]');
  if (!el) return;
  if (document.body.classList.contains('locked')) return;
  const a = el.dataset.run;
  // taps on counter/laps inside the main area must not toggle pause
  if (a === 'toggle-area' && e.target.closest('button')) return;
  runActions[a]?.(el);
});

app.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('[data-run="unlock-hold"]')) return;
  const btn = e.target.closest('[data-run="unlock-hold"]');
  btn.classList.add('holding');
  holdUnlockT = setTimeout(() => {
    document.body.classList.remove('locked');
    btn.classList.remove('holding');
    cue.tap();
  }, 800);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((t) =>
  app.addEventListener(t, () => {
    clearTimeout(holdUnlockT);
    document.querySelector('.holding')?.classList.remove('holding');
  }),
);

// keyboard: space = pause, arrows = skip (handy on tablets with keyboard / desktop)
document.addEventListener('keydown', (e) => {
  if (!engine || e.target.matches('input')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    engine.toggle();
  } else if (e.code === 'ArrowRight') engine.next();
  else if (e.code === 'ArrowLeft') engine.prev();
});

// warn before leaving a running workout
window.addEventListener('beforeunload', (e) => {
  if (engine && engine.started && !engine.finished) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------- boot ----------
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
route();
