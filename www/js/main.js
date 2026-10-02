import { MODES, MODE_ORDER, KIND, STEP_COLORS, compile, totalMs, summary, intervalName, intervalColor, normalizeIntervals, isLegacySample } from './modes.js';
import { Engine } from './engine.js';
import { cue, speak, unlockAudio, nativeOpts } from './audio.js';
import { isNative, native } from './native.js';
import { keepAwake, allowSleep, onWakeChange } from './wakelock.js';
import { settings, configs, favorites, history, wipeAll } from './store.js';
import { I } from './icons.js';
import { t, tw, LANGS, lang, locale, deviceLang, voiceLang } from './i18n.js';

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
function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
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


// Screen stays on across the whole app from the moment the page loads.
if (settings.get().keepAwake) keepAwake();

// ---------- router ----------
let current = null; // { mode, cfg, title }
let engine = null;
let runView = null;

function route() {
  document.documentElement.lang = lang();
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
        const cfg = mergeCfg(parts[1], data);
        configs.set(parts[1], cfg);
        toast(t('t.imported'));
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
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return t('greet.night');
  if (h < 11) return t('greet.morning');
  if (h < 17) return t('greet.day');
  if (h < 22) return t('greet.evening');
  return t('greet.late');
}

function renderHome() {
  document.body.className = 'page-home';
  const favs = favorites.all();
  const allHist = history.all();
  const hist = allHist.slice(0, 5);
  const name = (settings.get().name || '').trim();
  const last = allHist.find((h) => h.cfg && MODES[h.mode]);
  const date = new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  app.innerHTML = `
    <header class="topbar">
      <button class="round-btn" data-act="settings" aria-label="${t('a.settings')}">${I.user}</button>
      <span class="wordmark">GRIT<i>.</i></span>
      <span></span>
    </header>
    <main class="home">
      <section class="hero">
        <p class="eyebrow">${esc(date)}</p>
        <h1 class="display">${esc(greeting())}${name ? `,<br><em>${esc(name)}</em>` : '<em>.</em>'}</h1>
      </section>


      ${
        last
          ? `<button class="quick" data-act="quick-last">
          <span class="quick-text"><small>${t('home.again')}</small><b>${esc(last.title)}</b><span>${fmtTotal(safeSummary(last.mode, last.cfg).total)} · ${esc(MODES[last.mode].title)}</span></span>
          <span class="quick-play">${I.play}</span>
        </button>`
          : ''
      }

      <div class="grid">
        ${MODE_ORDER.map(
          (m, i) => `
          <a class="mode-card ${i === MODE_ORDER.length - 1 && MODE_ORDER.length % 2 ? 'wide' : ''}" href="#/m/${m}">
            <span class="mode-tag" aria-hidden="true">${MODES[m].tag}</span>
            <span class="mode-icon ${m === 'tabata' ? 'double' : ''}">${I[MODES[m].icon]}</span>
            <span class="mode-title">${MODES[m].title}</span>
            <span class="mode-sub">${MODES[m].sub}</span>
          </a>`,
        ).join('')}
      </div>

      <section class="section">
        <div class="section-head"><h2>${t('home.favorites')}</h2></div>
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
                    <button class="icon-btn subtle" data-act="fav-del" data-id="${f.id}" aria-label="${t('a.delete')}">${I.trash}</button>
                    <button class="play-mini" data-act="fav-play" data-id="${f.id}" aria-label="${t('a.start')}">${I.play}</button>
                  </div>`;
                })
                .join('')}</div>`
            : `<p class="empty">${t('home.favEmpty', { star: I.star })}</p>`
        }
      </section>

      ${
        hist.length
          ? `<section class="section">
        <div class="section-head"><h2>${t('home.recent')}</h2></div>
        <div class="list">${hist
          .map(
            (h) => `<div class="list-row hist"><span class="fav-icon">${I[MODES[h.mode]?.icon || 'runden']}</span>
            <span class="fav-text"><b>${esc(h.title)}</b><small>${new Date(h.at).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })} · ${new Date(h.at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}${h.rounds ? ` · ${t('home.roundsN', { n: h.rounds })}` : ''}</small></span>
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
          ? `<span class="dot"></span> ${t('wake.tap')}`
          : t('wake.off')
        : `<span class="dot on"></span> ${t('wake.on')}`;
  });
}

// defaults + saved config; old interval configs (blocks) are converted instead of being
// shadowed by the default interval list
function mergeCfg(mode, cfg) {
  const c = { ...structuredClone(MODES[mode].defaults), ...structuredClone(cfg || {}) };
  if (mode === 'intervalle' && cfg && cfg.blocks && !cfg.intervals) {
    delete c.intervals;
    normalizeIntervals(c);
  }
  return c;
}

function safeSummary(mode, cfg) {
  try {
    return summary(mode, mergeCfg(mode, cfg));
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
    if (mode === 'intervalle' && (editCfg.blocks || isLegacySample(editCfg))) {
      if (editCfg.blocks) delete editCfg.intervals; // old block format wins over the merged-in defaults
      normalizeIntervals(editCfg);
      configs.set(mode, editCfg);
    }
  }
  const sameMode = app.querySelector('.editor') && app.dataset.mode === mode;
  const scroll = sameMode ? window.scrollY : 0;
  app.dataset.mode = mode;
  const sm = summary(mode, editCfg);
  app.innerHTML = `
    <header class="topbar">
      <button class="round-btn" data-act="home" aria-label="${t('a.back')}">${I.back}</button>
      <h1>${def.title}</h1>
      <div class="topbar-right">
        <button class="round-btn" data-act="save-fav" aria-label="${t('a.saveFav')}">${I.star}</button>
      </div>
    </header>
    <main class="editor">
      <div class="summary card">
        <div class="sum-total">${sm.total === Infinity ? (mode === 'stoppuhr' ? '0:00' : t('e.open')) : fmtTotal(sm.total)}</div>
        <div class="sum-sub">${summaryText(mode, editCfg, sm)}</div>
        ${timeline(mode, editCfg)}
      </div>
      ${
        def.presets
          ? `<div class="chips">${def.presets.map((p, i) => `<button class="chip" data-act="preset" data-i="${i}">${esc(p.name)}</button>`).join('')}</div>`
          : ''
      }
      ${def.custom ? intervalEditor(editCfg) : fieldsEditor(def, editCfg)}
      <button class="reset-link" data-act="reset-cfg">${I.restart} ${t('e.reset')}</button>
      <div class="spacer"></div>
    </main>
    <div class="start-bar">
      <button class="start-btn" data-act="start">${I.play}<span>${t('e.start')}</span></button>
    </div>`;
  window.scrollTo(0, scroll);
}

function summaryText(mode, cfg, sm) {
  switch (mode) {
    case 'tabata':
      return `${cfg.rounds} ${tw('round', cfg.rounds)} × ${cfg.sets} ${tw('set', cfg.sets)} · ${fmtSec(cfg.work)} / ${fmtSec(cfg.rest)}`;
    case 'runden':
      return `${cfg.rounds} × ${fmtSec(cfg.round)}${cfg.rest ? ` · ${fmtSec(cfg.rest)} ${t('w.pause')}` : ''}`;
    case 'stoppuhr':
      return t('sum.stoppuhr');
    case 'intervalle':
      return `${(cfg.intervals || []).length} ${tw('interval', (cfg.intervals || []).length)} × ${cfg.repeats || 1} ${tw('round', cfg.repeats || 1)}`;
    case 'countdown':
      return t('sum.countdown');
    case 'amrap':
      return t('sum.amrap');
    case 'fortime':
      return cfg.cap ? t('sum.ftCap', { cap: fmtSec(cfg.cap) }) : t('sum.ftNo');
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
        <button class="step" data-act="dec" data-f="${f.id}" aria-label="${t('a.less')}">${I.minus}</button>
        <button class="val" data-act="pick-time" data-f="${f.id}">${val === 0 && f.min === 0 ? `<span class="off">${t('e.off')}</span>` : fmtSec(val)}</button>
        <button class="step" data-act="inc" data-f="${f.id}" aria-label="${t('a.more')}">${I.plus}</button>
      </div>
    </div>`;
  }
  return `<div class="row">
    <span class="row-label">${dot}${esc(f.label)}</span>
    <div class="stepper">
      <button class="step" data-act="dec" data-f="${f.id}" aria-label="${t('a.less')}">${I.minus}</button>
      <button class="val" data-act="pick-count" data-f="${f.id}">${val}</button>
      <button class="step" data-act="inc" data-f="${f.id}" aria-label="${t('a.more')}">${I.plus}</button>
    </div>
  </div>`;
}

function intervalEditor(cfg) {
  const ivs = cfg.intervals || [];
  const timeStepper = (i, k, val, min) => `
    <div class="stepper">
      <button class="step" data-act="iv-dec" data-i="${i}" data-k="${k}" aria-label="${t('a.less')}">${I.minus}</button>
      <button class="val" data-act="iv-pick" data-i="${i}" data-k="${k}">${val === 0 && min === 0 ? `<span class="off">${t('e.off')}</span>` : fmtSec(val)}</button>
      <button class="step" data-act="iv-inc" data-i="${i}" data-k="${k}" aria-label="${t('a.more')}">${I.plus}</button>
    </div>`;
  return `
    <div class="card group">
      ${fieldRow({ id: 'prep', type: 'time', label: t('f.prep'), min: 0 }, cfg.prep)}
    </div>
    <div class="iv-list">
      ${ivs
        .map(
          (iv, i) => `
        <div class="card iv">
          <div class="iv-head">
            <button class="iv-color" data-act="iv-color" data-i="${i}" style="background:${intervalColor(iv, i)}" aria-label="${t('a.color')}"></button>
            <input class="iv-name" data-in="iv-name" data-i="${i}" value="${esc(iv.name || '')}" placeholder="${esc(t('iv.n', { n: i + 1 }))}" maxlength="40" enterkeyhint="done">
            <div class="block-tools">
              <button class="icon-btn subtle" data-act="iv-up" data-i="${i}" aria-label="${t('a.up')}" ${i === 0 ? 'disabled' : ''}>${I.up}</button>
              <button class="icon-btn subtle" data-act="iv-dup" data-i="${i}" aria-label="${t('a.dup')}">${I.copy}</button>
              <button class="icon-btn subtle" data-act="iv-del" data-i="${i}" aria-label="${t('a.delete')}" ${ivs.length < 2 ? 'disabled' : ''}>${I.trash}</button>
            </div>
          </div>
          <div class="row"><span class="row-label"><span class="dot" style="background:${intervalColor(iv, i)}"></span>${t('iv.dur')}</span>${timeStepper(i, 'work', iv.work, 1)}</div>
          <div class="row iv-rest"><span class="row-label"><span class="dot" style="background:${KIND.rest.color}"></span>${t('iv.pause')}</span>${timeStepper(i, 'rest', iv.rest, 0)}</div>
        </div>`,
        )
        .join('')}
    </div>
    <button class="add-block" data-act="iv-add">${I.plus} ${t('iv.add')}</button>
    <div class="card group">
      ${fieldRow({ id: 'repeats', type: 'count', label: t('f.repeats'), min: 1, max: 99 }, cfg.repeats)}
      ${fieldRow({ id: 'cool', type: 'time', label: t('f.cool'), min: 0 }, cfg.cool)}
    </div>`;
}

function saveEdit() {
  configs.set(editMode, editCfg);
  renderEditor(editMode);
}

function fieldDef(id) {
  const def = MODES[editMode];
  if (def.fields) return def.fields.find((f) => f.id === id);
  if (id === 'repeats') return { id, type: 'count', label: t('f.repeats'), min: 1, max: 99 };
  return { id, type: 'time', min: 0, label: id === 'prep' ? t('f.prep') : t('f.cool') };
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
    `<div class="sheet-head"><button class="link" data-act="sheet-close">${t('s.cancel')}</button><b>${esc(label)}</b><button class="link strong" data-act="time-ok">${t('s.done')}</button></div>
     <div class="wheels">
       ${wheel('m', mins, Math.floor(seconds / 60), (v) => v)}
       <span class="wheel-unit">${t('s.min')}</span>
       ${wheel('s', secs, seconds % 60, pad)}
       <span class="wheel-unit">${t('s.sec')}</span>
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
    `<div class="sheet-head"><button class="link" data-act="sheet-close">${t('s.cancel')}</button><b>${esc(label)}</b><button class="link strong" data-act="count-ok">${t('s.done')}</button></div>
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
    `<div class="sheet-head"><button class="link" data-act="sheet-close">${t('s.cancel')}</button><b>${esc(title)}</b><button class="link strong" data-act="name-ok">${t('s.save')}</button></div>
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
  const cur = st.lang && LANGS[st.lang] ? st.lang : 'auto';
  openSheet(
    `<div class="sheet-head"><span></span><b>${t('set.title')}</b><button class="link strong" data-act="sheet-close">${t('s.done')}</button></div>
     <div class="sheet-body">
       <div class="card group">
         <div class="row"><span class="row-label">${t('set.lang')}</span>
           <select class="select" data-set="lang">
             <option value="auto" ${cur === 'auto' ? 'selected' : ''}>${esc(t('set.langAuto', { name: LANGS[deviceLang()].name }))}</option>
             ${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${v.name}</option>`).join('')}
           </select>
         </div>
         <div class="row"><span class="row-label">${t('set.name')}</span><input class="name-input" data-set="name" value="${esc(st.name || '')}" placeholder="${esc(t('set.namePh'))}" maxlength="24" autocomplete="given-name"></div>
       </div>
       <div class="card group">
         ${tg('sound', t('set.sound'))}
         ${tg('voice', t('set.voice'), t('set.voiceSub'))}
         ${tg('vibrate', t('set.vibrate'), t('set.vibrateSub'))}
         ${tg('keepAwake', t('set.keepAwake'), t('set.keepAwakeSub'))}
         <div class="row"><span class="row-label">${t('set.volume')}</span><input type="range" min="0.1" max="1" step="0.05" value="${st.volume}" data-set="volume" class="range"></div>
         <div class="row"><span class="row-label">${t('set.test')}</span><button class="ghost-btn" data-act="test-sound">${I.sound} ${t('set.testBtn')}</button></div>
       </div>
       <div class="card tip"><b>${t('tip.t')}</b><p>${t('tip.app')}</p></div>
       <div class="card tip"><b>${t('priv.title')}</b><p>${t('priv.body')}</p></div>
       <button class="ghost-btn danger wide" data-act="delete-all">${I.trash} ${t('priv.deleteAll')}</button>
       ${history.all().length ? `<button class="ghost-btn danger wide" data-act="hist-clear">${I.trash} ${t('hist.clear')}</button>` : ''}
     </div>`,
    (sheet) => {
      sheet.addEventListener('change', (e) => {
        const k = e.target.dataset.set;
        if (!k) return;
        if (k === 'lang') {
          settings.set({ lang: e.target.value === 'auto' ? null : e.target.value });
          route(); // re-render the current screen in the new language (closes the sheet)
          setTimeout(openSettings, 280);
          return;
        }
        settings.set({ [k]: e.target.type === 'checkbox' ? e.target.checked : k === 'name' ? e.target.value.trim() : +e.target.value });
        if (k === 'keepAwake') e.target.checked ? keepAwake() : allowSleep();
      });
      sheet.addEventListener('input', (e) => {
        if (e.target.dataset.set === 'volume') settings.set({ volume: +e.target.value });
        if (e.target.dataset.set === 'name') {
          settings.set({ name: e.target.value.trim() });
          if (document.body.className === 'page-home') {
            const h = document.querySelector('.display');
            const n = e.target.value.trim();
            if (h) h.innerHTML = `${esc(greeting())}${n ? `,<br><em>${esc(n)}</em>` : '<em>.</em>'}`;
          }
        }
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
  'quick-last': () => {
    const h = history.all().find((x) => x.cfg && MODES[x.mode]);
    if (h) startRun(h.mode, mergeCfg(h.mode, h.cfg), h.title);
  },
  'test-sound': () => {
    unlockAudio();
    cue.work();
    speak(t('v.test'));
  },
  'delete-all': () => {
    if (!confirm(t('priv.deleteConfirm'))) return;
    wipeAll();
    editMode = null;
    editCfg = null;
    closeSheet();
    go('/');
    setTimeout(() => toast(t('priv.deleted')), 300);
  },
  'hist-clear': () => {
    if (!confirm(t('hist.confirm'))) return;
    history.clear();
    closeSheet();
    if (!location.hash || location.hash === '#/') renderHome();
  },
  'fav-open': (el) => {
    const f = favorites.all().find((x) => x.id === el.dataset.id);
    if (!f) return;
    editMode = f.mode;
    editCfg = mergeCfg(f.mode, f.cfg);
    configs.set(f.mode, editCfg);
    go('/m/' + f.mode);
  },
  'fav-play': (el) => {
    const f = favorites.all().find((x) => x.id === el.dataset.id);
    if (!f) return;
    startRun(f.mode, mergeCfg(f.mode, f.cfg), f.name);
  },
  'fav-del': (el) => {
    const f = favorites.all().find((x) => x.id === el.dataset.id);
    if (!f || !confirm(t('t.delConfirm', { name: f.name }))) return;
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
    openNamePrompt(t('t.favTitle'), `${def.title} ${fmtTotal(summary(editMode, editCfg).total)}`, (name) => {
      favorites.add({ name, mode: editMode, cfg: structuredClone(editCfg) });
      toast(t('t.favSaved'));
    });
  },
  start: () => startRun(editMode, editCfg, MODES[editMode].title),
  'reset-cfg': () => {
    if (!confirm(t('e.resetConfirm'))) return;
    editCfg = structuredClone(MODES[editMode].defaults);
    saveEdit();
    toast(t('e.resetDone'));
  },

  // interval builder
  'iv-inc': (el) => changeInterval(el, +1),
  'iv-dec': (el) => changeInterval(el, -1),
  'iv-pick': (el) => {
    const i = +el.dataset.i;
    const k = el.dataset.k;
    const iv = editCfg.intervals[i];
    openTimePicker(k === 'rest' ? t('iv.restAfter', { name: intervalName(iv, i) }) : intervalName(iv, i), iv[k], k === 'rest' ? 0 : 1, (v) => {
      iv[k] = v;
      saveEdit();
    });
  },
  'iv-add': () => {
    const last = editCfg.intervals[editCfg.intervals.length - 1];
    editCfg.intervals.push({ name: '', work: last ? last.work : 40, rest: last ? last.rest : 20 });
    saveEdit();
  },
  'iv-del': (el) => {
    if (editCfg.intervals.length < 2) return;
    editCfg.intervals.splice(+el.dataset.i, 1);
    saveEdit();
  },
  'iv-dup': (el) => {
    const i = +el.dataset.i;
    editCfg.intervals.splice(i + 1, 0, structuredClone(editCfg.intervals[i]));
    saveEdit();
  },
  'iv-up': (el) => {
    const i = +el.dataset.i;
    if (i < 1) return;
    const a = editCfg.intervals;
    [a[i - 1], a[i]] = [a[i], a[i - 1]];
    saveEdit();
  },
  'iv-color': (el) => {
    const i = +el.dataset.i;
    const iv = editCfg.intervals[i];
    const cur = STEP_COLORS.indexOf(intervalColor(iv, i));
    iv.color = STEP_COLORS[(cur + 1) % STEP_COLORS.length];
    saveEdit();
  },
};

function changeInterval(el, dir) {
  const iv = editCfg.intervals[+el.dataset.i];
  const k = el.dataset.k;
  iv[k] = clamp(stepTime(iv[k], dir), k === 'rest' ? 0 : 1, 99 * 60 + 59);
  saveEdit();
}

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
  if (k === 'iv-name') editCfg.intervals[+e.target.dataset.i].name = e.target.value;
  configs.set(editMode, editCfg);
  // live-update the summary line without re-rendering (keeps the keyboard open)
  const sub = app.querySelector('.sum-sub');
  if (sub) sub.textContent = summaryText(editMode, editCfg, summary(editMode, editCfg));
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
  if (engine && isNative) native('stop');
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
    toast(t('t.empty'));
    return go('/m/' + current.mode);
  }
  const total = totalMs(program);
  const isStopwatch = program.laps;

  app.innerHTML = `
    <div class="run" id="run">
      <div class="run-bg"></div>
      <div class="run-drain" id="drain"></div>
      <header class="run-top">
        <button class="round-btn glass" data-run="close" aria-label="${t('a.end')}">${I.close}</button>
        <div class="run-title">
          <b>${esc(current.title)}</b>
          <span class="wake-pill" id="wake-pill"></span>
        </div>
        <div class="topbar-right">
          <button class="round-btn glass" data-run="mute" aria-label="${t('a.sound')}">${settings.get().sound ? I.sound : I.mute}</button>
          <button class="round-btn glass" data-run="lock" aria-label="${t('a.lock')}">${I.unlock}</button>
        </div>
      </header>

      <div class="run-main" data-run="toggle-area">
        <div class="meta" id="meta"></div>
        <div class="phase" id="phase"></div>
        <div class="clock">
          <div class="time" id="time">0:00</div>
          <div class="time-sub" id="time-sub"></div>
        </div>
        <div class="paused-tag" id="paused-tag">${t('r.paused')}</div>
      </div>
      <div class="next" id="next"></div>

      ${program.counter ? `<button class="counter-btn" data-run="round"><span class="counter-n" id="counter">0</span><span class="counter-l">${t('r.rounds')}</span><span class="counter-split" id="split"></span></button>` : ''}
      ${isStopwatch ? `<div class="laps" id="laps"></div>` : ''}

      <div class="total ${total === Infinity ? 'hidden' : ''}">
        <div class="total-bar"><span id="total-fill"></span></div>
        <div class="total-row"><span id="total-el">0:00</span><span id="total-rem"></span></div>
      </div>

      <div class="controls">
        ${
          isStopwatch
            ? `<button class="ctl" data-run="lap" aria-label="${t('r.lap')}">${I.flag}<small>${t('r.lap')}</small></button>`
            : program.finishButton
              ? `<button class="ctl" data-run="undo-round" aria-label="${t('r.minusRound')}">${I.minus}<small>${t('r.minusRound')}</small></button>`
              : `<button class="ctl" data-run="prev" aria-label="${t('a.prev')}">${I.prev}</button>`
        }
        <button class="ctl main" data-run="toggle" id="toggle" aria-label="${t('a.pause')}">${I.pause}</button>
        ${
          isStopwatch || program.finishButton
            ? `<button class="ctl" data-run="finish" aria-label="${t('r.finish')}">${I.check}<small>${t('r.finish')}</small></button>`
            : `<button class="ctl" data-run="next" aria-label="${t('a.next')}">${I.next}</button>`
        }
      </div>

      <div class="lock-shield" data-run="shield"><button class="round-btn glass big" data-run="unlock-hold">${I.lock}</button><span>${t('r.unlock')}</span></div>
      <div class="done" id="done"></div>
    </div>`;

  const $ = (id) => document.getElementById(id);
  runView = {
    root: $('run'),
    phase: $('phase'),
    time: $('time'),
    timeSub: $('time-sub'),
    drain: $('drain'),
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
    pill.innerHTML = m === 'off' ? `<span class="dot"></span> ${t('wake.pillOff')}` : `<span class="dot on"></span> ${t('wake.pillOn')}`;
    pill.classList.toggle('warn', m === 'off');
  });

  engine = new Engine(program, {
    segment: onSegment,
    count: (n) => {
      if (!isNative) cue.count(n); // in the app the native engine plays the scheduled beeps
      // pulse the digits on 3-2-1
      runView.time.classList.remove('pulse');
      void runView.time.offsetWidth;
      runView.time.classList.add('pulse');
    },
    halfway: (s) => {
      if (!settings.get().halfway || isNative) return;
      cue.halfway();
      if (s.dur >= 60000) speak(t('v.halfway'));
    },
    tick: updateRun,
    done: onDone,
    change: syncNative,
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
  if (silent || isNative) return; // app: sounds come from the native schedule
  const c = segmentCue(seg, idx, engine.segs);
  cue[c.sound]();
  // give the beep a moment before the voice
  setTimeout(() => speak(c.text), 350);
}

// What a segment start sounds like and says — shared by web playback and the native schedule
function segmentCue(seg, idx, segs) {
  const isWork = seg.kind === 'work' || seg.kind === 'up';
  const sound = isWork ? 'work' : seg.kind === 'prep' ? 'halfway' : 'rest';
  let text = seg.speakName ? seg.label : KIND[seg.kind].speak;
  if (isWork && seg.rounds > 1 && !seg.speakName) {
    const lastWork = !segs.slice(idx + 1).some((s) => s.kind === 'work');
    if (lastWork) text = t('v.lastRound');
    else if (seg.round && current.mode === 'runden') text = t('v.roundN', { n: seg.round });
  }
  if (seg.kind === 'rest' || seg.kind === 'setrest') {
    const nx = segs[idx + 1];
    if (nx && nx.speakName) text = t('v.restThen', { name: nx.label });
  }
  return { sound, text };
}

// Native app: hand the whole remaining workout to iOS as timed cues, so beeps and voice keep
// coming with the screen locked or the app in the background (and mix with Spotify & co.).
function buildCues(e) {
  const now = Date.now();
  const cues = [];
  const halfway = settings.get().halfway;
  let at = now - e.segElapsed(); // when the current segment started
  for (let i = e.idx; i < e.segs.length; i++) {
    const s = e.segs[i];
    // the current segment's start cue only if it has just begun (start / skip)
    if (i > e.idx || now - at < 300) {
      const c = segmentCue(s, i, e.segs);
      cues.push({ at: Math.max(at, now), sound: c.sound, text: c.text, lang: voiceLang() });
    }
    if (s.dur === Infinity) return cues;
    if (halfway && s.dur >= 20000) cues.push({ at: at + s.dur / 2, sound: 'halfway', text: s.dur >= 60000 ? t('v.halfway') : null, lang: voiceLang() });
    if (s.dur >= 5000) for (const n of [3, 2, 1]) cues.push({ at: at + s.dur - n * 1000, sound: 'count', haptic: true });
    at += s.dur;
  }
  cues.push({ at, sound: 'done', text: t('v.done'), lang: voiceLang(), haptic: true });
  return cues.filter((c) => c.at >= now - 50);
}

function syncNative() {
  if (!isNative || !engine) return;
  const cues = engine.running && !engine.finished ? buildCues(engine) : [];
  native('schedule', { cues, ...nativeOpts() });
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && engine && engine.running) syncNative();
});

function segMeta(seg) {
  const parts = [];
  if (seg.block && seg.blocks > 1) parts.push(esc(seg.block));
  if (seg.rounds > 1) parts.push(t('r.metaRound', { r: seg.round, n: seg.rounds }));
  if (seg.sets > 1) parts.push(t('r.metaSet', { r: seg.set, n: seg.sets }));
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
    else if (seg.dur !== Infinity) sub = t('r.cap', { t: fmtTotal(seg.dur) });
  } else {
    main = fmtDown(seg.dur - el);
    sub = t('r.of', { t: fmtTotal(seg.dur) });
  }
  setHTML(v.time, 'time', main);
  setHTML(v.timeSub, 'sub', sub);
  v.time.classList.toggle('long', main.length > 5);

  // the colour drains from the top as the segment runs (count-up: one sweep per minute)
  let frac;
  if (seg.dur === Infinity) frac = (el % 60000) / 60000;
  else frac = clamp(el / seg.dur, 0, 1);
  v.drain.style.transform = `scaleY(${frac.toFixed(4)})`;
  v.root.classList.toggle('final', !seg.up && seg.dur !== Infinity && seg.dur - el <= 3000 && seg.dur >= 5000);

  setHTML(v.phase, 'phase', esc(seg.label));
  v.phase.classList.toggle('long', seg.label.length > 9);
  setHTML(v.meta, 'meta', segMeta(seg));

  const nx = e.segs[e.idx + 1];
  setHTML(
    v.next,
    'next',
    nx
      ? `<i style="background:${nx.color}"></i><span>${t('r.next')}</span><b>${esc(nx.label)}</b><em>${nx.dur !== Infinity ? fmtTotal(nx.dur) : ''}</em>`
      : e.p.laps || seg.up
        ? ''
        : `<i style="background:#fff"></i><span>${t('r.finale')}</span><b>${t('r.giveAll')}</b>`,
  );
  v.next.classList.toggle('empty', !v.next.innerHTML);

  // counter / laps
  if (v.counter) {
    setHTML(v.counter, 'counter', String(e.rounds));
    const s = e.roundSplits;
    const lastSplit = s.length ? s[s.length - 1] - (s.length > 1 ? s[s.length - 2] : 0) : null;
    setHTML(v.split, 'split', lastSplit != null ? t('r.lastSplit', { t: fmtUp(lastSplit) }) : t('r.tapPlus'));
  }
  if (v.laps) {
    const html = e.laps
      .map((l, i) => ({ l, i }))
      .reverse()
      .map(({ l, i }) => `<div class="lap"><span>${t('r.lapN', { n: i + 1 })}</span><span>${fmtUp(l.split)}.${pad(Math.floor((l.split % 1000) / 10))}</span><span class="dim">${fmtUp(l.at)}</span></div>`)
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
  if (!isNative) {
    cue.done();
    setTimeout(() => speak(t('v.done')), 900);
  } else if (!engine.endedNaturally) {
    // finished by hand (For Time / stopwatch "Done"): nothing was scheduled for this moment
    native('play', { sound: 'done', text: t('v.done'), lang: voiceLang(), haptic: true, ...nativeOpts() });
  }
  const e = engine;
  const dur = e.totalElapsed();
  history.add({ mode: current.mode, title: current.title, cfg: current.cfg, dur, rounds: e.rounds || e.laps.length || 0 });
  updateRun();
  const v = runView;
  v.root.classList.add('finished');
  v.root.style.setProperty('--phase', '#EFD814');
  v.drain.style.transform = 'scaleY(0)';
  const extra =
    e.rounds > 0
      ? `<div class="done-stat"><b>${e.rounds}</b><span>${t('d.rounds')}</span></div>`
      : e.laps.length
        ? `<div class="done-stat"><b>${e.laps.length}</b><span>${t('d.rounds')}</span></div>`
        : '';
  v.done.innerHTML = `
    <div class="done-card">
      <div class="done-emoji">${I.check}</div>
      <h2>${t('d.title')}<span>.</span></h2>
      <p class="done-sub">${esc(current.title)} · ${new Date().toLocaleDateString(locale(), { weekday: 'long' })}</p>
      <div class="done-stats">
        <div class="done-stat"><b>${fmtUp(dur)}</b><span>${t('d.time')}</span></div>
        ${extra}
      </div>
      <div class="done-actions">
        <button class="ghost-btn wide" data-run="again">${I.restart} ${t('d.again')}</button>
        <button class="start-btn" data-run="exit">${t('d.exit')}</button>
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
    syncNative();
    toast(settings.get().sound ? t('t.soundOn') : t('t.soundOff'));
  },
  lock: () => {
    document.body.classList.add('locked');
    toast(t('t.locked'));
  },
  close: () => {
    if (engine && engine.started && !engine.finished && !confirm(t('t.endConfirm'))) return;
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
route();
