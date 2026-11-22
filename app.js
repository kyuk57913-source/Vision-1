
const $ = id => document.getElementById(id);
const KEY = 'pnl-trades';
const S = { trades: [], tab: 'journal', symbol: 'ALL', month: null, day: null,
            editing: null, side: 'Buy', res: 'Profit', session: '', confirmDel: false, drawn: false, pending: null, sheetOpen: false };

/* ---------- helpers ---------- */
const sum = a => a.reduce((s, v) => s + v, 0);
const avg = a => a.length ? sum(a) / a.length : null;
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
const cls = n => n > 0 ? 'win' : n < 0 ? 'loss' : '';
const fixed = (n, d) => Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const sgn = n => n > 0 ? '+' : n < 0 ? '\u2212' : '';
const money = n => (n == null ? '\u2014' : sgn(n) + '$' + fixed(n, 2));
const px = n => n == null ? '' : String(+n.toFixed(5));
const pts = n => n == null ? '' : sgn(n) + fixed(n, 1) + ' pts';
const rtxt = n => n == null ? '\u2014' : sgn(n) + fixed(n, 1) + 'R';
const pfTxt = st => st.pf == null ? (st.gw > 0 ? '\u221e' : '\u2014') : fixed(st.pf, 2);
const rrtxt = n => n == null ? '\u2014' : '1:' + fixed(n, 1);
const compact = n => { const a = Math.abs(n), r = Math.round(a); return (a >= 1000 || r > 0 ? sgn(n) : '') + (a >= 1000 ? (a / 1000).toFixed(1) + 'k' : r); };

/* ---------- hide / show amounts (eye button) ---------- */
let MASK = false; try { MASK = localStorage.getItem('pnl-mask') === '1'; } catch (e) {}
const MSK = '\u2022\u2022\u2022\u2022\u2022';
const EYE_OPEN = '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>';
const eyeBtn = () => `<button class="eye" data-act="eye" aria-label="${MASK ? 'Show' : 'Hide'} amounts" aria-pressed="${MASK}"><svg viewBox="0 0 24 24" aria-hidden="true">${EYE_OPEN}${MASK ? '<path d="M4 20L20 4"/>' : ''}</svg></button>`;
function applyMask() {
  document.documentElement.classList.toggle('mask', MASK);
  if (!MASK) return;
  const RE = /[+\u2212-]?\$\s?[\d,]+(?:\.\d+)?/g;
  ['hero', 'stats', 'list', 'reports'].forEach(id => {
    const root = document.getElementById(id); if (!root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = []; let n;
    while ((n = w.nextNode())) nodes.push(n);
    nodes.forEach(t => {
      const txt = t.nodeValue; if (txt.search(RE) < 0 || !t.parentNode) return;
      const frag = document.createDocumentFragment(); let last = 0, m; RE.lastIndex = 0;
      while ((m = RE.exec(txt))) {
        if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
        const sp = document.createElement('span'); sp.className = 'mk'; sp.textContent = MSK; frag.appendChild(sp);
        last = m.index + m[0].length;
      }
      if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
      t.parentNode.replaceChild(frag, t);
    });
    root.querySelectorAll('.cell .a').forEach(e => { e.innerHTML = '<span class="mk">\u2022\u2022\u2022</span>'; });
    root.querySelectorAll('[aria-label]').forEach(e => { if (e.classList.contains('cell')) e.removeAttribute('aria-label'); });
  });
}
const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayLabel = s => parseDay(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const monthLabel = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); };
const shiftMonth = (ym, k) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2200);
}

/* ---------- trade maths ---------- */
function calc(t) {
  const dir = t.side === 'Sell' ? -1 : 1;
  const risk = (t.entry != null && t.sl != null) ? Math.abs(t.entry - t.sl) : null;
  const reward = (t.entry != null && t.tp != null) ? Math.abs(t.tp - t.entry) : null;
  const rr = (risk > 0 && reward != null) ? reward / risk : null;
  const p = (t.entry != null && t.exit != null) ? (t.exit - t.entry) * dir : null;
  const r = (p != null && risk > 0) ? p / risk : null;
  return { risk, reward, rr, pts: p, r };
}

function stats(tr) {
  const w = tr.filter(t => t.pnl > 0), l = tr.filter(t => t.pnl < 0);
  const gw = sum(w.map(t => t.pnl)), gl = Math.abs(sum(l.map(t => t.pnl)));
  let cum = 0, pk = 0, dd = 0;
  tr.forEach(t => { cum += t.pnl; pk = Math.max(pk, cum); dd = Math.max(dd, pk - cum); });
  const decided = w.length + l.length;
  const cs = tr.map(calc);
  const net = sum(tr.map(t => t.pnl));
  return {
    n: tr.length, net,
    winRate: decided ? w.length / decided : null,
    pf: gl ? gw / gl : null, gw,
    exp: tr.length ? net / tr.length : null,
    avgW: w.length ? gw / w.length : null,
    avgL: l.length ? -gl / l.length : null,
    dd,
    avgRR: avg(cs.map(c => c.rr).filter(v => v != null)),
    avgR: avg(cs.map(c => c.r).filter(v => v != null))
  };
}

/* ---------- accounts ---------- */
const ACK = 'pnl-accounts';
const AC = { list: [{ id: 'main', name: 'Main' }], active: 'main' };
try { const v = JSON.parse(localStorage.getItem(ACK) || 'null'); if (v && Array.isArray(v.list) && v.list.length) { AC.list = v.list; AC.active = v.list.some(a => a.id === v.active) ? v.active : v.list[0].id; } } catch (e) {}
const saveAc = () => { try { localStorage.setItem(ACK, JSON.stringify(AC)); } catch (e) {} };
const acCur = () => AC.list.find(a => a.id === AC.active) || AC.list[0];
const acKey = id => id === 'main' ? KEY : KEY + '-' + id;
const trKey = () => acKey(AC.active);

/* ---------- storage: trades live in IndexedDB (copy kept in memory for instant reads); localStorage is only the fallback ---------- */
const TS = { mode: 'ls', cache: new Map(), chain: new Map(), db: null, persisted: null };
const tsWithTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const tsOpen = () => tsWithTimeout(new Promise((res, rej) => {
  if (!window.indexedDB) return rej(new Error('no idb'));
  const rq = indexedDB.open('pnl-data', 1);
  rq.onupgradeneeded = () => { try { rq.result.createObjectStore('trades'); } catch (e) {} };
  rq.onsuccess = () => res(rq.result);
  rq.onerror = () => rej(rq.error || new Error('idb error'));
  rq.onblocked = () => rej(new Error('idb blocked'));
}), 5000);
const tsTx = (mode, fn) => new Promise((res, rej) => {
  const tx = TS.db.transaction('trades', mode); let rq;
  tx.oncomplete = () => res(rq ? rq.result : undefined);
  tx.onerror = tx.onabort = () => rej(tx.error || new Error('idb tx'));
  rq = fn(tx.objectStore('trades'));
});
const tsLs = k => { try { const v = localStorage.getItem(k), a = v ? JSON.parse(v) : null; return Array.isArray(a) ? a : null; } catch (e) { return null; } };
const tsGet = k => TS.cache.get(k) || [];
const tsQueue = (k, fn) => { const p = (TS.chain.get(k) || Promise.resolve()).then(fn); TS.chain.set(k, p.catch(() => {})); return p; };
function tsPersist() {   /* ask the browser not to auto-clear our data; not awaited, some browsers show a prompt */
  try {
    const st = navigator.storage; if (!st || !st.persist) return;
    (st.persisted ? st.persisted() : Promise.resolve(false)).then(p => p || st.persist()).then(p => { TS.persisted = !!p; paintStore(); }).catch(() => {});
  } catch (e) {}
}
async function tsInit() {
  tsPersist();
  const keys = AC.list.map(a => acKey(a.id)), put = [], clean = [];
  try { TS.db = await tsOpen(); } catch (e) { TS.db = null; }
  if (TS.db) {
    try {
      for (const k of keys) {
        let v = await tsTx('readonly', s => s.get(k));
        if (!Array.isArray(v)) {
          const old = tsLs(k);
          if (old) {   /* one-time move from localStorage: copy, read back, compare; old copy is removed only after every account passed */
            put.push(k); await tsTx('readwrite', s => s.put(old, k));
            const back = await tsTx('readonly', s => s.get(k));
            if (!Array.isArray(back) || JSON.stringify(back) !== JSON.stringify(old)) throw new Error('verify');
            v = back; clean.push(k);
          }
        }
        if (Array.isArray(v)) TS.cache.set(k, v);
      }
      TS.mode = 'idb';
      clean.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    } catch (e) {
      console.error(e); TS.mode = 'ls'; TS.cache.clear();
      for (const k of put) { try { await tsTx('readwrite', s => s.delete(k)); } catch (e2) {} }   /* never leave a stale copy behind */
    }
  }
  if (TS.mode !== 'idb') {
    for (const k of keys) {
      let v = tsLs(k);
      if (!v) { try { if (window.storage) { const r = await window.storage.get(k); if (r && r.value) v = JSON.parse(r.value); } } catch (e) {} }
      if (v) TS.cache.set(k, v);
    }
  }
}
function tsSet(k, arr) {
  TS.cache.set(k, arr);
  return tsQueue(k, async () => {
    const a = TS.cache.get(k); if (!a) return true;
    if (TS.mode === 'idb') { try { await tsTx('readwrite', s => s.put(a, k)); return true; } catch (e) { console.error(e); return false; } }
    const data = JSON.stringify(a);
    try { localStorage.setItem(k, data); return true; } catch (e) {}
    try { if (window.storage) { await window.storage.set(k, data); return true; } } catch (e) { console.error(e); }
    return false;
  });
}
function tsDel(k) {
  TS.cache.delete(k);
  return tsQueue(k, async () => {
    if (TS.cache.has(k)) return true;
    try { localStorage.removeItem(k); } catch (e) {}
    if (TS.mode === 'idb') { try { await tsTx('readwrite', s => s.delete(k)); } catch (e) { return false; } }
    return true;
  });
}
async function load() { return tsGet(trKey()).slice(); }
async function save() { return tsSet(trKey(), S.trades); }
function paintStore() {
  const el = $('storeNote'); if (!el) return;
  el.textContent = (TS.mode === 'idb' ? 'App database' : 'Browser storage (limited space)') +
    (TS.persisted == null ? '' : TS.persisted ? ' \u00b7 protected from auto-clear' : ' \u00b7 not protected from auto-clear, back up often');
}

/* ---------- views ---------- */
function visible() {
  /* live (still open) trades have no result yet, so they stay out of every statistic */
  const t = (S.symbol === 'ALL' ? S.trades : S.trades.filter(x => x.symbol === S.symbol)).filter(x => !x.live);
  return t.slice().sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

/* ---------- trading pair list + logos (inline, works offline) ---------- */
const DEFAULT_SYMS = ['XAUUSD', 'NAS100', 'USOIL', 'XAGUSD', 'SPX500', 'GBPUSD', 'USDJPY', 'EURUSD', 'USDCAD', 'GBPJPY', 'NZDUSD', 'AUDUSD', 'BTCUSDT', 'SOLUSDT'];
const SYM_ICON = { XAUUSD: 'i-xau', XAGUSD: 'i-xag', USOIL: 'i-oil', NAS100: 'i-nas', SPX500: 'i-spx', BTCUSDT: 'i-btc', BTCUSD: 'i-btc', SOLUSDT: 'i-sol', SOLUSD: 'i-sol' };
const FLAG = { USD: 'us', GBP: 'gb', JPY: 'jp', EUR: 'eu', CAD: 'ca', NZD: 'nz', AUD: 'au', CHF: 'ch' };
const svgUse = (id, cls) => `<svg${cls ? ' class="' + cls + '"' : ''} viewBox="0 0 24 24" aria-hidden="true"><use href="#${id}"/></svg>`;
function symIcon(sym) {
  const s = String(sym || '').toUpperCase();
  if (SYM_ICON[s]) return `<span class="sico">${svgUse(SYM_ICON[s])}</span>`;
  const m = /^([A-Z]{3})([A-Z]{3})$/.exec(s);
  if (m && FLAG[m[1]] && FLAG[m[2]]) return `<span class="spair">${svgUse('fl-' + FLAG[m[2]], 'q')}${svgUse('fl-' + FLAG[m[1]], 'b')}</span>`;
  const t = s.replace(/[^A-Z0-9]/g, '').slice(0, 2) || '?';
  return `<span class="sico"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#3A4350"/><text x="12" y="15.3" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" font-family="Arial,Helvetica,sans-serif">${t}</text></svg></span>`;
}

function renderChips() {
  /* symbol filter chips are switched off: the journal always shows every symbol */
  S.symbol = 'ALL';
  $('chips').hidden = true;
}

function kv(items) {
  return items.map(([k, v, c, rg]) => rg
    ? `<div class="hasrg"><dt>${k}</dt><dd class="${c || ''}">${v}</dd>${rg}</div>`
    : `<div><dt>${k}</dt><dd class="${c || ''}">${v}</dd></div>`).join('');
}


/* icon badge + ring tiles for the Journal stats */
const STAT_ICONS = [
  '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  '<path d="M5 20V9M5 14h6M5 9h5M13 7h7M17 4l3 3-3 3M13 16h7M17 13l3 3-3 3"/>',
  '<circle cx="12" cy="12" r="9"/><path d="M14.6 9.4c-.3-.9-1.2-1.4-2.6-1.4-1.5 0-2.6.7-2.6 1.9 0 2.5 5.2 1.2 5.2 3.8 0 1.2-1.1 2-2.6 2-1.4 0-2.4-.6-2.7-1.6M12 6.5V8M12 16v1.5"/>',
  '<path d="M4 7l6 6 3.5-3.5L20 16M20 10v6h-6"/>',
  '<path d="M4 17l6-6 3.5 3.5L20 8M14 8h6v6"/>',
  '<path d="M4 7l6 6 3.5-3.5L20 16M20 10v6h-6"/>',
  '<path d="M4 12h16M4 8v8M20 8v8M9 10v4M15 10v4"/>',
  '<path d="M3 12h4l3-7 4 14 3-7h4"/>'
];
function statTiles(items) {
  return items.map(([k, v, c, p, ic, tone]) => {
    const q = p == null ? 0 : p, pc = Math.round(q * 100);
    return `<div class="st ${tone}"><div class="sttop"><span class="stl"><svg class="sti" viewBox="0 0 24 24" aria-hidden="true">${STAT_ICONS[ic]}</svg><dt>${k}</dt></span>`
      + `<svg class="str" viewBox="0 0 24 24" role="img" aria-label="${p == null ? 'No data' : pc + '%'}"><circle class="trk" cx="12" cy="12" r="9.5"/>`
      + (q > 0 ? `<circle class="arc" cx="12" cy="12" r="9.5" pathLength="100" stroke-dasharray="${Math.max(3, pc)} 100" transform="rotate(-90 12 12)"/>` : '') + `</svg></div>`
      + `<dd class="${c || ''}">${v}</dd><div class="stbar" aria-hidden="true"><i style="width:${pc}%"></i></div></div>`;
  }).join('');
}

/* ---------- progress rings for the Journal stat tiles ---------- */
function ringVals(tr, st) {
  let cum = 0, pk = 0; tr.forEach(t => { cum += t.pnl; pk = Math.max(pk, cum); });
  const gw = sum(tr.filter(t => t.pnl > 0).map(t => t.pnl)), gl = Math.abs(sum(tr.filter(t => t.pnl < 0).map(t => t.pnl)));
  const aL = st.avgL == null ? null : Math.abs(st.avgL);
  const cl = v => v == null ? null : Math.max(0, Math.min(1, v));
  return [
    cl(st.winRate),                                                              // win rate
    gw + gl > 0 ? cl(gw / (gw + gl)) : null,                                     // profit factor -> share of gross profit
    st.avgW > 0 ? cl(st.exp / st.avgW) : null,                                   // expectancy vs average win
    pk > 0 ? cl(st.dd / pk) : (st.dd > 0 ? 1 : 0),                               // drawdown vs peak profit
    st.avgW != null ? cl(st.avgW / (st.avgW + (aL || 0))) : null,                // average win share
    aL != null ? cl(aL / (aL + (st.avgW || 0))) : null,                          // average loss share
    st.avgRR != null ? cl(st.avgRR / (1 + st.avgRR)) : null,                     // planned reward share
    st.avgR != null && st.avgRR > 0 ? cl(st.avgR / st.avgRR) : null              // result vs planned
  ];
}

function ringHtml(i, p, anim) {
  /* classic: a thin progress line + small percentage */
  const q = p == null ? 0 : p, label = p == null ? '\u2014' : Math.round(q * 100) + '%';
  return `<span class="rgw" aria-hidden="true"><b>${label}</b><i style="width:${Math.round(q * 100)}%"></i></span>`;
}

function tradeRow(t) {
  const c = calc(t);
  const prices = [t.entry != null ? 'Entry ' + px(t.entry) : '', t.exit != null ? 'Exit ' + px(t.exit) : '',
                  t.sl != null ? 'SL ' + px(t.sl) : '', t.tp != null ? 'TP ' + px(t.tp) : '', t.lot != null ? 'Lot ' + t.lot : ''].filter(Boolean).join(' \u00b7 ');
  const sub = [c.pts != null ? pts(c.pts) : '', c.r != null ? rtxt(c.r) : '', c.rr != null ? 'plan ' + rrtxt(c.rr) : '', t.session || ''].filter(Boolean).join(' \u00b7 ');
  return `<button class="trade" data-act="edit" data-id="${t.id}">
    <span class="nm">${symIcon(t.symbol)}<span>${esc(t.symbol)} \u00b7 ${t.side}</span></span><span class="pl ${cls(t.pnl)}">${money(t.pnl)}</span>
    <span class="mt">${esc(prices)}</span><span class="ps">${esc(sub)}</span>
    ${t.note ? `<span class="nt">${esc(t.note)}</span>` : ''}
  </button>`;
}

function summaryHtml(list, all) {
  /* By session / All months (By symbol lives on the Dashboard) */
  const bySes = {}; list.forEach(t => { if (t.session) (bySes[t.session] = bySes[t.session] || []).push(t); });
  const sesRows = SESS.filter(n => bySes[n]).map(n => {
    const x = stats(bySes[n]);
    return `<div class="srow" style="cursor:default"><span class="s">${n}</span><span class="n">${x.n} \u00b7 ${x.winRate == null ? '\u2014' : Math.round(x.winRate * 100) + '%'} won</span><span class="v ${cls(x.net)}">${money(x.net)}</span></div>`;
  }).join('');
  const months = {}; all.forEach(t => (months[t.date.slice(0, 7)] = months[t.date.slice(0, 7)] || []).push(t));
  const monthRows = Object.keys(months).sort().reverse().map(k => {
    const x = stats(months[k]);
    return `<button class="srow" data-act="month" data-m="${k}"><span class="s">${monthLabel(k)}</span><span class="n">${x.n} trade${x.n === 1 ? '' : 's'}</span><span class="v ${cls(x.net)}">${money(x.net)}</span></button>`;
  }).join('');
  return `${sesRows ? `<h2>By session</h2>${sesRows}` : ''}${monthRows ? `<h2>All months</h2>${monthRows}` : ''}`;
}

function historyHtml(list) {
  /* trade history grouped by day, newest first */
  const byDay = {}; list.slice().reverse().forEach(t => (byDay[t.date] = byDay[t.date] || []).push(t));
  const keys = Object.keys(byDay).sort().reverse();
  if (!keys.length) return '';
  return '<h2>Trades</h2>' + keys.map(d => {
    const net = sum(byDay[d].map(t => t.pnl));
    return `<div class="dayhead"><span>${dayLabel(d)}</span><span class="${cls(net)}">${money(net)}</span></div>${byDay[d].map(tradeRow).join('')}`;
  }).join('');
}

function liveRow(t) {
  const c = calc(t);
  const prices = [t.entry != null ? 'Entry ' + px(t.entry) : '', t.sl != null ? 'SL ' + px(t.sl) : '', t.tp != null ? 'TP ' + px(t.tp) : '', t.lot != null ? 'Lot ' + t.lot : ''].filter(Boolean).join(' \u00b7 ');
  const sub = [c.rr != null ? 'plan ' + rrtxt(c.rr) : '', t.session || '', 'tap to close'].filter(Boolean).join(' \u00b7 ');
  return `<div class="livewrap"><button class="trade islive" data-act="edit" data-id="${t.id}">
    <span class="nm">${symIcon(t.symbol)}<span>${esc(t.symbol)} \u00b7 ${t.side}</span></span><span class="pl">OPEN</span>
    <span class="mt">${esc(prices)}</span><span class="ps">${esc(sub)}</span>
    ${t.note ? `<span class="nt">${esc(t.note)}</span>` : ''}
  </button><button type="button" class="chip livesh" data-act="sharelive" data-id="${t.id}">Share card</button></div>`;
}
function liveHtml() {
  const L = S.trades.filter(t => t.live).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return L.length ? `<div class="livehd">Positions \u00b7 ${L.length} open</div>${L.map(liveRow).join('')}` : '';
}

function renderJournal() {
  $('live').innerHTML = liveHtml();
  const tr = visible(), st = stats(tr);
  const CR = [['7', '1W'], ['30', '1M'], ['90', '3M'], ['365', '1Y'], ['all', 'All']];
  const crv = SET.chartRange || 'all', crow = CR.find(x => x[0] === crv) || CR[4], cn = crow[0] === 'all' ? 0 : +crow[0], cfrom = cn ? addDays(today(), -(cn - 1)) : '';
  const D = tr.filter(t => !cfrom || t.date >= cfrom), dst = stats(tr);
  const cbar = tr.length ? `<div class="crange" role="group" aria-label="Chart range">${CR.map(x => `<button type="button" data-act="crange" data-v="${x[0]}" aria-pressed="${x[0] === crow[0]}">${x[1]}</button>`).join('')}</div>` : '';
  $('hero').innerHTML = `${eyeBtn()}<div class="big ${cls(dst.net)}">${dcm(dst.net).replace('+', '')}</div>
    <div class="subrow"><div class="sub">${tr.length ? tr.length + ' trade' + (tr.length === 1 ? '' : 's') + ' \u00b7 all time' + (S.symbol === 'ALL' ? '' : ' \u00b7 ' + esc(S.symbol)) : 'No trades yet'}</div>${D.length && !MASK ? (() => { const pn = sum(D.map(t => t.pnl)); return `<span class="hpill ${cls(pn)}">${dcm(pn)}</span>`; })() : ''}</div>
    ${D.length ? '<div class="dchart" id="jchart"></div>' : (tr.length ? '<p class="empty">No trades in this period.</p>' : '')}${cbar}`;
  if (D.length) dashChart(D, 'jchart', 'j');
  const rv = tr.length ? ringVals(tr, st) : [], rgAnim = tr.length && !S.rgDrawn; if (tr.length) S.rgDrawn = true;
  $('stats').innerHTML = tr.length ? statTiles([
    ['Win rate', st.winRate == null ? '\u2014' : Math.round(st.winRate * 100) + '%', '', rv[0], 0, 'win'],
    ['Profit factor', pfTxt(st), '', rv[1], 1, 'win'],
    ['Expectancy per trade', cmoney(st.exp), cls(st.exp), rv[2], 2, st.exp < 0 ? 'loss' : 'win'],
    ['Max drawdown', st.dd ? cmoney(-st.dd) : '\u2014', st.dd ? 'loss' : '', rv[3], 3, 'loss'],
    ['Average win', cmoney(st.avgW), 'win', rv[4], 4, 'win'],
    ['Average loss', cmoney(st.avgL), 'loss', rv[5], 5, 'loss'],
    ['Average planned R:R', rrtxt(st.avgRR), '', rv[6], 6, 'win'],
    ['Average result', rtxt(st.avgR), cls(st.avgR), rv[7], 7, st.avgR < 0 ? 'loss' : 'win']
  ]) : '';
  if (!tr.length) {
    $('list').innerHTML = S.trades.length
      ? `<p class="empty">No closed trades${S.symbol === 'ALL' ? '' : ' for ' + esc(S.symbol)} yet.</p>`
      : `<p class="empty">Your trades will show here. Tap + to add your first one, or <button class="link" data-act="sample">load sample trades</button> to see how it looks.</p>`;
    return;
  }
  $('list').innerHTML = summaryHtml(tr, tr);
  applyMask();
}

function renderReports() {
  const tr = visible();
  if (!S.month) S.month = (tr.length ? tr[tr.length - 1].date : today()).slice(0, 7);
  const [y, m] = S.month.split('-').map(Number);
  const mt = tr.filter(t => t.date.startsWith(S.month));
  const byDay = {}; mt.forEach(t => (byDay[t.date] = byDay[t.date] || []).push(t));
  const dayNet = {}; Object.keys(byDay).forEach(d => dayNet[d] = sum(byDay[d].map(t => t.pnl)));
  const days = Object.keys(dayNet);
  const st = stats(mt);
  const maxAbs = Math.max(1, ...days.map(d => Math.abs(dayNet[d])));
  const best = days.length ? days.reduce((a, b) => dayNet[a] >= dayNet[b] ? a : b) : null;
  const worst = days.length ? days.reduce((a, b) => dayNet[a] <= dayNet[b] ? a : b) : null;

  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7, dim = new Date(y, m, 0).getDate();
  let cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < lead; i++) cells += '<div class="cell blank"></div>';
  for (let d = 1; d <= dim; d++) {
    const key = S.month + '-' + String(d).padStart(2, '0');
    if (dayNet[key] != null) {
      const n = dayNet[key], a = '1';
      cells += `<button class="cell has ${n >= 0 ? 'w' : 'l'} ${S.day === key ? 'sel' : ''}" data-act="day" data-d="${key}" aria-label="${dayLabel(key)} ${money(n)}">
        <span class="d">${d}</span><span class="a">${compact(n)}</span></button>`;
    } else cells += `<div class="cell"><span class="d">${d}</span></div>`;
  }

  let detail = '';
  if (S.day && byDay[S.day]) {
    detail = `<div class="dayhead"><span>${dayLabel(S.day)}</span><span class="${cls(dayNet[S.day])}">${money(dayNet[S.day])}</span></div>${byDay[S.day].slice().reverse().map(tradeRow).join('')}`;
  } else if (days.length) detail = `<p class="empty">Tap a coloured day to see its trades.</p>`;

  $('reports').innerHTML = `
    <div class="monthbar">
      <button class="round" data-act="mnav" data-v="-1" aria-label="Previous month">&#8249;</button>
      <div class="ttl">${monthLabel(S.month)}</div>
      <button class="round" data-act="mnav" data-v="1" aria-label="Next month">&#8250;</button>
    </div>
    <div class="card hero">${eyeBtn()}<div class="lbl">Net P&amp;L</div>
    <div class="big ${cls(st.net)}">${money(st.net).replace('+', '')}</div>
    <div class="sub">${mt.length ? mt.length + ' trade' + (mt.length === 1 ? '' : 's') + ' in ' + days.length + ' day' + (days.length === 1 ? '' : 's') : 'No trades this month'}</div>
    ${goalHtml(st.net)}</div>
    <dl class="kv">${mt.length ? kv([
      ['Win rate', st.winRate == null ? '\u2014' : Math.round(st.winRate * 100) + '%'],
      ['Profit factor', pfTxt(st)],
      ['Best day', best ? dayLabel(best) + '<br>' + money(dayNet[best]) : '\u2014', best && dayNet[best] > 0 ? 'win' : ''],
      ['Worst day', worst ? dayLabel(worst) + '<br>' + money(dayNet[worst]) : '\u2014', worst && dayNet[worst] < 0 ? 'loss' : ''],
      ['Average planned R:R', rrtxt(st.avgRR)],
      ['Average result', rtxt(st.avgR), cls(st.avgR)]
    ]) : ''}</dl>
    <div class="cal">${cells}</div>
    ${detail}`;
  applyMask();
}

function liteState() { try { return localStorage.getItem('pnl-lite'); } catch (e) { return null; } }
function applyLite() {
  const v = liteState(), auto = !!window.__autoLite, on = v === '1' || (v === null && auto);
  document.documentElement.classList.toggle('lite', on);
  $('liteBtn').textContent = 'Smooth mode: ' + (v === null ? 'Auto (' + (auto ? 'on' : 'off') + ')' : v === '1' ? 'On' : 'Off');
}
function cycleLite() {
  const v = liteState(), nx = v === null ? '1' : v === '1' ? '0' : null;
  try { if (nx === null) localStorage.removeItem('pnl-lite'); else localStorage.setItem('pnl-lite', nx); } catch (e) {}
  applyLite();
}
function renderData() {
  applyLite(); renderGoalForm(); themeLabel();
  $('count').textContent = S.trades.length + ' trade' + (S.trades.length === 1 ? '' : 's');
}

/* ---------- liquid glass pill: drag + water-drop motion ---------- */
let LG = { sync() {} };
try { LG = (() => {
  const nav = document.querySelector('nav'), pill = $('pill');
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PAD = -10;
  let px = 0, tx = 0, pw = 0, vel = 0, g = 1, grab = false, raf = 0, placed = false, wantRing = false, navL = 0;
  let startX = 0, suppress = false;
  const tabs = () => Array.from(nav.querySelectorAll('button'));
  const rect = b => ({ x: b.offsetLeft - PAD / 2, w: b.offsetWidth + PAD });
  const curIdx = () => Math.max(0, tabs().findIndex(b => b.getAttribute('aria-current') === 'page'));

  let lastT = 0, geo = null, tb = null, hotI = -1, rT = 0;
  function paint(sx, sy) {
    const dir = vel >= 0 ? 1 : -1;
    const shift = dir * (sx - 1) * pw / 2;
    pill.style.transform = 'translate3d(' + (px + shift).toFixed(2) + 'px,0,0) scale(' + (sx * g).toFixed(4) + ',' + (sy * g).toFixed(4) + ')';
  }

  /* time-based critically damped spring: same motion on 60 / 90 / 120 Hz screens, no overshoot, no jitter */
  function tick(now) {
    const dt = Math.min(.034, Math.max(.001, (now - (lastT || now - 16)) / 1000)); lastT = now;
    const w = grab ? 34 : 26, n = Math.ceil(dt / .008), h = dt / n;
    for (let i = 0; i < n; i++) { const a = w * w * (tx - px) - 2 * w * vel; vel += a * h; px += vel * h; }
    g += ((grab ? 1.05 : 1) - g) * Math.min(1, dt * 14);
    const sp = Math.abs(vel);
    const sx = RM ? 1 : 1 + Math.min(sp * 0.00026, 0.2);
    const sy = RM ? 1 : 1 - Math.min(sp * 0.00008, 0.07);
    paint(sx, sy);
    const rest = !grab && Math.abs(tx - px) < 0.15 && sp < 3 && Math.abs(g - 1) < 0.003;
    if (rest) {
      px = tx; vel = 0; g = 1; paint(1, 1); raf = 0; lastT = 0;
      if (wantRing) { wantRing = false; ring(); }
      return;
    }
    raf = requestAnimationFrame(tick);
  }
  const run = () => { if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); } };

  function ring() {
    if (RM) return;
    const r = document.createElement('span'); r.className = 'ring';
    r.style.left = px + 'px'; r.style.width = pw + 'px'; nav.appendChild(r);
    setTimeout(() => r.remove(), 850);
  }

  function sync(instant) {
    if (grab) return;
    const t = tabs(), i = curIdx(), r = rect(t[i]);
    pw = r.w; pill.style.width = pw + 'px';
    if (!placed || instant) { px = tx = r.x; vel = 0; placed = true; paint(1, 1); pill.classList.add('on'); return; }
    if (Math.abs(r.x - tx) > 2) wantRing = true;
    tx = r.x; run();
  }

  /* measure the tabs once per touch, so dragging never forces a layout */
  function measure() {
    tb = tabs(); navL = nav.getBoundingClientRect().left;
    geo = tb.map(b => ({ x: b.offsetLeft - PAD / 2, c: b.offsetLeft + b.offsetWidth / 2 }));
    hotI = -1;
  }
  function follow(clientX) {
    if (!geo) measure();
    const first = geo[0].x, last = geo[geo.length - 1].x;
    tx = Math.min(last, Math.max(first, clientX - navL - pw / 2));
    const mid = tx + pw / 2; let best = 0, bd = 1e9;
    for (let i = 0; i < geo.length; i++) { const d = Math.abs(geo[i].c - mid); if (d < bd) { bd = d; best = i; } }
    if (best !== hotI) { if (hotI >= 0) tb[hotI].classList.remove('hot'); tb[best].classList.add('hot'); hotI = best; }
    return best;
  }

  nav.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    grab = true; startX = e.clientX;
    nav.classList.add('dragging'); pill.classList.add('grab'); nav.style.cursor = 'grabbing';
    measure(); follow(e.clientX); run();
  });
  window.addEventListener('pointermove', e => { if (grab) { follow(e.clientX); run(); } }, { passive: true });
  function end(e) {
    if (!grab) return;
    const best = (e && e.type === 'pointercancel') ? curIdx() : follow(e && e.clientX != null ? e.clientX : startX);
    grab = false; suppress = true; setTimeout(() => { suppress = false; }, 80);
    nav.classList.remove('dragging'); pill.classList.remove('grab'); nav.style.cursor = '';
    tabs().forEach(b => b.classList.remove('hot'));
    geo = null; tb = null; hotI = -1;
    const t = tabs()[best], changed = t.dataset.v !== S.tab;
    wantRing = changed;
    if (changed) {
      /* let the pill glide into place first; the heavy page render waits for it so the motion never hitches */
      S.tab = t.dataset.v; tx = rect(t).x; run();
      tabs().forEach(b => b.setAttribute('aria-current', b === t ? 'page' : 'false'));
      clearTimeout(rT);
      rT = setTimeout(() => { render(); document.body.scrollTop = 0; window.scrollTo(0, 0); }, 140);
    }
    else { tx = rect(t).x; run(); }
  }
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  nav.addEventListener('click', e => { if (suppress) { e.stopPropagation(); e.preventDefault(); } }, true);
  let rz = 0;
  window.addEventListener('resize', () => { if (S.sheetOpen) return; cancelAnimationFrame(rz); rz = requestAnimationFrame(() => sync(true)); });
  window.addEventListener('orientationchange', () => setTimeout(() => sync(true), 200));
  return { sync };
})(); } catch (err) { console.error('glass pill disabled:', err); }
function movePill() { try { LG.sync(); } catch (err) { console.error(err); } }

function render() {
  if (S.tab !== 'journal') CV.seen = [];
  ['journal', 'reports', 'dash', 'data'].forEach(t => $('s-' + t).hidden = S.tab !== t);
  document.querySelectorAll('nav button').forEach(b => b.setAttribute('aria-current', b.dataset.v === S.tab ? 'page' : 'false'));
  $('title').textContent = { journal: 'Dashboard', reports: 'Reports', dash: 'Data', data: 'Settings' }[S.tab];
  $('shareBtn').hidden = S.tab === 'data';
  movePill();
  renderChips();
  renderDashLimit();
  if (S.tab === 'journal') renderJournal();
  if (S.tab === 'reports') renderReports();
  if (S.tab === 'dash') renderDash();
  if (S.tab === 'data') renderData();
}

/* ---------- date picker ---------- */
const fmtDate = s => parseDay(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
function setDate(v) { $('f-date').value = v; $('f-datetxt').textContent = fmtDate(v); }
const DP = { ym: '', open: false, skip: 0 };
function renderDp() {
  const [y, m] = DP.ym.split('-').map(Number), sel = $('f-date').value, td = today();
  const net = {}; S.trades.forEach(t => { if (t.date.startsWith(DP.ym)) net[t.date] = (net[t.date] || 0) + t.pnl; });
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7, dim = new Date(y, m, 0).getDate();
  let h = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => `<div class="dpdow">${d}</div>`).join('');
  for (let i = 0; i < lead; i++) h += '<span></span>';
  for (let d = 1; d <= dim; d++) {
    const k = DP.ym + '-' + String(d).padStart(2, '0'), n = net[k];
    h += `<button type="button" class="dpday${k === td ? ' tod' : ''}${k === sel ? ' sel' : ''}" data-act="dpday" data-d="${k}" aria-label="${dayLabel(k)}"${k === sel ? ' aria-pressed="true"' : ''}>${d}${n != null ? `<i class="${n > 0 ? 'w' : n < 0 ? 'l' : 'z'}"></i>` : ''}</button>`;
  }
  $('dpTtl').textContent = monthLabel(DP.ym); $('dpGrid').innerHTML = h;
}
function openDp() {
  DP.ym = ($('f-date').value || today()).slice(0, 7); renderDp();
  const el = $('dp'); el.hidden = false; DP.open = true;
  requestAnimationFrame(() => el.classList.add('open'));
  try { history.pushState({ sheet: 1, dp: 1 }, ''); } catch (e) {}
}
function hideDp() { if (!DP.open) return; DP.open = false; const el = $('dp'); el.classList.remove('open'); el.hidden = true; }
function closeDp() {
  const was = DP.open; hideDp();
  try { if (was && history.state && history.state.dp) { DP.skip++; setTimeout(() => { DP.skip = 0; }, 500); history.back(); } } catch (e) {}
}
function pickDate(k) { setDate(k); closeDp(); }

/* ---------- add / edit sheet ---------- */
function setSide(s) { S.side = s; $('f-buy').setAttribute('aria-pressed', s === 'Buy'); $('f-sell').setAttribute('aria-pressed', s === 'Sell'); updateCalc(); }
function setLive(v) {
  S.limOk = false; S.live = !!v; $('f-live').setAttribute('aria-pressed', S.live);
  $('closeBox').hidden = S.live; $('f-amt').required = !S.live; $('f-exit').disabled = S.live;
  if (S.live) $('f-exit').value = '';
  $('saveBtn').textContent = S.live ? (S.editing ? 'Save position' : 'Save position') : (S.editing ? 'Save changes' : 'Save trade');
  updateCalc();
}
function setRes(r) { S.res = r; $('f-profit').setAttribute('aria-pressed', r === 'Profit'); $('f-loss').setAttribute('aria-pressed', r === 'Loss'); }

function formTrade() {
  return { side: S.side, entry: num($('f-entry').value), sl: num($('f-sl').value), tp: num($('f-tp').value), exit: num($('f-exit').value) };
}

let calcRaf = 0, calcLast = null;
function updateCalc() { if (!calcRaf) calcRaf = requestAnimationFrame(() => { calcRaf = 0; paintCalc(); }); }
function paintCalc() {
  const t = formTrade(), c = calc(t), out = [], warn = [];
  const dir = t.side === 'Sell' ? -1 : 1;
  if (t.entry != null && t.sl != null && (t.sl - t.entry) * dir > 0) warn.push('SL is on the wrong side of entry for a ' + t.side);
  if (t.entry != null && t.tp != null && (t.tp - t.entry) * dir < 0) warn.push('TP is on the wrong side of entry for a ' + t.side);
  if (c.rr != null) out.push('Planned R:R <b>' + rrtxt(c.rr) + '</b>');
  if (c.risk != null) out.push('Risk <b>' + fixed(c.risk, 1) + ' pts</b>');
  if (c.pts != null) out.push('Result <b>' + pts(c.pts) + '</b>');
  if (c.r != null) out.push('<b>' + rtxt(c.r) + '</b>');
  const html = out.join(' \u00b7 ') + (warn.length ? `<div class="loss">${warn.join('. ')}</div>` : '');
  if (html !== calcLast) { calcLast = html; $('calc').innerHTML = html; }
}

function symChips() {
  const syms = [...new Set([...DEFAULT_SYMS, ...S.trades.map(t => t.symbol)])];
  $('symChips').innerHTML = syms.map(s => `<button type="button" class="chip" data-act="symfill" data-v="${esc(s)}" aria-pressed="false">${symIcon(s)}<span>${esc(s)}</span></button>`).join('');
}

function openSheet(id) {
  S.editing = id || null; S.confirmDel = false; S.limOk = false;
  const t = id ? S.trades.find(x => x.id === id) : null;
  $('sheetTitle').textContent = t ? 'Edit trade' : 'Add trade';
  $('saveBtn').textContent = t ? 'Save changes' : 'Save trade';
  $('delBtn').hidden = !t; $('delBtn').textContent = 'Delete trade';
  setDate(t ? t.date : ((S.tab === 'reports' && S.day) || today()));
  $('f-symbol').value = t ? t.symbol : (S.symbol !== 'ALL' ? S.symbol : '');
  $('f-entry').value = t && t.entry != null ? t.entry : '';
  $('f-sl').value = t && t.sl != null ? t.sl : '';
  $('f-tp').value = t && t.tp != null ? t.tp : '';
  $('f-exit').value = t && t.exit != null ? t.exit : '';
  $('f-lot').value = t && t.lot != null ? t.lot : '';
  $('f-amt').value = t ? Math.abs(t.pnl) : '';
  $('f-note').value = t ? t.note || '' : '';
  setSide(t ? t.side : 'Buy'); setRes(t && t.pnl < 0 ? 'Loss' : 'Profit');
  setSess(t && t.session ? t.session : ''); setLive(!!(t && t.live)); $('shareTradeBtn').hidden = !t;
  symChips(); updateCalc();
  const sh = $('sheet'); sh.hidden = false; S.sheetOpen = true; document.documentElement.classList.add('modal');
  void sh.offsetWidth; requestAnimationFrame(() => sh.classList.add('open'));
  try { history.pushState({ sheet: 1 }, ''); } catch (e) {}
}
function hideSheet() {
  if (!S.sheetOpen) return;
  S.sheetOpen = false; hideDp(); document.documentElement.classList.remove('modal');
  const sh = $('sheet'); sh.classList.remove('open'); sh.hidden = true;
  requestAnimationFrame(movePill);
}
function closeSheet() {
  const was = S.sheetOpen; hideSheet();
  try { if (was && history.state && history.state.sheet) history.back(); } catch (e) {}
}
window.addEventListener('popstate', () => {
  if (DP.skip > 0) { DP.skip--; return; }
  if (SH.skip > 0) { SH.skip--; return; }
  if (TH.skip > 0) { TH.skip--; return; }
  if (AS.skip > 0) { AS.skip--; return; }
  if (DP.open) { hideDp(); return; }
  if (SH.open) { hideShare(); return; }
  if (TH.open) { hideTheme(); return; }
  if (AS.open) { hideAc(); return; }
  hideSheet();
});
window.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (DP.open) closeDp(); else if (SH.open) closeShare(); else if (TH.open) closeTheme(); else if (AS.open) closeAc(); else if (S.sheetOpen) closeSheet(); });

async function submitForm(e) {
  if (e && e.preventDefault) e.preventDefault();
  try { await doSubmit(); } catch (err) { console.error(err); toast('Could not save: ' + (err && err.message || err)); }
}
async function doSubmit() {
  const amt = num($('f-amt').value);
  const symbol = $('f-symbol').value.trim().toUpperCase();
  if (!symbol) { toast('Enter a symbol'); $('f-symbol').focus(); return; }
  if (!S.live && (amt == null || amt < 0)) { toast('Enter the amount'); $('f-amt').focus(); return; }
  if (!S.editing && !S.limOk && SET.maxLoss > 0 && ($('f-date').value || today()) === today()) {
    const tn = sum(S.trades.filter(x => x.date === today() && !x.live).map(x => x.pnl));
    if (-tn >= SET.maxLoss) {
      S.limOk = true; $('saveBtn').textContent = 'Limit reached. Tap again to add anyway';
      toast('Daily loss limit reached (' + money(tn) + ' today). Tap again to add this trade anyway.'); return;
    }
  }
  const t = {
    id: S.editing || Date.now(), date: $('f-date').value || today(), symbol, side: S.side,
    entry: num($('f-entry').value), exit: num($('f-exit').value), sl: num($('f-sl').value), tp: num($('f-tp').value),
    pnl: S.live ? 0 : (S.res === 'Loss' ? -Math.abs(amt) : Math.abs(amt)), note: $('f-note').value.trim(), session: S.session
  };
  const lot = num($('f-lot').value); if (lot != null && lot > 0) t.lot = lot;
  if (S.live) { t.live = true; t.exit = null; }
  if (S.editing) S.trades = S.trades.map(x => x.id === S.editing ? t : x); else S.trades.push(t);
  S.month = t.date.slice(0, 7);
  closeSheet(); render(); const ok = await save(); toast(ok ? 'Saved' : 'Not saved: the browser refused to store it. Export a backup now.');
}

async function deleteTrade() {
  if (!S.confirmDel) { S.confirmDel = true; $('delBtn').textContent = 'Tap again to delete'; return; }
  S.trades = S.trades.filter(x => x.id !== S.editing);
  closeSheet(); render(); await save(); toast('Deleted');
}

/* ---------- CSV ---------- */
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], cur = '', inq = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inq) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inq = false; } else cur += c; }
    else if (c === '"') inq = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x !== '')) rows.push(row);
  return rows;
}
function readTrades(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { trades: [], skipped: 0, error: 'No rows found' };
  const head = rows[0].map(h => h.trim().toLowerCase());
  const ix = n => head.indexOf(n);
  if (ix('date') < 0 || ix('symbol') < 0 || ix('pnl') < 0) return { trades: [], skipped: 0, error: 'This does not look like a trade backup file' };
  const out = []; let skipped = 0, seed = Date.now();
  rows.slice(1).forEach((r, i) => {
    const g = n => ix(n) < 0 ? '' : (r[ix(n)] || '').trim();
    let date = g('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { const d = new Date(date); date = isNaN(d) ? '' : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    const live = /^(1|true|yes|live)$/i.test(g('live')), symbol = g('symbol').toUpperCase();
    const pnl = live ? (num(g('pnl')) || 0) : num(g('pnl'));
    if (!date || pnl == null || !symbol) { skipped++; return; }
    out.push({ id: num(g('id')) || seed + i, date, symbol, side: /sell/i.test(g('side')) ? 'Sell' : 'Buy',
      entry: num(g('entry')), exit: num(g('exit')), sl: num(g('sl')), tp: num(g('tp')), pnl, note: g('note'),
      session: SESS.find(n => n.toLowerCase() === g('session').toLowerCase()) || '' });
    const o = out[out.length - 1], lt = num(g('lot')); if (lt != null && lt > 0) o.lot = lt; if (live) { o.live = true; o.exit = null; o.pnl = 0; }
  });
  return { trades: out, skipped };
}
const tkey = t => [t.date, t.symbol, t.side, t.entry, t.exit, t.sl, t.tp, t.pnl, t.note, t.lot, t.live ? 1 : ''].join('|');
/* how many copies of each trade already exist, so two genuinely identical trades are not mistaken for one duplicate */
const tcounts = arr => { const m = new Map(); arr.forEach(t => { const k = tkey(t); m.set(k, (m.get(k) || 0) + 1); }); return m; };
const takeDup = (m, t) => { const k = tkey(t), n = m.get(k) || 0; if (n > 0) { m.set(k, n - 1); return true; } return false; };

const BK_UI = ['pnl-theme', 'pnl-white', 'pnl-lite', 'pnl-mask', 'pnl-chart-view', 'pnl-glass'];
const CAN_ENC = !!(window.crypto && crypto.subtle && window.isSecureContext);
const b64e = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const BK_ITER = 250000;
async function bkKey(pass, salt, iter, use) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, km, { name: 'AES-GCM', length: 256 }, false, [use]);
}
async function bkEncrypt(plain, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await bkKey(pass, salt, BK_ITER, 'encrypt');
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  return JSON.stringify({ app: 'pnl-journal', enc: 1, kdf: 'PBKDF2-SHA256', iter: BK_ITER, salt: b64e(salt), iv: b64e(iv), data: b64e(ct) });
}
async function bkDecrypt(o, pass) {
  const key = await bkKey(pass, b64d(o.salt), Math.min(Math.max(+o.iter || BK_ITER, 1000), 2000000), 'decrypt');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(o.iv) }, key, b64d(o.data)));
}
async function backupText() {
  const pass = $('bkPass').value, plain = buildBackup();
  if (!pass) return plain;
  if (!CAN_ENC) throw new Error('Encrypted backups need a secure (https) connection');
  if (pass.length < 6) throw new Error('Use at least 6 characters for the backup password');
  return bkEncrypt(plain, pass);
}
async function decryptPending() {
  const o = S.pendingEnc, inp = $('impPass'), err = $('impErr'); if (!o || !inp) return;
  if (!CAN_ENC) { err.textContent = 'Opening encrypted backups needs a secure (https) connection'; return; }
  err.textContent = '';
  try { const text = await bkDecrypt(o, inp.value); S.pendingEnc = null; showImport(text); }
  catch (e) { err.textContent = 'Wrong password, or the file is damaged'; }
}
function buildBackup() {
  acCur().set = { unit: SET.unit, goal: SET.goal, balance: SET.balance, maxLoss: SET.maxLoss };
  const trades = {};
  AC.list.forEach(a => {
    if (a.id === AC.active) { trades[a.id] = S.trades; return; }
    trades[a.id] = tsGet(acKey(a.id)).slice();
  });
  const settings = {}; Object.keys(SET).forEach(k => { const v = SET[k]; if (!(typeof v === 'string' && v.length > 50000)) settings[k] = v; });
  const ui = {}; BK_UI.forEach(k => { try { const v = localStorage.getItem(k); if (v != null) ui[k] = v; } catch (e) {} });
  return JSON.stringify({ app: 'pnl-journal', version: 2, exported: new Date().toISOString(), accounts: { list: AC.list, active: AC.active }, settings, trades, ui });
}
function cleanTrades(a) {
  return (Array.isArray(a) ? a : []).filter(t => t && typeof t === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && typeof t.symbol === 'string' && t.symbol && (t.live || Number.isFinite(t.pnl)))
    .map((t, i) => Object.assign({}, t, { id: Number.isFinite(t.id) ? t.id : Date.now() + i }));
}
function readBackup(text) {
  let o; try { o = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (e) { return { error: 'This file could not be read' }; }
  if (!o || typeof o !== 'object' || !o.trades || typeof o.trades !== 'object') return { error: 'This does not look like a backup from this app' };
  const list = (o.accounts && Array.isArray(o.accounts.list) ? o.accounts.list : []).filter(a => a && typeof a.id === 'string' && /^[\w-]{1,40}$/.test(a.id) && typeof a.name === 'string')
    .map(a => ({ id: a.id, name: a.name.slice(0, 24), set: a.set && typeof a.set === 'object' ? a.set : undefined }));
  if (!list.length) list.push({ id: 'main', name: 'Main' });
  const trades = {}; let n = 0;
  list.forEach(a => { trades[a.id] = cleanTrades(o.trades[a.id]); n += trades[a.id].length; });
  const active = o.accounts && list.some(a => a.id === o.accounts.active) ? o.accounts.active : list[0].id;
  return { bk: { list, active, trades, settings: o.settings && typeof o.settings === 'object' ? o.settings : null, ui: o.ui && typeof o.ui === 'object' ? o.ui : {} }, n, accounts: list.length };
}
function mergeInto(arr, incoming) {
  const have = tcounts(arr), ids = new Set(arr.map(t => t.id)); let add = 0;
  incoming.forEach(t => { if (takeDup(have, t)) return; t = Object.assign({}, t); if (ids.has(t.id)) t.id = Date.now() + add; ids.add(t.id); arr.push(t); add++; });
  return add;
}
async function doBackup(mode) {
  const b = S.pendingBk; if (!b) return;
  if (mode === 'restore') {
    const oldKeys = AC.list.map(a => acKey(a.id)), newKeys = b.list.map(a => acKey(a.id));
    const snap = new Map(oldKeys.map(k => [k, TS.cache.get(k)]));
    let okAll = true;
    for (const a of b.list) { if (!(await tsSet(acKey(a.id), b.trades[a.id].slice()))) { okAll = false; break; } }
    if (!okAll) {
      /* storage refused the new data: put everything back exactly as it was */
      for (const k of newKeys) { if (!oldKeys.includes(k)) await tsDel(k); }
      for (const [k, v] of snap) { if (v) await tsSet(k, v); }
      toast('Restore failed (storage is full). Nothing was changed.');
      return;
    }
    for (const k of oldKeys) { if (!newKeys.includes(k)) await tsDel(k); }
    AC.list = b.list; AC.active = b.active; saveAc();
    if (b.settings) { Object.keys(b.settings).forEach(k => { SET[k] = b.settings[k]; }); }
    const cur = b.list.find(a => a.id === b.active); if (cur && cur.set) { SET.unit = cur.set.unit || '$'; SET.goal = cur.set.goal != null ? cur.set.goal : null; SET.balance = cur.set.balance != null ? cur.set.balance : null; SET.maxLoss = cur.set.maxLoss != null ? cur.set.maxLoss : null; }
    saveSet();
    BK_UI.forEach(k => { try { if (b.ui[k] != null) localStorage.setItem(k, String(b.ui[k])); else localStorage.removeItem(k); } catch (e) {} });
    S.trades = b.trades[b.active].slice(); S.pendingBk = null;
    toast('Restored. Reloading…'); setTimeout(() => location.reload(), 500);
    return;
  }
  let add = 0;
  for (const a of b.list) {
    let ex = AC.list.find(x => x.id === a.id);
    if (!ex) { ex = { id: a.id, name: AC.list.some(x => x.name.toLowerCase() === a.name.toLowerCase()) ? a.name.slice(0, 20) + ' 2' : a.name, set: a.set }; AC.list.push(ex); saveAc(); }
    if (ex.id === AC.active) add += mergeInto(S.trades, b.trades[a.id]);
    else {
      const cur = tsGet(acKey(ex.id)).slice();
      add += mergeInto(cur, b.trades[a.id]); await tsSet(acKey(ex.id), cur);
    }
  }
  S.pendingBk = null; $('importBox').hidden = true; $('paste').value = ''; S.month = null;
  render(); await save(); toast(add ? 'Imported ' + add + ' trade' + (add === 1 ? '' : 's') : 'Nothing new to import (all duplicates)');
}

async function exportBackup() {
  let csv; try { csv = await backupText(); } catch (e) { toast(e.message); return; }
  const name = 'pnl-journal-backup-' + today() + ($('bkPass').value ? '-encrypted' : '') + '.json', cap = window.Capacitor;
  const P = cap && cap.Plugins;
  if (cap && cap.isNativePlatform && cap.isNativePlatform() && P && P.Filesystem && P.Share) {
    try {
      await P.Filesystem.writeFile({ path: name, data: csv, directory: 'CACHE', encoding: 'utf8' });
      const r = await P.Filesystem.getUri({ path: name, directory: 'CACHE' });
      await P.Share.share({ title: name, files: [r.uri], dialogTitle: 'Save your backup' });
      return;
    } catch (e) { if (e && /cancel/i.test(String(e.message || e))) return; }
  }
  try {
    const file = new File([csv], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'application/json' })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast('Download started');
}
async function copyBackup() {
  let csv; try { csv = await backupText(); } catch (e) { toast(e.message); return; }
  try { await navigator.clipboard.writeText(csv); toast('Copied. Paste it somewhere safe.'); return; } catch (e) {}
  const ta = document.createElement('textarea'); ta.value = csv; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Copied. Paste it somewhere safe.'); } catch (e) { toast('Could not copy'); }
  ta.remove();
}
function showImport(text) {
  const box = $('importBox'); box.hidden = false; S.pendingBk = null; S.pending = null; S.pendingEnc = null;
  if (/^\s*\uFEFF?\s*\{/.test(text)) {
    let o = null; try { o = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (e) {}
    if (o && o.enc === 1 && o.data) {
      S.pendingEnc = o;
      box.innerHTML = `<p style="color:var(--ink)">This backup is password protected.</p>
      <input type="password" id="impPass" placeholder="Backup password" autocomplete="off" style="margin-top:8px">
      <div class="btns" style="margin-top:8px"><button class="btn primary" data-act="impdec">Unlock</button></div><p class="loss" id="impErr"></p>`;
      return;
    }
  }
  if (/^\s*\uFEFF?\s*\{/.test(text)) {
    const j = readBackup(text);
    if (j.error) { box.innerHTML = `<p class="loss">${esc(j.error)}</p>`; return; }
    S.pendingBk = j.bk;
    box.innerHTML = `<p style="color:var(--ink)">Found <b>${j.n}</b> trade${j.n === 1 ? '' : 's'} in <b>${j.accounts}</b> account${j.accounts === 1 ? '' : 's'}${j.bk.settings ? ' and your settings' : ''}.</p>
    <div class="btns"><button class="btn primary" data-act="impbk" data-v="merge">Add trades only</button><button class="btn" data-act="impbk" data-v="restore">Restore everything</button></div>
    <p class="muted" style="margin-top:8px">Restore everything replaces all current trades, accounts and settings.</p>`;
    return;
  }
  const r = readTrades(text);
  if (r.error || !r.trades.length) { S.pending = null; box.innerHTML = `<p class="loss">${esc(r.error || 'No valid trades found in this file')}</p>`; return; }
  S.pending = r.trades;
  box.innerHTML = `<p style="color:var(--ink)">Found <b>${r.trades.length}</b> trade${r.trades.length === 1 ? '' : 's'}${r.skipped ? ' (' + r.skipped + ' rows skipped)' : ''}.</p>
    <div class="btns"><button class="btn primary" data-act="imp" data-v="merge">Add to current</button><button class="btn" data-act="imp" data-v="replace">Replace all</button></div>`;
}
async function doImport(mode) {
  if (!S.pending) return;
  let add = 0;
  if (mode === 'replace') S.trades = S.pending.slice();
  else {
    const have = tcounts(S.trades), ids = new Set(S.trades.map(t => t.id));
    S.pending.forEach(t => { if (takeDup(have, t)) return; if (ids.has(t.id)) t.id = Date.now() + add; ids.add(t.id); S.trades.push(t); add++; });
  }
  const n = mode === 'replace' ? S.pending.length : add; S.pending = null; $('importBox').hidden = true; $('paste').value = ''; S.month = null;
  render(); await save(); toast(n ? 'Imported ' + n + ' trade' + (n === 1 ? '' : 's') : 'Nothing new to import (all duplicates)');
}

/* ---------- sample + clear ---------- */
async function loadSample() {
  if (S.trades.length) return;
  let seed = 20261103;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const dstr = n => { const x = new Date(); x.setDate(x.getDate() - n); return { s: x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'), wd: x.getDay() }; };
  const SYM = { XAUUSD: [2650, 6, 2], NAS100: [20400, 40, 1], USOIL: [70, .6, 2], XAGUSD: [31, .35, 2], SPX500: [5900, 12, 1], GBPUSD: [1.27, .0025, 5], USDJPY: [150, .35, 3], EURUSD: [1.08, .0025, 5] };
  const names = Object.keys(SYM), SS = ['Asia', 'London', 'New York'];
  const NOTES = ['Followed plan', 'Breakout retest', 'Trend continuation', 'Held to target', 'Clean setup', 'Moved SL to breakeven', 'London open move', 'Pullback entry'];
  const BAD = ['Stopped out', 'Entered too early', 'Against the trend', 'Stopped out on news', 'Chased the move'];
  const raw = [];
  /* ~6 months; five rough patches (low win rate) that the curve has to fight its way out of */
  const PH = [[168, 150, .22], [128, 112, .2], [92, 76, .24], [56, 42, .21], [24, 12, .25]];
  const ph = n => PH.find(q => n <= q[0] && n >= q[1]), wp = n => { const q = ph(n); return q ? q[2] : .7; };
  const TARGET = 12439;
  for (let n = 182; n >= 0; n--) {
    const d = dstr(n); if (d.wd === 0 || d.wd === 6 || rnd() < .07) continue;
    const k = rnd() < .55 ? 2 : rnd() < .6 ? 1 : 3;
    for (let j = 0; j < k; j++) {
      const win = rnd() < wp(n);
      raw.push({ date: d.s, sym: pick(names), side: rnd() < .55 ? 'Buy' : 'Sell', win, R: win ? 0.9 + rnd() * 2.2 : -((ph(n) ? 0.75 : 0.45) + rnd() * (ph(n) ? .8 : .55)), rd: 70 + rnd() * 70, ses: pick(SS), rr: rnd() < .5 ? 2 : 3 });
    }
  }
  const W = sum(raw.filter(r => r.win).map(r => r.R * r.rd)), L = -sum(raw.filter(r => !r.win).map(r => r.R * r.rd));
  const f = (TARGET + L) / W;
  S.trades = raw.map((r, i) => {
    const [base, risk, dp] = SYM[r.sym], dir = r.side === 'Sell' ? -1 : 1, R = r.win ? r.R * f : r.R;
    const entry = +(base * (1 + (rnd() - .5) * .02)).toFixed(dp), r2 = v => +v.toFixed(dp);
    const o = { id: Date.now() + i, date: r.date, symbol: r.sym, side: r.side, entry, sl: r2(entry - dir * risk), tp: r2(entry + dir * risk * r.rr),
      exit: r2(entry + dir * risk * R), pnl: +(R * r.rd).toFixed(2), note: rnd() < .35 ? pick(r.win ? NOTES : BAD) : '', session: r.ses };
    return o;
  });
  /* land on exactly +12,439.00 */
  const gap = +(TARGET - sum(S.trades.map(t => t.pnl))).toFixed(2);
  if (gap) { const lw = [...S.trades].reverse().find(t => t.pnl > 0); if (lw) lw.pnl = +(lw.pnl + gap).toFixed(2); }
  S.month = null; render(); await save();
}
let clearArmed = false;
async function clearAll() {
  const b = $('clearBtn');
  if (!clearArmed) { clearArmed = true; b.textContent = 'Tap again to delete everything'; setTimeout(() => { clearArmed = false; b.textContent = 'Delete all trades'; }, 4000); return; }
  clearArmed = false; b.textContent = 'Delete all trades';
  S.trades = []; S.month = null; S.day = null; render(); await save(); toast('All trades deleted');
}

/* ---------- settings: goal, balance, name, hide-$ ---------- */
const SESS = ['Asia', 'London', 'New York'];
const SET = { unit: '$', goal: null, balance: null, name: '', hide: false, cardRatio: '43', cardRound: 's', cardStyle: 'term', font: 'default', dashRange: '90', maxLoss: null };
try { const v = JSON.parse(localStorage.getItem('pnl-settings') || 'null'); if (v && typeof v === 'object') Object.assign(SET, v); } catch (e) {}
function saveSet() { try { localStorage.setItem('pnl-settings', JSON.stringify(SET)); } catch (e) {} }
const FONT_IDS = ['default', 'figtree', 'plexmono'];
const FONT_FACE = { default: 'Urbanist', figtree: 'Figtree', plexmono: 'IBM Plex Mono' };
function applyFont() {
    if (FONT_IDS.indexOf(SET.font) < 0) SET.font = 'default';
  document.documentElement.setAttribute('data-font', SET.font);
  try { if (FONT_FACE[SET.font] && document.fonts && document.fonts.load) { document.fonts.load('40px "' + FONT_FACE[SET.font] + '"').catch(() => {}); document.fonts.load('italic 40px "' + FONT_FACE[SET.font] + '"').catch(() => {}); } } catch (e) {}
  const g = document.getElementById('fontSeg');
  if (g) g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === SET.font));
}
applyFont();
const pctOf = n => SET.balance > 0 ? n / SET.balance * 100 : null;

/* ---------- custom backgrounds: whole app + share card ---------- */
const BG = { app: null, card: null, cardImg: null, cardVid: null, vidUrl: null };
const BGK = { app: 'pnl-bg-app', card: 'pnl-bg-card' };
const BGID = { app: 'App', card: 'Card' };
const bgLvl = w => { const v = w === 'app' ? SET.bgApp : SET.bgCard; return v == null ? (w === 'app' ? 30 : 35) : v; };
/* slider 0 = black, 50 = picture as it is, 100 = washed to light */
function bgShade(v) { const f = v / 50; return f < 1 ? 'rgba(0,0,0,' + ((1 - f) * .92).toFixed(3) + ')' : 'rgba(255,255,255,' + ((f - 1) * .65).toFixed(3) + ')'; }
function bgApply(w) {
  const url = BG[w], shade = bgShade(bgLvl(w)), id = BGID[w];
  if (w === 'app') {
    let el = $('appbg');
    if (!el) { el = document.createElement('div'); el.id = 'appbg'; el.setAttribute('aria-hidden', 'true'); el.appendChild(document.createElement('i')); document.body.insertBefore(el, document.body.firstChild); }
    el.style.backgroundImage = url ? 'url("' + url + '")' : 'none';
    el.firstChild.style.background = shade;
    document.documentElement.classList.toggle('has-bg', !!url);
  }
  const pv = $('bgPrev' + id);
  pv.hidden = !url; pv.style.backgroundImage = url ? 'url("' + url + '")' : 'none'; pv.firstChild.style.background = shade;
  $('bgClear' + id).disabled = !url;
  $('bgLvl' + id).value = bgLvl(w);
}
function bgCardImg() {
  if (!BG.card) { BG.cardImg = null; return; }
  const im = new Image();
  im.onload = () => { BG.cardImg = im; if (SH.open) refreshShare(); };
  im.src = BG.card;
}

/* ---------- photo storage: IndexedDB first, localStorage second, memory as a last resort ---------- */
const IMG = { db: null, touched: { app: false, card: false } };
function idbOpen() {
  if (IMG.db) return IMG.db;
  const p = new Promise((res, rej) => {
    try {
      if (!window.indexedDB) throw new Error('no idb');
      const rq = indexedDB.open('pnl-img', 1);
      rq.onupgradeneeded = () => { try { rq.result.createObjectStore('kv'); } catch (e) {} };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error || new Error('idb error'));
      rq.onblocked = () => rej(new Error('idb blocked'));
    } catch (e) { rej(e); }
  });
  IMG.db = p; p.catch(() => { if (IMG.db === p) IMG.db = null; });
  return p;
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const idbTx = (mode, fn, ms) => withTimeout(idbOpen().then(db => new Promise((res, rej) => {
  const tx = db.transaction('kv', mode); let rq;
  tx.oncomplete = () => res(rq ? rq.result : undefined);
  tx.onerror = tx.onabort = () => rej(tx.error || new Error('idb tx'));
  rq = fn(tx.objectStore('kv'));
})), ms || 5000);
const idbGet = (k, ms) => idbTx('readonly', s => s.get(k), ms);
const idbPut = (k, v, ms) => idbTx('readwrite', s => s.put(v, k), ms);
const idbDel = k => idbTx('readwrite', s => s.delete(k));

/* save + read back + compare; returns 'idb' | 'ls' | null */
async function imgStore(w, url) {
  const k = BGK[w];
  try { await idbPut(k, url); if ((await idbGet(k)) === url) { try { localStorage.removeItem(k); } catch (e) {} return 'idb'; } } catch (e) {}
  try { localStorage.setItem(k, url); if (localStorage.getItem(k) === url) return 'ls'; } catch (e) { try { localStorage.removeItem(k); } catch (e2) {} }
  return null;
}

/* decode a picked file: createImageBitmap, then object URL, then FileReader */
async function imgDecode(file) {
  try { if (window.createImageBitmap) { const bm = await createImageBitmap(file); if (bm && bm.width) return { src: bm, w: bm.width, h: bm.height, free: () => { try { bm.close(); } catch (e) {} } }; } } catch (e) {}
  const load = u => new Promise((res, rej) => { const im = new Image(); im.onload = () => (im.naturalWidth ? res(im) : rej(new Error('empty'))); im.onerror = () => rej(new Error('img')); im.src = u; });
  try { const u = URL.createObjectURL(file); try { const im = await load(u); return { src: im, w: im.naturalWidth, h: im.naturalHeight, free: () => {} }; } finally { setTimeout(() => URL.revokeObjectURL(u), 1000); } } catch (e) {}
  const du = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error || new Error('read')); fr.readAsDataURL(file); });
  const im = await load(du);
  return { src: im, w: im.naturalWidth, h: im.naturalHeight, free: () => {} };
}
function imgEncode(d, mx, q) {
  try {
    const sc = Math.min(1, mx / Math.max(d.w, d.h));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(d.w * sc)); cv.height = Math.max(1, Math.round(d.h * sc));
    const cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(d.src, 0, 0, cv.width, cv.height);
    const u = cv.toDataURL('image/jpeg', q);
    cv.width = cv.height = 1;
    return u && u.length > 64 && u.indexOf('data:image/') === 0 ? u : null;
  } catch (e) { return null; }
}
async function bgPick(w, file) {
  if (!file) return;
  if (w === 'card' && /^video\//.test(file.type || '')) return bgPickVideo(file);
  IMG.touched[w] = true;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
  let d = null;
  try {
    d = await imgDecode(file);
    const tries = w === 'app' ? [[1280, .8], [1000, .72], [760, .64], [520, .6]] : [[1350, .85], [1000, .75], [760, .66], [520, .6]];
    let url = null, where = null, last = null;
    for (const [mx, q] of tries) {
      const u = imgEncode(d, mx, q); if (!u) continue;
      last = u; where = await imgStore(w, u);
      if (where) { url = u; break; }
    }
    if (!url) { url = last || imgEncode(d, 640, .6); where = 'mem'; }
    if (!url) throw new Error('encode');
    BG[w] = url; bgApply(w); if (w === 'card') bgCardImg();
    if (w === 'card' && where !== 'mem') { const gid = await galAdd(url, d); if (!gid) SET.cardSel = null; }
    toast(where === 'mem' ? 'Background applied (phone storage is full, not kept after restart)' : 'Background saved');
  } catch (e) { toast('Could not read that image, try another one'); }
  finally { if (d) d.free(); }
}
function bgClear(w) {
  IMG.touched[w] = true;
  try { localStorage.removeItem(BGK[w]); } catch (e) {}
  idbDel(BGK[w]).catch(() => {});
  BG[w] = null; if (w === 'card') { BG.cardImg = null; vidDrop(); }
  bgApply(w); toast('Background removed');
}
function bgInit() {
  try { BG.app = localStorage.getItem(BGK.app) || null; BG.card = localStorage.getItem(BGK.card) || null; } catch (e) {}
  bgApply('app'); bgApply('card'); bgCardImg();
  ['app', 'card'].forEach(async w => {
    try {
      const v = await idbGet(BGK[w]);
      if (IMG.touched[w]) return;
      if (typeof v === 'string' && v) { if (v !== BG[w]) { BG[w] = v; bgApply(w); if (w === 'card') bgCardImg(); } }
      else if (BG[w]) imgStore(w, BG[w]).catch(() => {});   /* move the old localStorage copy into IndexedDB */
    } catch (e) {}
  });
}

/* ---------- card background gallery: thumbnails in the share sheet, full pictures loaded only when picked ---------- */
const GAL = { items: [], max: 3, ready: false };
const GAL_IDX = 'pnl-gal', galKey = id => 'pnl-gal-' + id;
async function galSaveIdx() { try { await idbPut(GAL_IDX, GAL.items.map(i => i.v ? { id: i.id, t: i.t, v: 1 } : { id: i.id, t: i.t })); } catch (e) {} }
async function galInit() {
  try { const v = await idbGet(GAL_IDX); if (Array.isArray(v)) GAL.items = v.filter(i => i && i.id && i.t); } catch (e) {}
  if (!GAL.items.length) { try { const v = await idbGet(BGK.card); if (typeof v === 'string' && v && !BG.card && !IMG.touched.card) { BG.card = v; bgApply('card'); bgCardImg(); } } catch (e) {} }
  if (!GAL.items.length && BG.card) {   /* bring the picture that was already set into the gallery */
    try {
      const im = new Image(); await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = BG.card; });
      const t = imgEncode({ src: im, w: im.naturalWidth, h: im.naturalHeight }, 160, .7);
      if (t) { const id = 'g' + Date.now().toString(36); await idbPut(galKey(id), BG.card); GAL.items.push({ id, t }); SET.cardSel = id; saveSet(); await galSaveIdx(); }
    } catch (e) {}
  }
  GAL.ready = true; galRender();
  try { const it = GAL.items.find(i => i.id === SET.cardSel); if (it && it.v && BG.card) vidLoad(it.id); } catch (e) {}
}
async function galAdd(url, d, blob) {
  if (GAL.items.length >= GAL.max) { toast('Gallery is full (' + GAL.max + '). Delete one first.'); return null; }
  const t = imgEncode(d, 160, .7); if (!t) return null;
  const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  GAL.err = null;
  /* copy the picked video into a plain in-memory Blob first: a File that points at the phone's gallery can fail to be stored */
  let stored = blob;
  if (blob) { try { if (blob.arrayBuffer) stored = new Blob([await blob.arrayBuffer()], { type: blob.type || 'video/mp4' }); } catch (e) { stored = blob; } }
  let lastE = null;
  for (let n = 0; n < 2; n++) {
    try { await idbPut(galKey(id), url, 20000); if (stored) await idbPut(galKey(id) + '-v', stored, 180000); lastE = null; break; }
    catch (e) { lastE = e; IMG.db = null; }
  }
  if (lastE) { GAL.err = lastE; idbDel(galKey(id)).catch(() => {}); idbDel(galKey(id) + '-v').catch(() => {}); return null; }
  GAL.items.push(blob ? { id, t, v: 1 } : { id, t }); await galSaveIdx(); SET.cardSel = id; saveSet(); galRender();
  return id;
}
async function galSelect(id) {
  if (!id) { SET.cardSel = null; saveSet(); bgClear('card'); galRender(); return; }
  let url = null; try { url = await idbGet(galKey(id)); } catch (e) {}
  if (typeof url !== 'string' || !url) { toast('Could not load that picture'); return; }
  IMG.touched.card = true; BG.card = url; bgApply('card'); bgCardImg();
  SET.cardSel = id; saveSet(); galRender();
  imgStore('card', url).catch(() => {});
  const it = GAL.items.find(i => i.id === id);
  if (it && it.v) vidLoad(id); else { vidDrop(); if (SH.open) shAnim(); }
}
async function galDelete(id) {
  GAL.items = GAL.items.filter(i => i.id !== id);
  idbDel(galKey(id)).catch(() => {}); idbDel(galKey(id) + '-v').catch(() => {}); await galSaveIdx();
  if (SET.cardSel === id) { SET.cardSel = null; saveSet(); bgClear('card'); } else toast('Picture deleted');
  galRender();
}

/* ---------- video background for the card ---------- */
const fmtDur = n => { n = Math.max(0, Math.round(n)); return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0'); };
function vidDrop() {
  const v = BG.cardVid; BG.cardVid = null;
  if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); } catch (e) {} }
  if (BG.vidUrl) { try { URL.revokeObjectURL(BG.vidUrl); } catch (e) {} BG.vidUrl = null; }
  refreshVidUi();
}
function vidMake(blob) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(blob), v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.preload = 'auto';
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    let done = false;
    const ok = () => { if (done) return; done = true; res({ v, u }); };
    v.onloadeddata = ok;
    v.onerror = () => { if (done) return; done = true; try { URL.revokeObjectURL(u); } catch (e) {} rej(new Error('video')); };
    setTimeout(() => { if (!done) { done = true; try { URL.revokeObjectURL(u); } catch (e) {} rej(new Error('timeout')); } }, 10000);
    document.body.appendChild(v); v.src = u; try { v.load(); } catch (e) {}
  });
}
async function vidPoster(v) {
  try { v.pause(); v.currentTime = Math.min(0.1, (v.duration || 1) / 2); await new Promise(r => { v.onseeked = r; setTimeout(r, 1500); }); } catch (e) {}
  return { src: v, w: v.videoWidth, h: v.videoHeight };
}
async function bgPickVideo(file) {
  if (GAL.items.length >= GAL.max) { toast('Gallery is full (' + GAL.max + '). Delete one first.'); return; }
  IMG.touched.card = true;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
  toast('Loading video...');
  let m = null;
  try {
    m = await vidMake(file);
    if (!m.v.videoWidth) throw new Error('novideo');
    const d = await vidPoster(m.v);
    const url = imgEncode(d, 1350, .85); if (!url) throw new Error('poster');
    const id = await galAdd(url, d, file);
    if (!id) {
      /* could not keep it in storage: still use it for this session and say what really went wrong */
      const en = (GAL.err && (GAL.err.name || GAL.err.message)) || 'thumbnail';
      vidDrop(); BG.cardVid = m.v; BG.vidUrl = m.u; SET.cardSel = null; saveSet();
      BG.card = url; bgApply('card'); bgCardImg();
      try { m.v.currentTime = 0; m.v.play().catch(() => {}); } catch (e) {}
      refreshVidUi(); if (SH.open) shAnim();
      toast('Video applied, but could not be kept after restart (' + en + ')'); return;
    }
    vidDrop(); BG.cardVid = m.v; BG.vidUrl = m.u;
    BG.card = url; bgApply('card'); bgCardImg(); imgStore('card', url).catch(() => {});
    try { m.v.currentTime = 0; m.v.play().catch(() => {}); } catch (e) {}
    refreshVidUi(); if (SH.open) shAnim();
    toast('Video background saved' + (m.v.duration && isFinite(m.v.duration) ? ' (' + fmtDur(m.v.duration) + ')' : ''));
  } catch (e) {
    if (m) { try { m.v.remove(); URL.revokeObjectURL(m.u); } catch (x) {} }
    toast('Could not read that video, try another one (MP4 works best)');
  }
}
async function vidLoad(id) {
  try {
    const b = await idbGet(galKey(id) + '-v', 60000);
    if (!b || SET.cardSel !== id) return;
    const m = await vidMake(b);
    if (SET.cardSel !== id) { try { m.v.remove(); URL.revokeObjectURL(m.u); } catch (x) {} return; }
    vidDrop(); BG.cardVid = m.v; BG.vidUrl = m.u;
    try { m.v.play().catch(() => {}); } catch (e) {}
    refreshVidUi(); if (SH.open) shAnim();
  } catch (e) {}
}
function refreshVidUi() {
  const has = !!BG.cardVid, sh = $('shShare'), sv = $('shSaveVid');
  if (sv) sv.hidden = !has;
  if (sh) sh.textContent = has ? 'Share video' : 'Share';
}
/* live preview: redraw the card ~24 times a second while a video is the background */
function shAnim() {
  cancelAnimationFrame(SH.raf); SH.raf = 0;
  const v = BG.cardVid;
  if (!SH.open || !v) { if (v) { try { v.pause(); } catch (e) {} } return; }
  try { v.play().catch(() => {}); } catch (e) {}
  let last = 0;
  const step = t => {
    if (!SH.open || !BG.cardVid) return;
    if (t - last > (SH.rec ? 30 : 41) && SH.d && !SH.d.empty && BG.cardVid.readyState >= 2) { last = t; drawCard($('shCanvas'), SH.d); }
    SH.raf = requestAnimationFrame(step);
  };
  SH.raf = requestAnimationFrame(step);
}
const vidExt = m => /mp4/.test(m) ? 'mp4' : 'webm';
/* audio: the video's own sound goes only into the recording (silent on the speaker) */
const VA = { ctx: null };
async function vidAudioPrep(v) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ok = false;
    if (AC) {
      if (!VA.ctx || VA.ctx.state === 'closed') VA.ctx = new AC();
      if (VA.ctx.state !== 'running') { try { await withTimeout(VA.ctx.resume(), 1500); } catch (e) {} }
      ok = VA.ctx.state === 'running';
    }
    if (ok) {
      if (!v._dest) { v._src = VA.ctx.createMediaElementSource(v); v._dest = VA.ctx.createMediaStreamDestination(); v._src.connect(v._dest); }
      v.muted = false; v.volume = 1;
      return v._dest.stream;
    }
    /* audio graph not available: take the sound straight from the video element (stays silent on the speaker) */
    if (!v._src) {
      const cs = (v.captureStream || v.mozCaptureStream) ? (v.captureStream || v.mozCaptureStream).call(v) : null;
      const at = cs ? cs.getAudioTracks() : [];
      if (at.length) return new MediaStream(at);
    }
    return null;
  } catch (e) { return null; }
}
async function recordCardVideo(audio) {
  const cv = $('shCanvas'), v = BG.cardVid;
  if (!v || !cv.captureStream || !window.MediaRecorder) throw new Error('unsupported');
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = types.find(t => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || '';
  const dur = v.duration && isFinite(v.duration) ? v.duration : 3600;
  v.loop = false;
  try { v.pause(); v.currentTime = 0; await new Promise(r => { v.onseeked = r; setTimeout(r, 800); }); } catch (e) {}
  const stream = cv.captureStream(30), chunks = [];
  const hasAudio = !!(audio && audio.getAudioTracks().length);
  if (audio) audio.getAudioTracks().forEach(t => stream.addTrack(t.clone()));
  const opt = { videoBitsPerSecond: 6000000, audioBitsPerSecond: 128000 }; if (mime) opt.mimeType = mime;
  const rec = new MediaRecorder(stream, opt);
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const t0 = Date.now();
  const tick = setInterval(() => { $('shHint').textContent = 'Recording video... ' + fmtDur((Date.now() - t0) / 1000) + (v.duration && isFinite(v.duration) ? ' / ' + fmtDur(dur) : ''); }, 400);
  SH.stop = false;
  try {
    await new Promise((res, rej) => {
      let ended = false;
      const fin = () => { if (ended) return; ended = true; clearTimeout(guard); clearInterval(chk); clearInterval(wd); v.removeEventListener('ended', fin); try { if (rec.state !== 'inactive') rec.stop(); } catch (e) { res(); } };
      rec.onstop = res; rec.onerror = () => rej(new Error('rec'));
      let lastT = -1, stuck = 0;
      const guard = setTimeout(fin, dur * 1000 + 4000), chk = setInterval(() => { if (SH.stop) fin(); }, 200);
      /* if the video stops moving, nudge it; give up only after ~6 s of nothing */
      const wd = setInterval(() => {
        if (v.ended) return;
        if (Math.abs(v.currentTime - lastT) < 0.01) { stuck++; try { v.play().catch(() => {}); } catch (e) {} } else stuck = 0;
        lastT = v.currentTime;
        if (stuck >= 12) fin();
      }, 500);
      v.addEventListener('ended', fin);
      rec.start(1000);
      v.play().catch(() => {});
    });
  } finally {
    clearInterval(tick); stream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
    v.loop = true; v.muted = true; try { v.play().catch(() => {}); } catch (e) {}
    $('shHint').textContent = '';
  }
  const type = rec.mimeType || mime || 'video/webm';
  const blob = new Blob(chunks, { type });
  if (!blob.size) throw new Error('empty');
  return { blob, name: 'pnl-card-' + (SH.kind === 'trade' ? 'trade' : SH.kind) + '-' + today() + '.' + vidExt(type), type, secs: (Date.now() - t0) / 1000, hasAudio };
}
const blobB64 = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => { const d = String(fr.result), i = d.indexOf(';base64,'); res(i >= 0 ? d.slice(i + 8) : d.slice(d.lastIndexOf(',') + 1)); }; fr.onerror = () => rej(fr.error); fr.readAsDataURL(b); });
async function videoOut(mode) {
  if (SH.rec) { SH.stop = true; return; }
  SH.rec = true;
  const audio = BG.cardVid ? await vidAudioPrep(BG.cardVid) : null;
  ['shShare', 'shSave'].forEach(i => { $(i).disabled = true; });
  $('shSaveVid').textContent = mode === 'share' ? 'Preparing video...' : 'Saving video...'; $('shSaveVid').disabled = true;   /* records the whole video by itself, no stop button */
  try {
    let r;
    try { r = await recordCardVideo(audio); } catch (e) { toast('This phone cannot record video here. Saving the picture instead.'); SH.rec = false; await (mode === 'share' ? shareCardImg() : saveCard()); return; }
    if (r.secs < 1.5) toast('The recording was very short - the video may not have played. Try again.');
    if (isNative()) {
      const P = window.Capacitor.Plugins;
      try {
        const data = await blobB64(r.blob);
        if (mode === 'share' && P.Filesystem && P.Share) {
          await P.Filesystem.writeFile({ path: r.name, data, directory: 'CACHE' });
          const u = await P.Filesystem.getUri({ path: r.name, directory: 'CACHE' });
          await P.Share.share({ title: r.name, files: [u.uri], dialogTitle: 'Share P&L card' }); return;
        }
        if (mode === 'save' && P.Filesystem) {
          try { if (P.Filesystem.requestPermissions) await P.Filesystem.requestPermissions(); } catch (e) {}
          let werr = null;
          for (const dir of ['DOCUMENTS', 'DOCUMENTS', 'EXTERNAL']) { try { await P.Filesystem.writeFile({ path: 'PnLJournal/' + r.name, data, directory: dir, recursive: true }); toast('Video saved to ' + (dir === 'EXTERNAL' ? 'PnLJournal folder' : 'Documents/PnLJournal') + ' \u00b7 ' + fmtDur(r.secs) + (r.hasAudio ? '' : ' \u00b7 no sound') + ' \u00b7 open the Files app'); return; } catch (e) { werr = e; } }
          /* could not write to the phone folder: open the share sheet so it can be saved from there (Files, Drive, Gallery apps...) */
          if (P.Share) {
            try {
              await P.Filesystem.writeFile({ path: r.name, data, directory: 'CACHE' });
              const u2 = await P.Filesystem.getUri({ path: r.name, directory: 'CACHE' });
              await P.Share.share({ title: r.name, files: [u2.uri], dialogTitle: 'Save video' }); return;
            } catch (e) { if (errCancel(e)) return; werr = e; }
          }
          toast('Could not save the video (' + ((werr && (werr.message || werr.name)) || 'unknown') + ')'); return;
        }
      } catch (e) { if (errCancel(e)) return; }
    }
    if (mode === 'share') {
      try {
        const f = new File([r.blob], r.name, { type: r.type.split(';')[0] });
        if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: r.name }); return; }
      } catch (e) { if (errCancel(e)) return; }
    }
    const a = document.createElement('a'), u = URL.createObjectURL(r.blob);
    a.href = u; a.download = r.name; a.rel = 'noopener'; a.style.display = 'none'; document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(u); }, 8000); toast('Video downloaded');
  } finally {
    SH.rec = false;
    ['shShare', 'shSave', 'shSaveVid'].forEach(i => { $(i).disabled = false; });
    $('shSaveVid').textContent = 'Save video';
    refreshShare();
  }
}
function galRender() {
  const el = $('shGal'); if (!el) return;
  const sel = BG.card ? SET.cardSel : null;
  let h = '<button type="button" class="gtile' + (!BG.card ? ' sel' : '') + '" data-g="none" aria-label="No background">None</button>';
  GAL.items.forEach(i => { h += '<button type="button" class="gtile' + (i.id === sel ? ' sel' : '') + '" data-g="' + i.id + '" aria-label="Use this picture"><img src="' + i.t + '" alt="">' + (i.v ? '<span class="gplay">&#9654;</span>' : '') + '<span class="gx" data-gdel="' + i.id + '" aria-label="Delete">&#10005;</span></button>'; });
  if (GAL.items.length < GAL.max) h += '<button type="button" class="gtile add" data-g="add" aria-label="Add picture">+</button>';
  el.innerHTML = h;
  $('galNote').textContent = GAL.items.length + ' / ' + GAL.max + ' backgrounds saved (pictures or videos)';
}
const pcttxt = n => n == null ? '\u2014' : sgn(n) + fixed(n, 2) + '%';

function setSess(v) {
  S.session = v || '';
  document.querySelectorAll('[data-act="sess"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.session));
}

function renderGoalForm(unitOnly) {
  $('goalUnit').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === SET.unit));
  $('g-val').placeholder = SET.unit === '%' ? '10' : '1000';
  if (unitOnly) return;
  $('g-val').value = SET.goal != null ? SET.goal : '';
  $('g-bal').value = SET.balance != null ? SET.balance : '';
  $('g-loss').value = SET.maxLoss != null ? SET.maxLoss : '';
  $('g-name').value = SET.name || '';
}
function saveGoal() {
  const g = num($('g-val').value), b = num($('g-bal').value), l = num($('g-loss').value);
  SET.goal = g != null && g > 0 ? g : null;
  SET.maxLoss = l != null && l > 0 ? l : null;
  SET.balance = b != null && b > 0 ? b : null;
  SET.name = $('g-name').value.trim().slice(0, 28);
  saveSet(); toast('Saved');
}
function goalHtml(net) {
  const pc = SET.unit === '%';
  if (!(SET.goal > 0)) return `<button class="link goalset" data-act="goalset">Set a monthly goal</button>`;
  if (pc && !(SET.balance > 0)) return `<button class="link goalset" data-act="goalset">Add your account balance to track a % goal</button>`;
  const val = pc ? pctOf(net) : net, f = Math.max(0, Math.min(1, val / SET.goal)), done = val >= SET.goal;
  const nf = n => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const have = pc ? pcttxt(val) : money(val), tgt = pc ? nf(SET.goal) + '%' : '$' + nf(SET.goal);
  return `<div class="goal"><div class="gtop"><b class="${cls(val)}">${have}</b><span>of ${tgt} \u00b7 ${done ? 'goal reached' : Math.round(f * 100) + '%'}</span></div>
    <div class="gbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(f * 100)}"><i style="width:${(f * 100).toFixed(1)}%"></i></div></div>`;
}

/* ---------- share cards (canvas -> PNG) ---------- */
const SH = { open: false, skip: 0, kind: 'day', ref: '', tradeId: null, d: null, raf: 0, rec: false, stop: false };
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const addDays = (k, n) => { const d = parseDay(k); d.setDate(d.getDate() + n); return ymd(d); };
const weekStart = k => { const d = parseDay(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
const shortDay = k => parseDay(k).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function period() {
  const all = visible();
  if (SH.kind === 'week') {
    const a = weekStart(SH.ref), b = addDays(a, 6);
    return { trades: all.filter(t => t.date >= a && t.date <= b), label: shortDay(a) + ' \u2013 ' + shortDay(b), title: 'Weekly', range: shortDay(a) + ' \u2013 ' + fmtDate(b) };
  }
  if (SH.kind === 'month') {
    const m = SH.ref.slice(0, 7);
    return { trades: all.filter(t => t.date.startsWith(m)), label: monthLabel(m), title: 'Monthly', range: monthLabel(m) };
  }
  if (SH.kind === 'all') {
    return { trades: all, label: 'All time', title: 'Lifetime', range: all.length ? fmtDate(all[0].date) + ' \u2013 ' + fmtDate(all[all.length - 1].date) : '' };
  }
  return { trades: all.filter(t => t.date === SH.ref), label: dayLabel(SH.ref), title: 'Daily', range: fmtDate(SH.ref) };
}

function bigFor(net, rsum, wr, fb) {
  if (!SET.hide) return { txt: money(net), tone: net };
  const pc = pctOf(net);
  if (pc != null) return { txt: pcttxt(pc), tone: net };
  if (rsum != null) return { txt: rtxt(rsum), tone: rsum };
  return { txt: wr != null ? Math.round(wr * 100) + '%' : (fb || '\u2014'), tone: net };
}

function cardData() {
  const nm = SET.name || 'P&L Card', brand = !!SET.name;
  if (SH.kind === 'trade') {
    const t = S.trades.find(x => x.id === SH.tradeId); if (!t) return null;
    const c = calc(t), live = !!t.live, big = live ? { txt: t.side === 'Sell' ? 'SHORT' : 'LONG', tone: t.side === 'Sell' ? -1 : 1 } : bigFor(t.pnl, c.r, null, t.pnl >= 0 ? 'Win' : 'Loss'), parts = [];
    if (!live && SET.hide && pctOf(t.pnl) != null && c.r != null) parts.push(rtxt(c.r));
    if (t.session) parts.push(t.session);
    const levels = [
      t.tp != null && { k: 'TP', v: t.tp, c: CARD.win, dash: true },
      t.entry != null && { k: 'Entry', v: t.entry, c: CARD.ink },
      t.exit != null && { k: 'Exit', v: t.exit, c: t.pnl >= 0 ? CARD.win : CARD.loss },
      t.sl != null && { k: 'SL', v: t.sl, c: CARD.loss, dash: true }
    ].filter(Boolean);
    if (live) return { kind: 'trade', live: true, side: t.side, symbol: t.symbol, session: t.session || '', name: nm, brand, title: t.symbol + ' \u00b7 ' + t.side, range: fmtDate(t.date), big: big.txt, tone: big.tone, sub: parts.join(' \u00b7 ') || 'Open position', levels,
      stats: [['Status', 'Position'], ['Planned R:R', rrtxt(c.rr)], ['Lot', t.lot != null ? String(t.lot) : '\u2014'], ['Risk', c.risk != null ? fixed(c.risk, 1) + ' pts' : '\u2014']] };
    return { kind: 'trade', side: t.side, symbol: t.symbol, session: t.session || '', name: nm, brand, title: t.symbol + ' \u00b7 ' + t.side, range: fmtDate(t.date), big: big.txt, tone: big.tone, sub: parts.join(' \u00b7 '), levels,
      stats: [['Result', c.r != null ? rtxt(c.r) : '\u2014', c.r], ['Planned R:R', rrtxt(c.rr)],
              ['Points', c.pts != null ? sgn(c.pts) + fixed(c.pts, 1) : '\u2014', c.pts], ['Risk', c.risk != null ? fixed(c.risk, 1) + ' pts' : '\u2014']] };
  }
  const p = period(), tr = p.trades, st = stats(tr);
  const rs = tr.map(t => calc(t).r).filter(v => v != null), rsum = rs.length ? sum(rs) : null;
  const big = bigFor(st.net, rsum, st.winRate), parts = [tr.length + ' trade' + (tr.length === 1 ? '' : 's')];
  if (SET.hide && pctOf(st.net) != null && rsum != null) parts.push(rtxt(rsum));
  if (S.symbol !== 'ALL') parts.push(S.symbol);
  const eq = [0]; tr.forEach(t => eq.push(eq[eq.length - 1] + t.pnl));
  return { kind: 'period', rec: tr.map(t => t.pnl), empty: !tr.length, name: nm, brand, title: p.title, range: p.range,
    big: tr.length ? big.txt : '\u2014', tone: tr.length ? big.tone : 0, sub: tr.length ? parts.join(' \u00b7 ') : 'No trades in this period', curve: eq,
    stats: [['Win rate', st.winRate == null ? '\u2014' : Math.round(st.winRate * 100) + '%'], ['Profit factor', pfTxt(st)],
            ['Trades', String(st.n)], ['Avg result', rtxt(st.avgR), st.avgR]] };
}

const CARD_DEF = { bg: '#F6F2E9', ink: '#1C2B23', muted: '#6E6A5C', line: '#DDD5C3', win: '#2E6B4B', loss: '#9A3A36',
  curve: '#1F3A2C', curveRgb: '31,58,44', winRgb: '46,107,75', lossRgb: '154,58,54', glow: '31,58,44' };
let CARD = CARD_DEF;
/* share card follows the chosen theme */
function loadCard() {
  const r = document.documentElement;
  if (!r.getAttribute('data-theme')) { CARD = CARD_DEF; return; }
  const cs = getComputedStyle(r), v = n => cs.getPropertyValue(n).trim();
  CARD = { bg: v('--bg') || CARD_DEF.bg, ink: v('--ink') || CARD_DEF.ink, muted: v('--muted') || CARD_DEF.muted, line: v('--line') || CARD_DEF.line,
    win: v('--win') || CARD_DEF.win, loss: v('--loss') || CARD_DEF.loss, curve: v('--curve') || CARD_DEF.curve,
    curveRgb: v('--tint') || CARD_DEF.curveRgb, winRgb: v('--win-rgb') || CARD_DEF.winRgb, lossRgb: v('--loss-rgb') || CARD_DEF.lossRgb,
    glow: v('--tint') || CARD_DEF.glow };
  const id = r.getAttribute('data-theme'), dark = r.getAttribute('data-mode') === 'dark';
  if (dark && id === 'glass') CARD.blobs = GLASS_BLOBS; else if (dark && id === 'aurora') CARD.blobs = AURORA_BLOBS;
  if (id === 'amoled') Object.assign(CARD, { amoled: true, blobs: null }, dark
    ? { bg: '#000000', ink: '#FFFFFF', muted: '#8E8E8E', line: '#2A2A2A', win: '#FFFFFF', loss: '#FF4D5A', curve: '#FFFFFF', curveRgb: '255,255,255', winRgb: '255,255,255', lossRgb: '255,77,90', glow: '255,255,255' }
    : { amoled: false, sub: '#B8BDB5', bg: '#0A0B0C', ink: '#ECEEEA', muted: '#8D938B', line: '#2B2E2A', win: '#B9F26B', loss: '#FF7A6B', curve: '#B9F26B', curveRgb: '185,242,107', winRgb: '185,242,107', lossRgb: '255,122,107', glow: '185,242,107' });
  if (id === 'bluechip') { CARD.curve = CARD.win; CARD.curveRgb = CARD.winRgb; CARD.glow = CARD.winRgb; }   /* Blue Chip: green arrow / curve */
  applyVivid();
}
/* brighten win / loss / curve colours so the card pops on every theme (amoled dark stays pure mono) */
function applyVivid() {
  if (!CARD || CARD.amoled) return;
  const ok = h => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);
  if (!ok(CARD.bg)) return;
  const toHsl = h => {
    const c = [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16) / 255), mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), d = mx - mn;
    let hh = 0, l = (mx + mn) / 2, sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (d) { if (mx === c[0]) hh = ((c[1] - c[2]) / d + 6) % 6; else if (mx === c[1]) hh = (c[2] - c[0]) / d + 2; else hh = (c[0] - c[1]) / d + 4; hh *= 60; }
    return [hh, sat, l];
  };
  const toHex = (h, sat, l) => {
    const k = n => (n + h / 30) % 12, a = sat * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return '#' + [f(0), f(8), f(4)].map(v => { const x = Math.round(Math.max(0, Math.min(1, v)) * 255); return (x < 16 ? '0' : '') + x.toString(16); }).join('').toUpperCase();
  };
  const dark = lumHex(CARD.bg) < .3;
  const vivid = (hex, minS) => {
    if (!ok(hex)) return hex;
    const hsl = toHsl(hex), hh = hsl[0]; let sat = hsl[1], l = hsl[2];
    if (sat < .12) return hex;
    sat = Math.max(sat, minS);
    l = dark ? Math.min(Math.max(l, .68), .76) : Math.max(l, .28);
    let out = toHex(hh, sat, l);
    for (let n = 0; n < 20 && contrastHex(out, CARD.bg) < (dark ? 4.5 : 3.6); n++) { l += dark ? .02 : -.02; out = toHex(hh, sat, Math.max(.05, Math.min(.95, l))); }
    return out;
  };
  CARD.win = vivid(CARD.win, .9); CARD.loss = vivid(CARD.loss, .9);
  CARD.winRgb = hexRgb(CARD.win); CARD.lossRgb = hexRgb(CARD.loss);
  if (ok(CARD.curve)) { CARD.curve = vivid(CARD.curve, .5); CARD.curveRgb = hexRgb(CARD.curve); CARD.glow = CARD.curveRgb; }
}
const GLASS_BLOBS = [[.06, .03, '70,140,255', .78], [.98, .14, '168,108,255', .62], [.5, .46, '40,96,210', .3], [1.02, .7, '0,216,222', .42], [-.02, .78, '255,104,186', .34], [.45, 1.04, '56,126,255', .66]];
const AURORA_BLOBS = [[.06, .03, '79,91,255', .5], [.98, .16, '192,107,255', .4], [.5, 1.04, '255,154,107', .26]];
const lumHex = h => { h = h.replace('#', ''); const c = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const contrastHex = (a, b) => { const x = lumHex(a), y = lumHex(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const hexRgb = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)).join(','); };
const SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
const CARD_FONTS = {
  default: { fam: '"Urbanist",' + SANS, w: '600 ' },
  figtree: { fam: '"Figtree",' + SANS, w: '600 ' },
  plexmono: { fam: '"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace', w: '500 ', s: 0.88 }
};
const CARD_SIZES = { '11': [1080, 1080], '43': [1440, 1080], '21': [1440, 720] };
const CARD_RADII = { s: 36, m: 72 };
const TERM_FAM = 'ui-monospace,"SF Mono",Menlo,Consolas,"Roboto Mono","Courier New",monospace';
function termPal(d) {
  const p = Object.assign({}, CARD);
  p.sub = CARD.sub || PnlTheme.mix(CARD.ink, CARD.bg, .3);
  let cv = CARD.curve;
  if (!/^#[0-9a-f]{6}$/i.test(cv) || (!CARD.amoled && contrastHex(cv, CARD.bg) < 2.2)) cv = CARD.win;
  if (d.tone < 0 && !CARD.amoled) cv = CARD.loss;   /* AMOLED dark stays white on losses too */
  p.curve = cv; p.curveRgb = /^#[0-9a-f]{6}$/i.test(cv) ? hexRgb(cv) : CARD.curveRgb;
  return p;
}
const BC_CARD_FONT = { fam: '"Inter",' + SANS, w: '600 ' };   /* Blue Chip: card follows the theme's sans UI font when font = Classic */
const bcCard = () => false;
const FN = px => { const f = bcCard() ? BC_CARD_FONT : (CARD_FONTS[SET.font] || CARD_FONTS.default); return f.w + Math.round(px * (f.s || 1)) + 'px ' + f.fam; };

function trendPath(pts, raw) {
  if (!raw && pts.length > 2) { const o = pts.map(q => q.slice()); for (let k = 0; k < 2; k++) { const b = o.map(q => q.slice()); for (let i = 1; i < o.length - 1; i++) o[i][1] = b[i][1] * .4 + (b[i - 1][1] + b[i + 1][1]) * .3; } pts = o; }
  const n = pts.length, path = new Path2D(); path.moveTo(pts[0][0], pts[0][1]);
  let ang = 0;
  if (n === 2) {
    const x0 = pts[0][0], y0 = pts[0][1], x1 = pts[1][0], y1 = pts[1][1], dx = x1 - x0;
    const c1x = x0 + dx * .33, c1y = y0 + (y1 - y0) * .16, c2x = x1 - dx * .33, c2y = y1 - (y1 - y0) * .16;
    path.bezierCurveTo(c1x, c1y, c2x, c2y, x1, y1);
    ang = Math.atan2(y1 - c2y, x1 - c2x);
  } else {
    const dx = [], d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; d[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], q = a * a + b * b;
      if (q > 9) { const t = 3 / Math.sqrt(q); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; path.bezierCurveTo(pts[i][0] + h, pts[i][1] + m[i] * h, pts[i + 1][0] - h, pts[i + 1][1] - m[i + 1] * h, pts[i + 1][0], pts[i + 1][1]); }
    ang = Math.atan2(m[n - 1], 1);
  }
  return { path, ang };
}
/* Terminal card: one fixed trend shape (two small dips, fixed arrow angle), up for profit, down for loss */
let TREND_STYLE = 'A';
const TREND_SHAPES = { A: [[0, 0], [.24, .24], [.36, .12], [.58, .34], [.70, .22], [1, .52]] };
function arrowHead(ctx, x, y, ang, len, wid) {
  const ux = Math.cos(ang), uy = Math.sin(ang), px = -uy, py = ux, r = 9;
  len -= r * 1.6; wid -= r * 1.6;
  ctx.beginPath(); ctx.moveTo(x + ux * len * .55, y + uy * len * .55);
  ctx.lineTo(x - ux * len * .45 + px * wid / 2, y - uy * len * .45 + py * wid / 2);
  ctx.lineTo(x - ux * len * .45 - px * wid / 2, y - uy * len * .45 - py * wid / 2);
  ctx.closePath(); ctx.fill();
  ctx.save(); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = r * 2; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
}

function rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* brighter secondary text on every card, derived from the active theme's own ink/bg */
function lift(p) {
  const hex = c => /^#[0-9a-f]{6}$/i.test(c || ''), q = Object.assign({}, p);
  if (hex(q.ink)) ['muted', 'sub'].forEach(k => { if (!hex(q[k])) return; let m = .7, o = PnlTheme.mix(q[k], q.ink, m); if (hex(q.bg)) for (; m < 1 && contrastHex(o, q.bg) < 7; m += .05) o = PnlTheme.mix(q[k], q.ink, m); q[k] = o; });
  return q;
}
function drawCard(cv, d) {
  const sz = CARD_SIZES[SET.cardRatio] || CARD_SIZES['43'], W = sz[0], H = sz[1], land = W > H, sq = W === H, wide = W >= 2 * H;
  const TERM = SET.cardStyle !== 'classic', X = 72, R = CARD_RADII[SET.cardRound] || CARD_RADII.s;
  const C = lift(TERM ? termPal(d) : CARD), F = TERM ? (SET.font !== 'default' && CARD_FONTS[SET.font] ? FN : (px => (px <= 44 ? '600 ' : '') + Math.round(px) + 'px ' + TERM_FAM)) : FN;
  if (document.documentElement.getAttribute('data-theme') === 'bluechip' && d.tone < 0) { C.curve = C.loss; C.curveRgb = C.lossRgb; }
  /* Morpho Classic: white curve; Vision: green on profit, red on loss */
  const VT = document.documentElement.getAttribute('data-vt');
  if (VT === 'morpho') { C.curve = '#FFFFFF'; C.curveRgb = '255,255,255'; }
  else if (VT === 'vision') { const neg = d.tone < 0; C.curve = neg ? C.loss : C.win; C.curveRgb = neg ? C.lossRgb : C.winRgb; }
  /* per-size layout: vertical positions of every block */
  const Y = wide ? { ic: 52, nm: 94, ti: 176, tiS: 42, rg: 216, rgS: 28, bg: 330, bgS: 124, sb: 376, sbS: 30, T: 100, B: 560, st: 436, sr: 112, lo: 36, vo: 84, lp: 32, vp: 46, ft: 680, bw: 568 }
    : land ? { ic: 64, nm: 110, ti: 214, tiS: 46, rg: 258, rgS: 32, bg: 400, bgS: 150, sb: 450, sbS: 34, T: 150, B: 830, st: 560, sr: 160, lo: 48, vo: 112, lp: 36, vp: 54, ft: 1038, bw: 568 }
    : sq ? { ic: 64, nm: 110, ti: 214, tiS: 46, rg: 258, rgS: 32, bg: 414, bgS: 140, sb: 462, sbS: 34, T: 506, B: 716, st: 752, sr: 128, lo: 42, vo: 98, lp: 34, vp: 50, ft: 1038, bw: W - 2 * X }
    : { ic: 92, nm: 138, ti: 262, tiS: 50, rg: 312, rgS: 34, bg: 500, bgS: 176, sb: 556, sbS: 36, T: 620, B: 930, st: 984, sr: 150, lo: 48, vo: 112, lp: 36, vp: 54, ft: 1318, bw: W - 2 * X };
  const YT = TERM ? (wide ? { T: 205, B: 495 } : land ? { T: 250, B: 700 } : { T: 540, B: 705 }) : Y;
  const T = YT.T, B = YT.B, LX = land ? (TERM ? 790 : 720) : X, RX = W - X;
  cv.width = W; cv.height = H;
  cv.style.border = R ? '0' : '';
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const halo = !!(BG.cardImg || C.blobs), hc = lumHex(C.bg) < .4 ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.7)', rawFill = CanvasRenderingContext2D.prototype.fillText.bind(ctx);
  ctx.fillText = (s, x, y) => { if (!halo) return rawFill(s, x, y); ctx.save(); ctx.shadowColor = hc; ctx.shadowBlur = 12; ctx.shadowOffsetY = 2; rawFill(s, x, y); ctx.restore(); };
  const LT = CARD.amoled ? C.ink : C.loss;   /* AMOLED dark: loss text stays white like the arrow */
  const tone = v => v > 0 ? C.win : v < 0 ? LT : C.ink;
  const fit = (txt, size, max, FF) => { FF = FF || F; let f = size; ctx.font = FF(f); while (ctx.measureText(txt).width > max && f > 18) { f -= 2; ctx.font = FF(f); } };
  ctx.save(); rrect(ctx, 0, 0, W, H, R); ctx.clip();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  if (C.blobs) {
    C.blobs.forEach(a => {
      const ax = a[0] * W, ay = a[1] * H, ag = ctx.createRadialGradient(ax, ay, 0, ax, ay, Math.max(W, H) * .55);
      ag.addColorStop(0, 'rgba(' + a[2] + ',' + a[3] + ')'); ag.addColorStop(1, 'rgba(' + a[2] + ',0)');
      ctx.fillStyle = ag; ctx.fillRect(0, 0, W, H);
    });
  }
  if (BG.cardImg) {
    const vd = BG.cardVid && BG.cardVid.readyState >= 2 && BG.cardVid.videoWidth ? BG.cardVid : null;
    const im = vd || BG.cardImg, nw = vd ? vd.videoWidth : im.naturalWidth, nh = vd ? vd.videoHeight : im.naturalHeight;
    const sc = Math.max(W / nw, H / nh), iw = nw * sc, ih = nh * sc;
    ctx.drawImage(im, (W - iw) / 2, (H - ih) / 2, iw, ih);
    ctx.fillStyle = bgShade(bgLvl('card')); ctx.fillRect(0, 0, W, H);
  }
  const gc = d.tone > 0 ? C.winRgb : d.tone < 0 ? C.lossRgb : C.glow;
  const gx = land ? 420 : W / 2, gy = land ? 330 : (H === 1350 ? 380 : Math.round(H * .28));
  if (!TERM) {
    const g = ctx.createRadialGradient(gx, gy, 20, gx, gy, 820);
    g.addColorStop(0, 'rgba(' + gc + ',.18)'); g.addColorStop(1, 'rgba(' + gc + ',0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  if (TERM) {
    const ls = v => { if ('letterSpacing' in ctx) ctx.letterSpacing = v; };
    ctx.fillStyle = C.muted; ctx.font = F(38); ls('6px'); ctx.fillText('TRADE CARD', X, wide ? 74 : 104);
    { let an = acCur().name.toUpperCase(); const mx = W - 2 * X - 380; while (an.length > 3 && ctx.measureText(an).width > mx) an = an.slice(0, -2) + '\u2026';
      ctx.textAlign = 'right'; ctx.fillText(an, W - X, wide ? 74 : 104); ctx.textAlign = 'left'; }
    ls('0px');
    const tc = d.tone > 0 ? C.win : d.tone < 0 ? LT : C.ink;
    const chips = d.kind === 'trade'
      ? [{ t: String(d.side || '').toUpperCase(), fill: d.side === 'Sell' ? C.loss : C.win }, { t: d.symbol }, d.session && { t: d.session }, { t: d.range }]
      : [{ t: String(d.title).toUpperCase(), fill: tc }, { t: d.range }];
    let cxp = X; ctx.font = F(36); ctx.textBaseline = 'middle';
    chips.filter(c => c && c.t).forEach(c => {
      const cw = ctx.measureText(c.t).width + 52;
      if (cxp + cw > W - X) return;
      rrect(ctx, cxp, wide ? 100 : 150, cw, 64, 12);
      if (c.fill) { ctx.fillStyle = c.fill; ctx.fill(); ctx.fillStyle = PnlTheme.on(c.fill); }
      else { ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = C.sub; }
      ctx.fillText(c.t, cxp + 26, wide ? 133 : 183); cxp += cw + 14;
    });
    ctx.textBaseline = 'alphabetic';
    const lw = land ? 650 : W - 2 * X, by = wide ? 330 : land ? 440 : 360;
    ctx.fillStyle = d.empty ? C.muted : tc; fit(d.big, wide ? 150 : land ? 190 : 150, lw, FN); ctx.fillText(d.big, X, by);
    ctx.fillStyle = C.sub; const subT = d.kind === 'trade' ? d.sub.split(' \u00b7 ').filter(x => x && x !== d.session).join(' \u00b7 ') : d.sub;
    fit(subT, wide ? 44 : 48, lw); ctx.fillText(subT, X, by + (wide ? 62 : land ? 80 : 68));
  } else {
  // brand + title
  ctx.save(); ctx.translate(X, Y.ic); ctx.scale(2.7, 2.7);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.stroke(new Path2D('M3 15c2.5 0 3-5 5.5-5S11 17 14 17s2.5-9 7-9')); ctx.restore();
  ctx.fillStyle = C.ink; fit(d.name, 38, Y.bw - 80); ctx.fillText(d.name, X + 76, Y.nm);
  ctx.fillStyle = C.ink; fit(d.title, Y.tiS, Y.bw); ctx.fillText(d.title, X, Y.ti);
  ctx.fillStyle = C.muted; fit(d.range, Y.rgS, Y.bw); ctx.fillText(d.range, X, Y.rg);

  // big number + sub
  ctx.fillStyle = d.empty ? C.muted : tone(d.tone); fit(d.big, Y.bgS, Y.bw); ctx.fillText(d.big, X, Y.bg);
  ctx.fillStyle = C.muted; fit(d.sub, Y.sbS, Y.bw); ctx.fillText(d.sub, X, Y.sb);

  }
  if (d.kind === 'period') {
    const p = d.curve, x0 = land ? LX : 40, x1 = (land ? RX : W - 40) - (TERM ? 36 : 0);
    const lo = Math.min(0, ...p), hi = Math.max(0, ...p), span = (hi - lo) || 1;
    const cx = i => x0 + (x1 - x0) * (i / (p.length - 1 || 1));
    const cy = v => T + 20 + (B - T - 40) * (1 - (v - lo) / span);
    ctx.setLineDash([6, 12]); ctx.strokeStyle = C.line; ctx.lineWidth = 2;
    const FIX = TERM && p.length > 1, up = d.tone >= 0, yb = B - 20, yt = T + 20;
    const zy = FIX ? (up ? yb : yt) : cy(0);
    ctx.beginPath(); ctx.moveTo(land ? x0 : 0, zy); ctx.lineTo(land ? x1 : W, zy); ctx.stroke(); ctx.setLineDash([]);
    if (p.length > 1) {
      let path, tAng = 0, FP = null;
      if (TERM) {
        const Wd = x1 - x0, sc = Math.min(1, (yb - yt) / (.52 * Wd));
        const fp = TREND_SHAPES[TREND_STYLE].map(q => [x0 + q[0] * Wd * sc, up ? yb - q[1] * Wd * sc : yt + q[1] * Wd * sc]);
        path = new Path2D(); path.moveTo(fp[0][0], fp[0][1]); for (let i = 1; i < fp.length; i++) path.lineTo(fp[i][0], fp[i][1]);
        const a = fp[fp.length - 2], e = fp[fp.length - 1]; tAng = Math.atan2(e[1] - a[1], e[0] - a[0]); FP = fp;
      }
      else {
        path = new Path2D(); path.moveTo(cx(0), cy(p[0]));
        for (let i = 1; i < p.length; i++) { const mx = (cx(i - 1) + cx(i)) / 2; path.bezierCurveTo(mx, cy(p[i - 1]), mx, cy(p[i]), cx(i), cy(p[i])); }
      }
      const area = new Path2D(path); area.lineTo(FP ? FP[FP.length - 1][0] : cx(p.length - 1), B); area.lineTo(FP ? FP[0][0] : cx(0), B); area.closePath();
      const ag = ctx.createLinearGradient(0, T, 0, B); ag.addColorStop(0, 'rgba(' + C.curveRgb + ',.16)'); ag.addColorStop(1, 'rgba(' + C.curveRgb + ',0)');
      ctx.fillStyle = ag; ctx.fill(area);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(' + C.curveRgb + ',.16)'; ctx.lineWidth = TERM ? 12 : 18; ctx.stroke(path);
      ctx.strokeStyle = C.curve; ctx.lineWidth = TERM ? 6 : 5; ctx.stroke(path);
      ctx.fillStyle = C.curve;
      if (TERM) { const e = FP[FP.length - 1]; ctx.fillStyle = 'rgba(' + C.curveRgb + ',.16)'; ctx.beginPath(); ctx.arc(e[0], e[1], 26, 0, 7); ctx.fill(); ctx.fillStyle = C.curve; ctx.beginPath(); ctx.arc(e[0], e[1], 12, 0, 7); ctx.fill(); }   /* dot + soft ring */
      else { ctx.beginPath(); ctx.arc(cx(p.length - 1), cy(p[p.length - 1]), 11, 0, 7); ctx.fill(); }
    }
  } else {
    const L = TERM ? d.levels.map(l => Object.assign({}, l, { c: l.k === 'Entry' ? C.ink : l.k === 'Exit' ? (d.tone >= 0 ? C.win : C.loss) : l.k === 'TP' ? C.win : C.loss })) : d.levels;
    if (L.length < 2) {
      ctx.fillStyle = C.muted; ctx.font = F(land ? 26 : 30); ctx.textAlign = 'center';
      ctx.fillText(d.live ? 'Add entry, SL and TP to see the position map' : 'Add entry and exit prices to see the trade map', land ? (LX + RX) / 2 : W / 2, (T + B) / 2); ctx.textAlign = 'left';
    } else {
      const vs = L.map(l => l.v), lo = Math.min(...vs), hi = Math.max(...vs), span = (hi - lo) || 1, Y0 = T + 24, Y1 = B - 24;
      L.forEach(l => { l.y = Y0 + (Y1 - Y0) * (1 - (l.v - lo) / span); });
      const lx0 = LX + (land ? 120 : 130), lx1 = RX - (land ? 190 : 250);
      const en = L.find(l => l.k === 'Entry'), ex = L.find(l => l.k === 'Exit');
      if (en && ex) { ctx.fillStyle = 'rgba(' + (d.tone >= 0 ? C.winRgb : C.lossRgb) + ',.14)'; ctx.fillRect(lx0, Math.min(en.y, ex.y), lx1 - lx0, Math.abs(en.y - ex.y)); }
      ctx.lineCap = 'butt';
      L.forEach(l => { ctx.setLineDash(l.dash ? [14, 12] : []); ctx.strokeStyle = l.c; ctx.lineWidth = l.k === 'Exit' ? 6 : 3; ctx.beginPath(); ctx.moveTo(lx0, l.y); ctx.lineTo(lx1, l.y); ctx.stroke(); });
      ctx.setLineDash([]);
      const gap = sq ? 40 : 46;
      const ord = L.slice().sort((a, b) => a.y - b.y); let prev = -1e9;
      ord.forEach(l => { l.ly = Math.max(l.y, prev + gap); prev = l.ly; });
      const last = ord.length - 1, over = ord[last].ly - (Y1 + 10);
      if (over > 0) { ord[last].ly -= over; for (let i = last - 1; i >= 0; i--) ord[i].ly = Math.min(ord[i].ly, ord[i + 1].ly - gap); }
      ctx.textBaseline = 'middle'; ctx.font = F(sq ? 30 : 34);
      ord.forEach(l => {
        ctx.textAlign = 'left'; ctx.fillStyle = C.muted; ctx.fillText(l.k, LX, l.ly);
        ctx.textAlign = 'right'; ctx.fillStyle = l.c; ctx.fillText(px(l.v), RX, l.ly);
      });
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    }
  }

  if (TERM) {
    ctx.fillStyle = C.line; ctx.fillRect(X, wide ? 524 : land ? 750 : 735, W - 2 * X, 2);
    const sy = wide ? 574 : land ? 812 : 800, gap = wide ? 52 : 54, c1 = land ? LX : 560, vo = wide ? 226 : land ? 290 : 292, mw = wide ? (d.kind === 'trade' ? 165 : 130) : land ? 270 : 150, two = d.kind === 'trade' || wide, lf = wide ? 30 : 35, c2 = X + (d.kind === 'trade' ? 425 : 340);
    let cc2 = c2, v1 = vo, v2 = vo, m1 = mw, m2 = mw;
    if (wide) { ctx.font = F(lf); const wl = k => Math.max(0, ...d.stats.filter((s, i) => i % 2 === k).map(s => ctx.measureText(s[0]).width)) + 26; v1 = wl(0); v2 = wl(1); m1 = 118; cc2 = X + v1 + m1 + 34; m2 = Math.max(70, c1 - 30 - (cc2 + v2)); }
    d.stats.forEach((st, i) => {
      const x = wide ? (i % 2 ? cc2 : X) : two ? (i < 2 ? X : c1) : X, y = sy + (wide ? Math.floor(i / 2) : two ? i % 2 : i) * gap;
      const vv = wide ? (i % 2 ? v2 : v1) : vo, mm = wide ? (i % 2 ? m2 : m1) : mw;
      ctx.fillStyle = C.muted; ctx.font = F(lf); ctx.fillText(st[0], x, y);
      ctx.fillStyle = typeof st[2] === 'number' ? tone(st[2]) : C.ink; fit(st[1], wide ? 34 : 36, mm); ctx.fillText(st[1], x + vv, y);
    });
    if (d.kind === 'period' && d.rec && d.rec.length) {
      const all = d.rec, rec = all.slice(-20), n = rec.length, avail = RX - c1, sz = Math.min(wide ? 36 : 52, (avail - (n - 1) * 10) / n);
      ctx.fillStyle = C.muted; ctx.font = F(34);
      ctx.fillText(n < all.length ? 'LAST ' + n + ' OF ' + all.length : 'ALL ' + n + ' TRADE' + (n === 1 ? '' : 'S'), c1, sy);
      rec.forEach((v, i) => { rrect(ctx, c1 + i * (sz + 10), sy + 24, sz, sz, 7); ctx.fillStyle = v > 0 ? C.win : v < 0 ? C.loss : C.muted; ctx.fill(); });
      const w = all.filter(v => v > 0).length, l = all.filter(v => v < 0).length;
      ctx.fillStyle = C.ink; ctx.font = F(36); ctx.fillText(w + 'W \u00b7 ' + l + 'L', c1, sy + 24 + sz + (wide ? 40 : 54));
    }
  } else {
  // stats grid
  const cw = land ? (Y.bw - 24) / 2 : W / 2 - X - 20, cols = land ? [X, X + cw + 24] : [X, W / 2 + 20];
  d.stats.forEach((st, i) => {
    const x = cols[i % 2], y = Y.st + Math.floor(i / 2) * Y.sr;
    ctx.fillStyle = C.line; ctx.fillRect(x, y, cw, 2);
    ctx.fillStyle = C.muted; ctx.font = F(Y.lp); ctx.fillText(st[0], x, y + Y.lo);
    ctx.fillStyle = typeof st[2] === 'number' ? tone(st[2]) : C.ink; fit(st[1], Y.vp, cw); ctx.fillText(st[1], x, y + Y.vo);
  });

  // footer
  ctx.fillStyle = C.muted; ctx.font = F(34); ctx.fillText(fmtDate(today()), X, Y.ft);
  if (d.brand) { ctx.textAlign = 'right'; ctx.fillText('P&L Card', W - X, Y.ft); ctx.textAlign = 'left'; }
  }
  ctx.restore();
  if (R) { rrect(ctx, 1.5, 1.5, W - 3, H - 3, R - 1.5); ctx.strokeStyle = C.line; ctx.lineWidth = 3; ctx.stroke(); }
}

let shTok = 0;
const fontsReady = () => Promise.race([
  (document.fonts && document.fonts.load ? Promise.all([FONT_FACE[SET.font] ? document.fonts.load('40px "' + FONT_FACE[SET.font] + '"') : null, bcCard() ? document.fonts.load('600 40px "Inter"') : null]) : Promise.resolve()).catch(() => {}),
  new Promise(r => setTimeout(r, 700))
]);
async function refreshShare() {
  const tok = ++shTok, tradeMode = SH.kind === 'trade';
  $('shKinds').hidden = tradeMode;
  $('shKinds').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === SH.kind));
  $('shHide').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', (b.dataset.v === '1') === !!SET.hide));
  if (SET.cardStyle !== 'classic') SET.cardStyle = 'term';
  if (!CARD_SIZES[SET.cardRatio]) SET.cardRatio = '43';
  if (!CARD_RADII[SET.cardRound]) SET.cardRound = 's';
  [['shStyle', SET.cardStyle], ['shRatio', SET.cardRatio], ['shRound', SET.cardRound]].forEach(r => $(r[0]).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === r[1])));
  $('shNav').hidden = tradeMode || SH.kind === 'all';
  if (!$('shNav').hidden) $('shLabel').textContent = period().label;
  $('shTitle').textContent = tradeMode ? 'Share trade' : 'Share card';
  loadCard();
  const d = cardData(), none = !d || d.empty;
  $('shShare').disabled = none; $('shSave').disabled = none;
  $('shHint').textContent = none ? 'No trades in this period.' : (SET.hide && !(SET.balance > 0) ? 'Tip: add your account balance in Settings to show % results.' : '');
  SH.d = d;
  refreshVidUi();
  if (!d) return;
  drawCard($('shCanvas'), d);
  shAnim();
  if (FONT_FACE[SET.font] || bcCard()) {
    await fontsReady();
    if (tok !== shTok) return;
    drawCard($('shCanvas'), d);
  }
}
function shareStep(k) {
  if (SH.kind === 'day') {
    const days = [...new Set(visible().map(t => t.date))].sort();
    const nx = k < 0 ? days.filter(x => x < SH.ref).pop() : days.find(x => x > SH.ref);
    SH.ref = nx || addDays(SH.ref, k);
  } else if (SH.kind === 'week') SH.ref = addDays(SH.ref, 7 * k);
  else if (SH.kind === 'month') SH.ref = shiftMonth(SH.ref.slice(0, 7), k) + '-01';
  refreshShare();
}
function openShare(kind, tradeId) {
  const all = visible(), last = all.length ? all[all.length - 1].date : today();
  SH.kind = kind; SH.tradeId = tradeId || null;
  SH.ref = kind === 'month' && S.month ? S.month + '-01' : (S.tab === 'reports' && S.day ? S.day : last);
  const sh = $('shSheet'); sh.hidden = false; SH.open = true; document.documentElement.classList.add('modal');
  void sh.offsetWidth; requestAnimationFrame(() => sh.classList.add('open'));
  try { history.pushState({ share: 1 }, ''); } catch (e) {}
  refreshShare();
}
function hideShare() {
  if (!SH.open) return;
  SH.open = false; cancelAnimationFrame(SH.raf); SH.raf = 0; try { if (BG.cardVid) BG.cardVid.pause(); } catch (e) {}
  const sh = $('shSheet'); sh.classList.remove('open'); sh.hidden = true;
  if (!S.sheetOpen) { document.documentElement.classList.remove('modal'); requestAnimationFrame(movePill); }
}
function closeShare() {
  const was = SH.open; hideShare();
  try { if (was && history.state && history.state.share) { SH.skip++; setTimeout(() => { SH.skip = 0; }, 500); history.back(); } } catch (e) {}
}

const isNative = () => { const c = window.Capacitor; return !!(c && c.isNativePlatform && c.isNativePlatform() && c.Plugins); };
const cardName = () => 'pnl-card-' + (SH.kind === 'trade' ? 'trade' : SH.kind) + '-' + today() + '.png';
const cardB64 = () => $('shCanvas').toDataURL('image/png').split(',')[1];
const b64Blob = b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: 'image/png' }); };
const cardBlob = async () => {
  let b = null;
  try { b = await new Promise(res => { try { $('shCanvas').toBlob(res, 'image/png'); } catch (e) { res(null); } }); } catch (e) {}
  if (!b || !b.size) b = b64Blob(cardB64());
  return b;
};
const errCancel = e => !!(e && (e.name === 'AbortError' || /cancel|abort|dismiss/i.test(String(e.message || e))));

async function shareCard() { if (BG.cardVid) return videoOut('share'); return shareCardImg(); }
async function shareCardImg() {
  const name = cardName();
  if (isNative()) {
    const P = window.Capacitor.Plugins;
    if (P.Filesystem && P.Share) {
      try {
        await P.Filesystem.writeFile({ path: name, data: cardB64(), directory: 'CACHE' });
        const r = await P.Filesystem.getUri({ path: name, directory: 'CACHE' });
        await P.Share.share({ title: name, files: [r.uri], dialogTitle: 'Share P&L card' });
        return;
      } catch (e) { if (errCancel(e)) return; }
    }
  }
  try {
    const blob = await cardBlob(), file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (errCancel(e)) return; }
  await saveCard();
}

/* last resort that always works: show the picture so it can be pressed and held to save */
function showCardImage() {
  let url = ''; try { url = $('shCanvas').toDataURL('image/png'); } catch (e) {}
  if (!url) { toast('Could not save the image'); return; }
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px';
  const t = document.createElement('div'); t.textContent = 'Press and hold the image, then choose Save / Download. Tap outside to close.';
  t.style.cssText = 'color:#fff;font:14px/1.4 system-ui,sans-serif;text-align:center;max-width:420px';
  const im = document.createElement('img'); im.src = url; im.alt = 'P&L card';
  im.style.cssText = 'max-width:100%;max-height:72vh;border-radius:8px;-webkit-touch-callout:default;user-select:auto';
  ov.appendChild(t); ov.appendChild(im); ov.addEventListener('click', e => { if (e.target !== im) ov.remove(); });
  document.body.appendChild(ov);
}

let cardSaving = false;
async function saveCard() {
  if (cardSaving) return; cardSaving = true;
  try { await saveCardNow(); } finally { cardSaving = false; }
}
async function saveCardNow() {
  const name = cardName();
  if (isNative()) {
    const P = window.Capacitor.Plugins;
    if (P.Filesystem) {
      let data = null; try { data = cardB64(); } catch (e) {}
      if (data) {
        try { if (P.Filesystem.requestPermissions) await P.Filesystem.requestPermissions(); } catch (e) {}
        for (const dir of ['DOCUMENTS', 'DOCUMENTS', 'EXTERNAL']) {
          try { await P.Filesystem.writeFile({ path: 'PnLJournal/' + name, data, directory: dir, recursive: true }); toast('Saved to ' + (dir === 'EXTERNAL' ? 'PnLJournal folder' : 'Documents/PnLJournal')); return; } catch (e) {}
        }
        if (P.Share) {
          try {
            await P.Filesystem.writeFile({ path: name, data, directory: 'CACHE' });
            const r = await P.Filesystem.getUri({ path: name, directory: 'CACHE' });
            await P.Share.share({ title: name, files: [r.uri], dialogTitle: 'Save P&L card' });
            return;
          } catch (e) { if (errCancel(e)) return; }
        }
      }
    }
  }
  try {
    const blob = await cardBlob(), a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; a.rel = 'noopener'; a.style.display = 'none'; document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(u); }, 4000); toast('Image downloaded'); return;
  } catch (e) {}
  showCardImage();
}

const TH = { open: false, skip: 0 };
function themeLabel() {}
function hideTheme() {}
function closeTheme() {}

/* ---------- accounts (UI) ---------- */
const AS = { open: false, skip: 0 };
function acLabel() { $('acBtn').textContent = acCur().name + ' \u25BE'; }
const acCount = id => id === AC.active ? S.trades.length : (TS.cache.get(acKey(id)) || []).length;
function acRender() {
  $('acList').innerHTML = AC.list.map(a => { const n = acCount(a.id);
    return `<button type="button" class="acrow" data-acid="${a.id}" aria-pressed="${a.id === AC.active}"><span><span class="acn">${esc(a.name)}</span><span class="acs">${n} trade${n === 1 ? '' : 's'}</span></span>
    <svg class="ck" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>`; }).join('');
  $('acDel').hidden = AC.list.length < 2;
}
function acApplySet(a) {
  const st = a.set || {};
  SET.unit = st.unit || '$'; SET.goal = st.goal != null ? st.goal : null; SET.balance = st.balance != null ? st.balance : null; SET.maxLoss = st.maxLoss != null ? st.maxLoss : null; saveSet();
}
async function acEnter() {
  S.trades = await load(); S.symbol = 'ALL'; S.month = null; S.day = null; S.pending = null;
  const ib = $('importBox'); if (ib) ib.hidden = true;
  acLabel(); render();
}
async function acSwitch(id) {
  if (id === AC.active) { closeAc(); return; }
  await save();
  acCur().set = { unit: SET.unit, goal: SET.goal, balance: SET.balance, maxLoss: SET.maxLoss };
  AC.active = id; acApplySet(acCur()); saveAc();
  await acEnter(); closeAc(); toast(acCur().name);
}
async function acAdd() {
  const name = $('ac-name').value.trim().slice(0, 24);
  if (!name) { toast('Type a name first'); return; }
  if (AC.list.some(a => a.name.toLowerCase() === name.toLowerCase())) { toast('That name is already used'); return; }
  const id = 'a' + Date.now().toString(36);
  AC.list.push({ id, name }); saveAc(); $('ac-name').value = '';
  await acSwitch(id);
}
function acRename() {
  const name = $('ac-name').value.trim().slice(0, 24);
  if (!name) { toast('Type a new name first'); return; }
  if (AC.list.some(a => a.id !== AC.active && a.name.toLowerCase() === name.toLowerCase())) { toast('That name is already used'); return; }
  acCur().name = name; saveAc(); $('ac-name').value = ''; acLabel(); acRender(); toast('Renamed');
}
let acDelArmed = false;
async function acDelete() {
  const b = $('acDel');
  if (AC.list.length < 2) return;
  if (!acDelArmed) {
    acDelArmed = true; b.textContent = 'Tap again to delete ' + acCur().name + ' (' + S.trades.length + ')';
    setTimeout(() => { acDelArmed = false; b.textContent = 'Delete this account'; }, 4000); return;
  }
  acDelArmed = false; b.textContent = 'Delete this account';
  await tsDel(trKey());
  AC.list = AC.list.filter(a => a.id !== AC.active);
  AC.active = AC.list[0].id; acApplySet(acCur()); saveAc();
  await acEnter(); closeAc(); toast('Account deleted');
}
function openAc() {
  acRender(); $('ac-name').value = ''; acDelArmed = false; $('acDel').textContent = 'Delete this account';
  const sh = $('acSheet'); sh.hidden = false; AS.open = true; document.documentElement.classList.add('modal');
  void sh.offsetWidth; requestAnimationFrame(() => sh.classList.add('open'));
  try { history.pushState({ acct: 1 }, ''); } catch (e) {}
}
function hideAc() {
  if (!AS.open) return;
  AS.open = false; const sh = $('acSheet'); sh.classList.remove('open'); sh.hidden = true;
  if (!S.sheetOpen && !SH.open) { document.documentElement.classList.remove('modal'); requestAnimationFrame(movePill); }
}
function closeAc() {
  const was = AS.open; hideAc();
  try { if (was && history.state && history.state.acct) { AS.skip++; setTimeout(() => { AS.skip = 0; }, 500); history.back(); } } catch (e) {}
}

/* ---------- Dashboard tab ---------- */
const DRANGE = { '7': 7, '30': 30, '90': 90, all: 0 };
const DRLBL = { '7': 'last 7 days', '30': 'last 30 days', '90': 'last 90 days', all: 'all time' };
const DMASK = '\u2022\u2022\u2022\u2022\u2022';
const dmoney = n => MASK ? DMASK : money(n);
/* compact money for big numbers: full amount below 10,000, then 10k, 11.9k, 100k, 1m, 1.25m ... */
const cmoney = n => {
  if (n == null) return '\u2014';
  const a = Math.abs(n); if (a < 10000) return money(n);
  const tr = (v, d) => String(+v.toFixed(d));
  let t;
  if (a >= 1e9) t = tr(a / 1e9, 2) + 'b';
  else if (a >= 1e6) { t = tr(a / 1e6, 2) + 'm'; if (t === '1000m') t = '1b'; }
  else { t = tr(a / 1e3, 1) + 'k'; if (t === '1000k') t = '1m'; }
  return sgn(n) + '$' + t;
};
const dcm = n => MASK ? DMASK : cmoney(n);
const kfmt = n => { if (MASK) return DMASK; const a = Math.abs(n); return (n < 0 ? '−' : '') + '$' + (a >= 1000 ? (a / 1000).toFixed(1) + 'K' : Math.round(a)); };
const DS = { filter: 'all', q: '', show: 50, arm: null, t: 0, w: 0 };
const WK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const wkOf = k => (parseDay(k).getDay() + 6) % 7;

function dashTrades() {
  const all = visible(), n = DRANGE[SET.dashRange || '90'];
  const from = n ? addDays(today(), -(n - 1)) : '';
  return all.filter(t => !from || t.date >= from);
}

function dashLimit(D) {
  if (!(SET.maxLoss > 0)) return '';
  const tn = sum(D.filter(t => t.date === today()).map(t => t.pnl));
  const lossNow = Math.max(0, -tn), f = Math.min(1, lossNow / SET.maxLoss), hit = lossNow >= SET.maxLoss;
  const lim = '$' + SET.maxLoss.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const left = tn < 0
    ? `<b class="loss">${dmoney(tn)}</b><span>of ${lim} limit · ${hit ? 'limit reached' : Math.round(f * 100) + '%'}</span>`
    : `<b class="${cls(tn)}">${tn ? dmoney(tn) : '$0.00'}</b><span>today · limit ${lim}</span>`;
  const warn = !hit && f >= .75;
  return `<div class="goal${warn ? ' lwarn' : ''}"><div class="lbl">Daily loss limit</div><div class="gtop">${left}</div>
    <div class="gbar${hit ? ' bad' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(f * 100)}"><i style="width:${(f * 100).toFixed(1)}%"></i></div></div>`;
}

function dashInsights(D) {
  const grp = fn => { const m = {}; D.forEach(t => { const k = fn(t); if (k) (m[k] = m[k] || []).push(t); }); return Object.keys(m).map(k => ({ k, net: sum(m[k].map(t => t.pnl)), n: m[k].length })); };
  const best = a => a.slice().sort((x, y) => y.net - x.net)[0];
  const ses = grp(t => t.session), sym = grp(t => t.symbol);
  let head = '';
  const pick = (a, what) => {
    const b = best(a);
    return b.net > 0
      ? `Your strongest ${what} is <b>${esc(b.k)}</b> at <span class="${cls(b.net)}">${dmoney(b.net)}</span>.`
      : `No ${what} is in profit yet. <b>${esc(b.k)}</b> is closest at <span class="${cls(b.net)}">${dmoney(b.net)}</span>.`;
  };
  if (ses.length) head = pick(ses, 'session'); else if (sym.length) head = pick(sym, 'symbol');
  const rows = [];
  const wk = WK.map(() => 0), wkN = WK.map(() => 0);
  D.forEach(t => { const i = wkOf(t.date); wk[i] += t.pnl; wkN[i]++; });
  const idx = wk.map((v, i) => i).filter(i => wkN[i]);
  if (idx.length > 1) {
    const lo = idx.reduce((a, b) => wk[a] <= wk[b] ? a : b), hi = idx.reduce((a, b) => wk[a] >= wk[b] ? a : b);
    if (wk[hi] > 0) rows.push(['Best day', `${WK[hi]} · ${dmoney(wk[hi])}`, 'win']);
    if (wk[lo] < 0) rows.push(['Weakest day', `${WK[lo]} · ${dmoney(wk[lo])}`, 'loss']);
  }
  const sideWr = s => { const x = D.filter(t => (t.side === 'Sell' ? 'Sell' : 'Buy') === s && t.pnl !== 0); return x.length ? Math.round(x.filter(t => t.pnl > 0).length / x.length * 100) : null; };
  const lw = sideWr('Buy'), sw = sideWr('Sell');
  if (lw != null && sw != null) rows.push(['Win rate by side', `Long ${lw}% · Short ${sw}%`, '']);
  if (ses.length && sym.length > 1) { const b = best(sym); rows.push(['Best symbol', `${esc(b.k)} · ${dmoney(b.net)}`, cls(b.net)]); }
  if (SET.maxLoss > 0) {
    const dn = {}; D.forEach(t => { dn[t.date] = (dn[t.date] || 0) + t.pnl; });
    const hits = Object.keys(dn).filter(k => dn[k] <= -SET.maxLoss).length;
    rows.push(['Daily loss limit', hits ? `Hit on ${hits} day${hits === 1 ? '' : 's'}` : 'Never hit', hits ? 'loss' : 'win']);
  }
  let run = 0, sign = 0;
  for (let i = D.length - 1; i >= 0; i--) { const s = Math.sign(D[i].pnl); if (!s) break; if (!sign) sign = s; if (s !== sign) break; run++; }
  if (run > 1) rows.push(['Current streak', `${run} ${sign > 0 ? 'wins' : 'losses'}`, sign > 0 ? 'win' : 'loss']);
  return `<h2>Insights</h2><div class="dins">${head ? `<p class="dh">${head}</p>` : ''}${rows.map(r => `<div class="dil"><span>${r[0]}</span><span class="${r[2]}">${r[1]}</span></div>`).join('')}</div>`;
}

function dashRing(D) {
  const W = D.filter(t => t.pnl > 0).length, L = D.filter(t => t.pnl < 0).length, N = 60, dec = W + L;
  const G = dec ? Math.round(W / dec * N) : 0;
  let s = '';
  for (let i = 0; i < N; i++) {
    const r = Math.abs((Math.sin(i * 12.9898 + 4.1) * 43758.5453) % 1), len = 11 + r * 17, phi = (90 - i * 360 / N) * Math.PI / 180;
    const R = 126, c = 134, x2 = c + R * Math.cos(phi), y2 = c + R * Math.sin(phi), x1 = c + (R - len) * Math.cos(phi), y1 = c + (R - len) * Math.sin(phi);
    s += `<line class="${!dec ? 'tn' : i < G ? 'tw' : 'tl'}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return `<h2>Win / loss</h2><div class="dring"><svg viewBox="0 0 268 268" aria-hidden="true">${s}</svg>
    <div class="c"><div class="big">${D.length}</div><div class="sub">trades · ${W}W ${L}L</div></div></div>`;
}

function dashRow(D) {
  const W = D.filter(t => t.pnl > 0).length, L = D.filter(t => t.pnl < 0).length, dec = W + L, pct = dec ? W / dec : 0;
  const arc = 'M12 54A43 43 0 0 1 98 54';
  const g = `<svg viewBox="0 0 110 64" role="img" aria-label="Win rate ${dec ? Math.round(pct * 100) + '%' : 'not available'}"><path class="gb${dec ? '' : ' gn'}" d="${arc}"/>${W > 0 ? `<path class="gw" d="${arc}" pathLength="100" stroke-dasharray="${(pct * 100).toFixed(2)} 100"/>` : ''}<text x="55" y="50">${dec ? Math.round(pct * 100) + '%' : '\u2014'}</text></svg>`;
  const rc = D.slice(-5), n = rc.length, mx = Math.max(1, ...rc.map(t => Math.abs(t.pnl)));
  const bars = rc.map((t, i) => {
    const h = t.pnl === 0 ? 2 : Math.max(3, Math.abs(t.pnl) / mx * 26), x = 8 + (5 - n) * 10 + i * 20;
    return `<rect class="${t.pnl > 0 ? 'bw' : t.pnl < 0 ? 'bl' : 'bz'}" x="${x}" y="${t.pnl < 0 ? 32 : 32 - h}" width="9" height="${h.toFixed(1)}" rx="2"/>`;
  }).join('');
  const r = `<svg viewBox="0 0 110 64" role="img" aria-label="Last ${n} trades"><line class="zl" x1="4" y1="32" x2="106" y2="32"/>${bars}</svg>`;
  const wk = WK.map(() => 0); D.forEach(t => { wk[wkOf(t.date)] += t.pnl; });
  const lo = Math.min(0, ...wk), hi = Math.max(0, ...wk), sp = (hi - lo) || 1;
  const pts = wk.map((v, i) => [10 + i * 15, 56 - (v - lo) / sp * 46]);
  const w = `<svg viewBox="0 0 110 64" role="img" aria-label="Result by weekday"><polyline class="ln" points="${pts.map(q => q[0] + ',' + q[1].toFixed(1)).join(' ')}"/>${pts.map((q, i) => `<circle class="${wk[i] < 0 ? 'dl' : wk[i] > 0 ? 'dw' : 'dz'}" cx="${q[0]}" cy="${q[1].toFixed(1)}" r="3"/>`).join('')}</svg>`;
  return `<div class="drow3"><div>${g}<div class="l3">Win/loss</div></div><div>${r}<div class="l3">Recent</div></div><div>${w}<div class="l3">Weekday</div></div></div>`;
}

function dashWave(D) {
  const last = D.slice(-50), n = last.length, mx = Math.max(1, ...last.map(t => Math.abs(t.pnl)));
  const bw = 100 / n;
  const bars = last.map((t, i) => {
    const h = t.pnl === 0 ? 3 : 8 + 92 * Math.abs(t.pnl) / mx;
    return `<rect class="${t.pnl > 0 ? 'w' : t.pnl < 0 ? 'l' : 'z'}" x="${(i * bw + (bw - Math.min(bw * .5, 1.4)) / 2).toFixed(2)}" y="${((100 - h) / 2).toFixed(2)}" width="${Math.min(bw * .5, 1.4).toFixed(2)}" height="${h.toFixed(2)}"/>`;
  }).join('');
  return `<h2>Recent trades</h2><div class="dwave"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Last ${n} trades">${bars}</svg></div>
    <div class="dcap">Last ${n} trade${n === 1 ? '' : 's'} · bar height = size</div>`;
}

function dashWeekday(D) {
  const wk = WK.map(() => 0); D.forEach(t => { wk[wkOf(t.date)] += t.pnl; });
  const mx = Math.max(1, ...wk.map(Math.abs)), LET = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return `<h2>By weekday</h2><div class="dwk">${wk.map((v, i) => {
    const h = v ? Math.max(2, Math.abs(v) / mx * (v > 0 ? 28 : 16)) : 0;
    return `<div class="col" title="${WK[i]} ${MASK ? '' : money(v)}"><div class="up">${v > 0 ? `<i class="bar w" style="height:${h.toFixed(1)}px"></i>` : ''}</div>
      <div class="dn">${v < 0 ? `<i class="bar l" style="height:${h.toFixed(1)}px"></i>` : ''}</div><span class="dlt">${LET[i]}</span><span class="dv">${v ? (v > 0 && !MASK ? '+' : '') + kfmt(v) : '—'}</span></div>`;
  }).join('')}</div>`;
}

function dashBars(title, items, icon) {
  if (!items.length) return '';
  const mx = Math.max(1, ...items.map(x => Math.abs(x.net)));
  return `<h2>${title}</h2>` + items.map(x => `<div class="brow"><div class="bt"><span class="bs">${icon ? symIcon(x.k) : ''}<span>${esc(x.k)}</span></span><span class="bv ${cls(x.net)}">${dmoney(x.net)}</span></div>
    <div class="bbar${x.net < 0 ? ' l' : ''}"><i style="width:${Math.max(2, Math.abs(x.net) / mx * 100).toFixed(1)}%"></i></div></div>`).join('');
}

function dashSymRows(D) {
  const m = {}; D.forEach(t => (m[t.symbol] = m[t.symbol] || []).push(t));
  const rows = Object.keys(m).map(s => ({ s, x: stats(m[s]) })).sort((a, b) => b.x.net - a.x.net).map(({ s, x }) =>
    `<div class="srow" style="cursor:default"><span class="s">${symIcon(s)}<span>${esc(s)}</span></span><span class="n">${x.n} · ${x.winRate == null ? '—' : Math.round(x.winRate * 100) + '%'} won</span><span class="v ${cls(x.net)}">${dmoney(x.net)}</span></div>`).join('');
  return rows ? `<h2>By symbol</h2>${rows}` : '';
}

function dashActivity() {
  const M = [0, 1, 2, 3].map(() => Array(7).fill(0)), t0 = parseDay(today());
  visible().forEach(t => { const g = Math.round((t0 - parseDay(t.date)) / 864e5); if (g >= 0 && g < 28) M[3 - (g / 7 | 0)][wkOf(t.date)]++; });
  const dots = M.map(r => r.map(c => { const z = c ? 6 + Math.min(c, 4) * 5 : 3; return `<b><i style="width:${z}px;height:${z}px;opacity:${c ? 1 : .3}"></i></b>`; }).join('')).join('');
  return `<h2>Activity</h2><div class="dact">${dots}</div><div class="dact lab">${['M','T','W','T','F','S','S'].map(l => `<span>${l}</span>`).join('')}</div><div class="dcap">Trades per day, last 4 weeks</div>`;
}

function dashMonths() {
  const m = {}; visible().forEach(t => (m[t.date.slice(0, 7)] = m[t.date.slice(0, 7)] || []).push(t));
  const ks = Object.keys(m).sort().reverse().slice(0, 12); if (!ks.length) return '';
  return `<h2>By month</h2><div class="dins">${ks.map(k => { const n = sum(m[k].map(t => t.pnl)); return `<div class="dil"><span>${monthLabel(k)} · ${m[k].length}</span><span class="${cls(n)}">${dmoney(n)}</span></div>`; }).join('')}</div>`;
}

function renderDashMain() {
  const D = dashTrades(), el = $('dmain'), rng = DRLBL[SET.dashRange || '90'];
  if (!D.length) {
    el.innerHTML = '<div class="dsec dt-overview dt-charts dt-breakdown dt-trades">' + (S.trades.length
      ? `<p class="empty">No trades in this period.</p>`
      : `<p class="empty">Your dashboard fills in as you add trades. Tap + to add your first one, or <button class="link" data-act="sample">load sample trades</button> to see how it looks.</p>`) + '</div>';
    return;
  }
  const st = stats(D);
  const card = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd><span class="dsub">${rng}</span></div>`;
  const ses = SESS.map(n => ({ k: n, net: sum(D.filter(t => t.session === n).map(t => t.pnl)), has: D.some(t => t.session === n) })).filter(x => x.has);
  el.innerHTML = `<div class="dsec dt-overview"><dl class="kv">${card('Win rate', st.winRate == null ? '—' : Math.round(st.winRate * 100) + '%')}${card('Profit factor', pfTxt(st))}</dl>
    ${dashLimit(D)}${dashInsights(D)}</div>
    <div class="dsec dt-charts">${dashRing(D)}${dashRow(D)}${dashWave(D)}${dashWeekday(D)}${dashActivity()}</div>
    <div class="dsec dt-breakdown">${dashSymRows(D)}${dashBars('By session', ses, false)}${dashMonths()}</div>`;
}

/* ---------- Net P&L chart: three views to swipe between (steps, neon laser, equity + drawdown) ---------- */
const CV = { i: 0, hide: null, bound: false, played: false };
try { CV.i = Math.max(0, Math.min(2, parseInt(localStorage.getItem('pnl-chart-view'), 10) || 0)); } catch (e) {}
function monoPath(xs, ys) {
  const n = xs.length - 1; if (n < 1) return `M${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  const dx = [], dd = [], m = new Array(n + 1);
  for (let i = 0; i < n; i++) { dx[i] = xs[i + 1] - xs[i]; dd[i] = (ys[i + 1] - ys[i]) / dx[i]; }
  m[0] = dd[0]; m[n] = dd[n - 1];
  for (let i = 1; i < n; i++) m[i] = dd[i - 1] * dd[i] <= 0 ? 0 : (dd[i - 1] + dd[i]) / 2;
  for (let i = 0; i < n; i++) {
    if (dd[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / dd[i], b = m[i + 1] / dd[i], q = a * a + b * b;
    if (q > 9) { const t = 3 / Math.sqrt(q); m[i] = t * a * dd[i]; m[i + 1] = t * b * dd[i]; }
  }
  let d = `M${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 0; i < n; i++) { const h = dx[i] / 3; d += ` C${(xs[i] + h).toFixed(1)} ${(ys[i] + m[i] * h).toFixed(1)} ${(xs[i + 1] - h).toFixed(1)} ${(ys[i + 1] - m[i + 1] * h).toFixed(1)} ${xs[i + 1].toFixed(1)} ${ys[i + 1].toFixed(1)}`; }
  return d;
}
/* tooltip + cursor for one chart view; a tap (or mouse hover) shows it, swiping sideways hides it */
function chartScrub(pane, o) {
  const tip = document.createElement('div'); tip.className = 'dtip'; tip.hidden = true;
  const dp = document.createElement('div'); dp.className = 'ddate'; dp.hidden = true;
  pane.appendChild(tip); pane.appendChild(dp);
  const g = pane.querySelector('.cg'), ln = g.querySelector('line'), dot = g.querySelector('circle');
  function at(cx) {
    const r = pane.getBoundingClientRect(), W = o.W;
    let i = Math.round(((cx - r.left) - o.L) / (W - o.L - o.R) * o.n); i = Math.max(0, Math.min(o.n, i));
    const px = o.x(i), py = o.y(o.cum[i]), date = i === 0 ? 'Start' : shortDay(o.D[i - 1].date);
    g.setAttribute('visibility', 'visible');
    ln.setAttribute('x1', px); ln.setAttribute('x2', px); dot.setAttribute('cx', px); dot.setAttribute('cy', py);
    tip.innerHTML = `${date} · <span class="${cls(o.cum[i])}">${dmoney(o.cum[i])}</span>`; tip.hidden = false;
    tip.style.left = Math.max(0, Math.min(W - tip.offsetWidth, px - tip.offsetWidth / 2)) + 'px';
    dp.textContent = date; dp.hidden = false;
    dp.style.left = Math.max(dp.offsetWidth / 2, Math.min(W - dp.offsetWidth / 2, px)) + 'px'; dp.style.top = (o.H - 14) + 'px';
    dp.style.transform = 'translateX(-50%)';
  }
  const hide = () => { g.setAttribute('visibility', 'hidden'); tip.hidden = true; dp.hidden = true; };
  pane.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') at(e.clientX); });
  pane.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
  pane.addEventListener('pointercancel', hide);
  pane.addEventListener('click', e => at(e.clientX));
  return hide;
}

function bucketTrades(D) {
  if (!D.length) return D;
  const span = (parseDay(D[D.length - 1].date) - parseDay(D[0].date)) / 864e5 + 1;
  const key = d => span <= 150 ? d : span <= 700 ? weekStart(d) : d.slice(0, 7) + '-01';
  const m = {}, order = [];
  D.forEach(t => { const k = key(t.date); if (!(k in m)) { m[k] = 0; order.push(k); } m[k] += t.pnl; });
  const out = order.map(k => ({ date: k, pnl: m[k] }));
  out[out.length - 1].date = D[D.length - 1].date;
  return out;
}
function dashChart(D, elId, p) {
  elId = elId || 'dchart'; p = p || 'd';
  D = bucketTrades(D);
  const el = $(elId); if (!el || !D.length) return;
  const cum = [0]; D.forEach(t => cum.push(cum[cum.length - 1] + t.pnl));
  const n = cum.length - 1, lo = Math.min(0, ...cum), hi = Math.max(0, ...cum), span = (hi - lo) || 1;
  const W = Math.max(240, Math.floor(el.clientWidth) || 340), H = 212, L = 6, R = 10, T = 14, base = 176;
  const x = i => L + (W - L - R) * (n ? i / n : 0);
  const y = v => T + (base - T) * (1 - (v - lo) / span);
  const xs = cum.map((v, i) => x(i)), ys = cum.map(v => y(v));
  const tone = v => v >= 0 ? 'var(--win)' : 'var(--loss)';
  const TC = cum[n] >= 0 ? 'var(--win-rgb)' : 'var(--loss-rgb)';   /* chart lines: green when up overall, red when down */
  const F = v => v.toFixed(1);
  const dates = `<text x="${L}" y="${H - 3}" style="font-size:9px">${shortDay(D[0].date)}</text><text x="${W - R}" y="${H - 3}" text-anchor="end" style="font-size:9px">${shortDay(D[D.length - 1].date)}</text>`;
  const cursor = bot => `<g class="cg" visibility="hidden"><line class="dcur" y1="${T - 8}" y2="${bot}"/><circle r="4.5" fill="var(--bg)" stroke="var(--ink)" stroke-width="2"/></g>`;
  const svg = (inner, label) => `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${inner}</svg>`;
  const ticks = hi === lo ? [hi] : [hi, (hi + lo) / 2, lo];
  const ticksTwo = hi === lo ? [hi] : [hi, lo];
  const gridOf = (tk, yf, under) => tk.map(v => `<line class="gl" x1="${L}" x2="${W - R}" y1="${F(yf(v))}" y2="${F(yf(v))}" stroke-dasharray="${v === lo ? '0' : '2 4'}"/><text x="${L}" y="${F(yf(v) + (under && v === lo && hi !== lo ? 11 : -3))}" style="font-size:9px">${kfmt(v)}</text>`).join('');
  const zeroOf = yf => lo < 0 && hi > 0 ? `<line class="zl" x1="${L}" x2="${W - R}" y1="${F(yf(0))}" y2="${F(yf(0))}"/>` : '';
  /* faint dot texture: over the plot, a little stronger under the line */
  const dotDefs = (k, area) => `<pattern id="${p}d${k}" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r=".8" style="fill:var(--ink);opacity:.07"/></pattern><pattern id="${p}e${k}" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r="1" style="fill:rgb(${TC});opacity:.2"/></pattern><clipPath id="${p}c${k}"><path d="${area}"/></clipPath>`;
  const vigDef = k => `<radialGradient id="${p}r${k}" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="${p}m${k}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#${p}r${k})"/></mask>`;
  const vig = (k, inner) => `<g mask="url(#${p}m${k})">${inner}</g>`;
  const dotBg = (k, bot) => `<rect x="${L}" y="${T}" width="${W - L - R}" height="${bot - T}" fill="url(#${p}d${k})"/>`;
  const dotFill = (k, bot) => `<rect x="${L}" y="${T}" width="${W - L - R}" height="${bot - T}" fill="url(#${p}e${k})" clip-path="url(#${p}c${k})"/>`;
  const endDot = (cx, cy) => `<circle cx="${F(cx)}" cy="${F(cy)}" r="10" fill="rgb(${TC})" fill-opacity=".2"/><circle cx="${F(cx)}" cy="${F(cy)}" r="4.5" style="fill:var(--win)"/>`;

  /* soft right-edge fade so area fills never end in a hard vertical cut */
  const fadeDef = (k, xe) => `<linearGradient id="${p}qg${k}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="${Math.max(.2, (xe - W * .3) / W).toFixed(3)}" stop-color="#fff" stop-opacity=".85"/><stop offset="${Math.min(1, (xe + 2) / W).toFixed(3)}" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="${p}q${k}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#${p}qg${k})"/></mask>`;

  /* 1 · steps with a dot per trade */
  const chips = n <= 10 && !MASK, dots = n <= 31;
  let st = `M${F(xs[0])} ${F(ys[0])}`;
  for (let i = 1; i <= n; i++) st += ` H${F(xs[i])} V${F(ys[i])}`;
  let marks = '', row = '';
  if (dots) for (let i = 1; i <= n; i++) { const last = i === n, c = tone(D[i - 1].pnl); marks += `<circle class="npop" cx="${F(xs[i])}" cy="${F(ys[i])}" r="${last ? 5 : 4}" style="fill:${last ? c : 'var(--bg)'};stroke:${c};stroke-width:2;animation-delay:${(.15 + 1.1 * i / n).toFixed(2)}s"/>`; }
  const sg = v => (v < 0 ? '−' : '+') + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(1) + 'k' : Math.round(Math.abs(v)));
  if (chips) for (let i = 1; i <= n; i++) row += `<text x="${F(xs[i])}" y="${base + 13}" text-anchor="${i === n ? 'end' : 'middle'}" style="font-size:9px;fill:${tone(D[i - 1].pnl)}">${sg(D[i - 1].pnl)}</text>`;
  const area1 = `${st} L${F(xs[n])} ${base} L${F(xs[0])} ${base} Z`;
  /* 1 · equity bars: one bar per trade (running total), older bars fade, tag on the latest */
  const bTB = 38, byb = v => bTB + (base - bTB) * (1 - (v - lo) / span);
  const bsw = (W - L - R) / Math.max(1, n), bbw = Math.max(1.2, Math.min(bsw * .74, 16));
  const bxb = i => i === 0 ? L : L + (i - .5) * bsw;
  let barsSvg = '', brow = '';
  for (let i = 1; i <= n; i++) {
    const ya = byb(0), yv = byb(cum[i]), op = i === n ? 1 : (.3 + .55 * i / n).toFixed(2);
    barsSvg += `<rect x="${F(bxb(i) - bbw / 2)}" y="${F(Math.min(ya, yv))}" width="${F(bbw)}" height="${F(Math.max(1, Math.abs(ya - yv)))}" rx="${F(Math.min(1.5, bbw / 2))}" style="fill:${tone(cum[i])}" fill-opacity="${op}"/>`;
    if (chips) brow += `<text x="${F(bxb(i))}" y="${base + 13}" text-anchor="middle" style="font-size:9px;fill:${tone(D[i - 1].pnl)}">${sg(D[i - 1].pnl)}</text>`;
  }
  const bTxt = MASK ? '' : dmoney(cum[n]), bLw = Math.max(54, bTxt.length * 7 + 18), bYl = byb(cum[n]);
  const bLy = Math.max(2, Math.min(H - 26, cum[n] >= 0 ? bYl - 26 : bYl + 6)), bLx = W - R - bLw;
  const bPill = bTxt ? `<rect x="${F(bLx)}" y="${F(bLy)}" width="${bLw}" height="20" rx="10" style="fill:${tone(cum[n])}"/><text x="${F(bLx + bLw / 2)}" y="${F(bLy + 14)}" text-anchor="middle" style="fill:#04140F;font-size:11px;font-weight:600">${bTxt}</text>` : '';
  const v1 = svg(`<g class="nlf">${gridOf(ticks, byb)}${zeroOf(byb)}${barsSvg}${bPill}${brow}</g>${dates}${cursor(base)}`, `Net P&amp;L bars over ${D.length} trades`);

  /* 2 · neon laser: glowing line, a drop-line for every trade, pulsing end point with the total */
  const L2 = 8, R2 = 14, T2 = 18;   /* same size as the other views; just enough room for the end dot and its ring */
  const x2 = i => L2 + (W - L2 - R2) * (n ? i / n : 0), y2 = v => T2 + (base - T2) * (1 - (v - lo) / span);
  const xs2 = cum.map((v, i) => x2(i)), ys2 = cum.map(v => y2(v));
  const sm = monoPath(xs2, ys2);
  const lite = document.documentElement.classList.contains('lite');
  const area2 = `${sm} L${F(xs2[n])} ${base} L${F(xs2[0])} ${base} Z`;
  const core = `color-mix(in srgb, rgb(${TC}) 80%, #fff)`;
  let grid2 = '', drops = '';
  for (let i = 0; i <= 8; i++) { const gy = F(T2 + i * (base - T2) / 8); grid2 += `<line x1="0" x2="${W}" y1="${gy}" y2="${gy}" style="stroke:rgb(${TC});stroke-opacity:.07"/>`; }
  if (n <= 31) for (let i = 1; i <= n; i++) drops += `<line x1="${F(xs2[i])}" x2="${F(xs2[i])}" y1="${F(ys2[i])}" y2="${base}" style="stroke:url(#${p}nd);stroke-width:1"/><circle cx="${F(xs2[i])}" cy="${F(ys2[i])}" r="2.4" fill="#fff" style="fill:${core}"/>`;
  const nx = xs2[n], ny = ys2[n], ltxt = MASK ? '' : dmoney(cum[n]), lw = Math.max(60, ltxt.length * 7 + 24);
  const above = n > 0 && ys2[n] < ys2[n - 1] && ny >= 32, ly = above ? ny - 28 : Math.min(ny + 4, base - 22), lx = Math.max(L2, nx - lw - 16);
  const lc = cum[n] >= 0 ? 'var(--win)' : 'var(--loss)';
  const pill = ltxt ? `<rect x="${F(lx)}" y="${F(ly)}" width="${lw}" height="20" rx="10" style="fill:var(--bg);stroke:${lc};stroke-width:1"/><text x="${F(lx + lw / 2)}" y="${F(ly + 14)}" text-anchor="middle" style="fill:${lc};font-size:11px">${ltxt}</text>` : '';
  const dc = ' class="nld"', fc = ' class="nlf"';
  const pulse = (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ? '' : `<circle cx="${F(nx)}" cy="${F(ny)}" r="5" fill="none" style="stroke:rgb(${TC});stroke-width:1.2"><animate attributeName="r" from="5" to="12" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" from=".9" to="0" dur="1.8s" repeatCount="indefinite"/></circle>`;
  const v2 = svg(`<defs>${dotDefs(2, area2)}${vigDef(2)}<linearGradient id="${p}na" gradientUnits="userSpaceOnUse" x1="0" y1="${T2}" x2="0" y2="${base}"><stop offset="0" style="stop-color:rgb(${TC});stop-opacity:.26"/><stop offset="1" style="stop-color:rgb(${TC});stop-opacity:0"/></linearGradient>
    <linearGradient id="${p}nd" gradientUnits="userSpaceOnUse" x1="0" y1="${T2}" x2="0" y2="${base}"><stop offset="0" style="stop-color:rgb(${TC});stop-opacity:.6"/><stop offset="1" style="stop-color:rgb(${TC});stop-opacity:0"/></linearGradient>
    <linearGradient id="${p}nh" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".1" stop-color="#fff"/><stop offset=".9" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="${p}nj" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".08" stop-color="#fff"/><stop offset="${Math.max(.2, (x2(n) - W * .3) / W).toFixed(3)}" stop-color="#fff" stop-opacity=".85"/><stop offset="${Math.min(1, (x2(n) + 2) / W).toFixed(3)}" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="${p}ng" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#${p}nh)"/></mask>
    <mask id="${p}na2" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#${p}nj)"/></mask>
    <filter id="${p}b6" filterUnits="userSpaceOnUse" x="-20" y="-20" width="${W + 40}" height="${H + 40}"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="${p}b2" filterUnits="userSpaceOnUse" x="-20" y="-20" width="${W + 40}" height="${H + 40}"><feGaussianBlur stdDeviation="2"/></filter></defs>
    <g${fc}>${vig(2, dotBg(2, base))}<g mask="url(#${p}ng)">${grid2}</g><g mask="url(#${p}na2)"><path d="${area2}" style="fill:url(#${p}na)"/>${drops}</g>${vig(2, dotFill(2, base))}</g>
    <path d="${sm}" pathLength="1" class="dl nld" style="stroke:rgb(${TC});stroke-width:2"/>
    <g${fc}>${pulse}<circle cx="${F(nx)}" cy="${F(ny)}" r="5" style="fill:rgb(${TC})"/><circle cx="${F(nx)}" cy="${F(ny)}" r="2" fill="#fff" style="fill:${core}"/></g>${dates}${cursor(base + 14)}`, `Net P&amp;L neon curve over ${D.length} trades`);

  /* 3 · equity line above, drawdown strip below */
  const eb = 116, zt = 142, zh = 38, ey = v => T + (eb - T) * (1 - (v - lo) / span);
  const dd = []; let pk = 0; cum.forEach(v => { pk = Math.max(pk, v); dd.push(v - pk); });
  const mdd = Math.min(...dd), im = dd.indexOf(mdd);
  const dy = v => mdd < 0 ? zt + zh * (v / mdd) : zt;
  const eqP = xs.map((v, i) => (i ? 'L' : 'M') + F(v) + ' ' + F(ey(cum[i]))).join(' '), ddP = xs.map((v, i) => (i ? 'L' : 'M') + F(v) + ' ' + F(dy(dd[i]))).join(' ');
  const ddLbl = mdd < 0 ? `<circle cx="${F(xs[im])}" cy="${F(dy(mdd))}" r="3" style="fill:var(--loss);stroke:none"/><text x="${F(xs[im] + (im > n * .6 ? -8 : 8))}" y="${F(dy(mdd) + 3)}" text-anchor="${im > n * .6 ? 'end' : 'start'}" style="font-size:9px;fill:var(--loss)">${dmoney(mdd)}</text>` : `<text x="${W - R}" y="${zt + 14}" text-anchor="end" style="font-size:9px">No drawdown</text>`;
  const area3 = `${eqP} L${F(xs[n])} ${eb} L${F(xs[0])} ${eb} Z`;
  const v3 = svg(`<defs><linearGradient id="${p}f3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:rgb(${TC});stop-opacity:.16"/><stop offset="1" style="stop-color:rgb(${TC});stop-opacity:0"/></linearGradient>
    <linearGradient id="${p}f4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--loss);stop-opacity:.05"/><stop offset="1" style="stop-color:var(--loss);stop-opacity:.38"/></linearGradient>${dotDefs(3, area3)}${vigDef(3)}${fadeDef(3, xs[n])}</defs>
    ${vig(3, `${dotBg(3, eb)}${gridOf(ticksTwo, ey, true)}${zeroOf(ey)}<g mask="url(#${p}q3)"><path d="${area3}" fill="url(#${p}f3)"/>${dotFill(3, eb)}</g>`)}
    <path class="dl nld" pathLength="1" d="${eqP}" style="stroke:rgb(${TC});stroke-width:2"/>
    <text x="${L}" y="${zt - 5}" style="font-size:9px;font-style:italic">Drawdown</text><line class="gl" x1="${L}" x2="${W - R}" y1="${zt}" y2="${zt}"/>
    <g class="nlf"><path d="${ddP} L${F(xs[n])} ${zt} L${F(xs[0])} ${zt} Z" fill="url(#${p}f4)" mask="url(#${p}q3)"/>
    <path class="dl" d="${ddP}" style="stroke:var(--loss);stroke-width:1.5"/>${ddLbl}</g>${dates}
    <g class="cg" visibility="hidden"><line class="dcur" y1="${T - 8}" y2="${zt + zh}"/><circle r="4.5" fill="var(--bg)" stroke="var(--ink)" stroke-width="2"/></g>`, `Net P&amp;L and drawdown over ${D.length} trades`);

  const views = [[v1, 'Equity bars', byb, { x: bxb, L: L - bsw / 2, R: R + bsw / 2 }], [v2, 'Neon laser', y2, { x: x2, L: L2, R: R2 }], [v3, 'Equity and drawdown', ey]];
  el.innerHTML = `<div class="cview" role="group" aria-label="Net P&amp;L chart, swipe sideways for other views">${views.map(v => `<div class="cpane">${v[0]}</div>`).join('')}</div>
    <div class="cdots">${views.map((v, k) => `<button type="button" aria-label="${v[1]} chart" aria-current="${k === CV.i}"></button>`).join('')}</div>`;
  /* intro animation: each view plays once when it is first seen (after the splash), then stays still */
  const panes = [...el.querySelectorAll('.cpane')];
  const motion = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (!CV.seen) CV.seen = [];
  const play = k => { const pn = panes[k]; if (!pn || !pn.isConnected || !pn.classList.contains('pre')) return; CV.seen[k] = true; pn.classList.remove('pre'); pn.classList.add('go'); setTimeout(() => pn.classList.remove('go'), 2800); };
  if (motion) panes.forEach((pn, k) => { if (!CV.seen[k]) pn.classList.add('pre'); });
  const gate = fn => { const up = () => { const sp = document.getElementById('splash'); return !sp || sp.classList.contains('out'); }; if (up()) { requestAnimationFrame(fn); return; } const t = setInterval(() => { if (up()) { clearInterval(t); requestAnimationFrame(fn); } }, 100); setTimeout(() => clearInterval(t), 8000); };
  gate(() => play(CV.i));
  const view = el.querySelector('.cview'), btns = [...el.querySelectorAll('.cdots button')];
  const hides = [...el.querySelectorAll('.cpane')].map((pane, k) => chartScrub(pane, Object.assign({ W, H, L, R, n, x, y: views[k][2], cum, D }, views[k][3] || {})));
  const hideAll = () => hides.forEach(h => h());
  CV.hide = hideAll;
  if (!CV.bound) { CV.bound = true; document.addEventListener('pointerdown', e => { if (CV.hide && !(e.target.closest && e.target.closest('.dchart'))) CV.hide(); }); }
  const mark = i => btns.forEach((b, k) => b.setAttribute('aria-current', k === i));
  view.scrollLeft = CV.i * view.clientWidth; mark(CV.i);
  let raf = 0;
  view.addEventListener('scroll', () => {
    hideAll(); cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const i = Math.max(0, Math.min(2, Math.round(view.scrollLeft / (view.clientWidth || 1))));
      if (i !== CV.i) { CV.i = i; try { localStorage.setItem('pnl-chart-view', String(i)); } catch (e) {} }
      mark(i); play(i);
    });
  }, { passive: true });
  btns.forEach((b, k) => b.addEventListener('click', () => view.scrollTo({ left: k * view.clientWidth, behavior: 'smooth' })));
}

function dashRows() {
  let list = dashTrades();
  if (DS.filter === 'win') list = list.filter(t => t.pnl > 0); else if (DS.filter === 'loss') list = list.filter(t => t.pnl < 0);
  const q = DS.q.trim().toLowerCase();
  if (q) list = list.filter(t => t.symbol.toLowerCase().includes(q) || String(t.note || '').toLowerCase().includes(q));
  return list.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}
function renderDashList() {
  const el = $('dlist'); if (!el) return;
  const rows = dashRows(), part = rows.slice(0, DS.show);
  el.innerHTML = rows.length ? part.map(t => {
    return `<div class="dtr" data-act="edit" data-id="${t.id}" role="button" tabindex="0">
      <span class="dd">${shortDay(t.date)}</span>
      <span class="dm"><span class="dn1"><b>${esc(t.symbol)}</b><span class="dtag">${t.side === 'Sell' ? 'Short' : 'Long'}</span>${t.session ? `<span class="dtag">${esc(t.session)}</span>` : ''}</span>${t.note ? `<span class="dnote">${esc(t.note)}</span>` : ''}</span>
      <span class="dpl ${cls(t.pnl)}">${dmoney(t.pnl)}</span>
      <button type="button" class="dsh" data-act="sharetrade" data-id="${t.id}" aria-label="Share trade card"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/></svg></button>
      <button type="button" class="dx${DS.arm === t.id ? ' arm' : ''}" data-act="dxdel" data-id="${t.id}" aria-label="Delete trade">${DS.arm === t.id ? 'Delete?' : '&#10005;'}</button></div>`;
  }).join('') + (rows.length > part.length ? `<button type="button" class="btn dmore" data-dact="more">Show more (${rows.length - part.length})</button>` : '')
    : `<p class="empty">No matching trades.</p>`;
}
function renderDashTrades() {
  const D = dashTrades(), el = $('dtrades');
  if (!D.length) { el.innerHTML = ''; return; }
  const W = D.filter(t => t.pnl > 0).length, L = D.filter(t => t.pnl < 0).length;
  const b = (v, txt) => `<button type="button" data-dact="tf" data-v="${v}" aria-pressed="${DS.filter === v}">${txt}</button>`;
  el.innerHTML = `<h2>Trades</h2><div class="dtools"><div class="seg seg3" id="dfilter" role="group" aria-label="Filter trades">${b('all', 'All ' + D.length)}${b('win', 'Wins ' + W)}${b('loss', 'Losses ' + L)}</div>
    <input id="dsearch" type="text" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" placeholder="Search symbol or note" value="${esc(DS.q)}" aria-label="Search trades"></div><div id="dlist"></div>`;
  renderDashList();
}

function dashGoalLine() {
  const el = $('dgoalline'); if (!el) return;
  if (!(SET.goal > 0) || (SET.unit === '%' && !(SET.balance > 0))) { el.innerHTML = ''; return; }
  const m = today().slice(0, 7), net = sum(visible().filter(t => t.date.startsWith(m)).map(t => t.pnl));
  el.innerHTML = `<div class="goal"><div class="lbl">This month</div>${goalHtml(net).replace(/^<div class="goal">/, '<div>')}</div>`;
}
function renderDashGoals() {
  const el = $('dgoals'); if (!el) return;
  const ok = SET.goal > 0 && !(SET.unit === '%' && !(SET.balance > 0));
  el.innerHTML = ok
    ? `<h2>Monthly goal</h2><div id="dgoalline"></div><button class="link goalset" data-act="goalset">Edit goals and limits</button>`
    : `<button class="link goalset" data-act="goalset">Set a monthly goal or daily loss limit</button>`;
  if (ok) dashGoalLine();
}

function renderDashLimit() {
  const els = ['jlimit', 'dlimit'].map($).filter(Boolean);
  const set = h => els.forEach(e => { e.innerHTML = h; });
  const bc = document.body.classList; bc.remove('limhit', 'limwarn');
  if (!(SET.maxLoss > 0)) return set('');
  const tn = sum(visible().filter(t => t.date === today()).map(t => t.pnl));
  const f = Math.max(0, -tn) / SET.maxLoss;
  if (f < .75) return set('');
  const hit = f >= 1, lim = '$' + SET.maxLoss.toLocaleString(undefined, { maximumFractionDigits: 2 });
  set(`<div class="lbanner" role="alert"><b>${hit ? 'Daily loss limit reached. Stop trading for today.' : 'Close to your daily loss limit. Trade carefully.'}</b><br>Today ${dmoney(tn)} of ${lim} limit (${Math.round(f * 100)}%)</div>`);
  if (S.tab === 'journal') bc.add(hit ? 'limhit' : 'limwarn');
}
function renderDash() {
  const sc = document.body.scrollTop;
  $('drange').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === (SET.dashRange || '90')));
  DS.w = window.innerWidth;
  renderDashMain(); renderDashTrades(); renderDashGoals();
  document.body.scrollTop = sc;
}

document.addEventListener('click', async e => {
  const del = e.target.closest('[data-act="dxdel"]');
  if (del) {
    const id = Number(del.dataset.id);
    if (DS.arm !== id) {
      DS.arm = id; renderDashList(); clearTimeout(DS.t);
      DS.t = setTimeout(() => { DS.arm = null; if (S.tab === 'dash') renderDashList(); }, 3000);
      return;
    }
    DS.arm = null; clearTimeout(DS.t);
    S.trades = S.trades.filter(t => t.id !== id); render(); await save(); toast('Deleted');
    return;
  }
  const el = e.target.closest('[data-dact]'); if (!el) return;
  const a = el.dataset.dact, v = el.dataset.v;
  if (a === 'range') { SET.dashRange = v; saveSet(); DS.show = 50; renderDash(); }
  else if (a === 'tf') { DS.filter = v; DS.show = 50; $('dfilter').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v)); renderDashList(); }
  else if (a === 'more') { DS.show += 50; renderDashList(); }
});
document.addEventListener('input', e => { if (e.target.id === 'dsearch') { DS.q = e.target.value; DS.show = 50; renderDashList(); } });
document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('dtr')) { e.preventDefault(); openSheet(Number(e.target.dataset.id)); } });
window.addEventListener('resize', () => {
  if (S.tab === 'journal' && window.innerWidth !== DS.w) { DS.w = window.innerWidth; cancelAnimationFrame(DS.r); DS.r = requestAnimationFrame(renderJournal); return; }
  if (S.tab !== 'dash' || window.innerWidth === DS.w) return;
  DS.w = window.innerWidth; cancelAnimationFrame(DS.r); DS.r = requestAnimationFrame(renderDashMain);
});

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, v = el.dataset.v;
  if (a === 'tab') { S.tab = v; render(); document.body.scrollTop = 0; window.scrollTo(0, 0); }
  else if (a === 'eye') { MASK = !MASK; try { localStorage.setItem('pnl-mask', MASK ? '1' : '0'); } catch (e) {} render(); }
  else if (a === 'crange') { SET.chartRange = v; saveSet(); CV.seen = []; renderJournal(); }
  else if (a === 'chip') { S.symbol = v; S.day = null; render(); }
  else if (a === 'edit') openSheet(Number(el.dataset.id));
  else if (a === 'sharelive' || a === 'sharetrade') openShare('trade', Number(el.dataset.id));
  else if (a === 'day') { S.day = S.day === el.dataset.d ? null : el.dataset.d; renderReports(); }
  else if (a === 'mnav') { S.month = shiftMonth(S.month, Number(v)); S.day = null; renderReports(); }
  else if (a === 'month') { S.month = el.dataset.m; S.day = null; if (S.tab !== 'reports') { S.tab = 'reports'; render(); } else renderReports(); document.body.scrollTop = 0; window.scrollTo(0, 0); }
  else if (a === 'symfill') { $('f-symbol').value = v; }
  else if (a === 'sample') loadSample();
  else if (a === 'imp') doImport(v);
  else if (a === 'impbk') doBackup(v);
  else if (a === 'impdec') decryptPending();
  else if (a === 'dpday') pickDate(el.dataset.d);
  else if (a === 'sess') setSess(S.session === v ? '' : v);
  else if (a === 'gunit') { SET.unit = v; saveSet(); renderGoalForm(true); }
  else if (a === 'goalset') { S.tab = 'data'; render(); requestAnimationFrame(() => $('goalPanel').scrollIntoView()); }
  else if (a === 'shkind') { SH.kind = v; refreshShare(); }
  else if (a === 'shstep') shareStep(Number(v));
  else if (a === 'shhide') { SET.hide = v === '1'; saveSet(); refreshShare(); }
  else if (a === 'font') { SET.font = v; saveSet(); applyFont(); if (SH.open) refreshShare(); }
  else if (a === 'shstyle') { SET.cardStyle = v; saveSet(); refreshShare(); }
  else if (a === 'shratio') { SET.cardRatio = v; saveSet(); refreshShare(); }
  else if (a === 'shround') { SET.cardRound = v; saveSet(); refreshShare(); }
});
$('fab').onclick = () => openSheet();
$('f-datebtn').onclick = openDp;
$('dpPrev').onclick = () => { DP.ym = shiftMonth(DP.ym, -1); renderDp(); };
$('dpNext').onclick = () => { DP.ym = shiftMonth(DP.ym, 1); renderDp(); };
$('dpToday').onclick = () => pickDate(today());
$('dpClose').onclick = closeDp;
$('dpScrim').onclick = closeDp;
$('closeSheet').onclick = closeSheet;
$('scrim').onclick = closeSheet;
$('f-buy').onclick = () => setSide('Buy');
$('f-sell').onclick = () => setSide('Sell');
$('f-profit').onclick = () => setRes('Profit');
$('f-live').onclick = () => setLive(!S.live);
$('f-loss').onclick = () => setRes('Loss');
['f-entry', 'f-sl', 'f-tp', 'f-exit'].forEach(id => $(id).addEventListener('input', updateCalc));
$('form').setAttribute('novalidate', '');
$('form').addEventListener('submit', submitForm);
$('saveBtn').type = 'button';
$('saveBtn').addEventListener('click', submitForm);
$('delBtn').onclick = deleteTrade;
$('shareBtn').onclick = () => openShare(S.tab === 'reports' ? 'month' : 'day');
$('shareTradeBtn').onclick = () => { if (S.editing) openShare('trade', S.editing); };
$('shClose').onclick = closeShare;
$('shScrim').onclick = closeShare;
$('shShare').onclick = shareCard;
$('shSave').onclick = saveCard;
$('shSaveVid').onclick = () => videoOut('save');
$('goalSave').onclick = saveGoal;
$('exportBtn').onclick = exportBackup;
$('copyBtn').onclick = copyBackup;
$('pickBtn').onclick = () => $('file').click();
$('file').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => showImport(String(r.result)); r.readAsText(f); e.target.value = '';
});
$('pasteBtn').onclick = () => showImport($('paste').value);
$('clearBtn').onclick = clearAll;
$('liteBtn').onclick = cycleLite;
['app', 'card'].forEach(w => {
  const id = BGID[w];
  $('bgPick' + id).onclick = () => $('bgFile' + id).click();
  $('bgFile' + id).addEventListener('change', e => { const el = e.target, f = el.files && el.files[0]; bgPick(w, f).finally(() => { try { el.value = ''; } catch (x) {} }); });
  $('bgClear' + id).onclick = () => (w === 'card' ? galSelect(null) : bgClear(w));
  $('bgLvl' + id).addEventListener('input', e => { if (w === 'app') SET.bgApp = +e.target.value; else SET.bgCard = +e.target.value; saveSet(); bgApply(w); });
});
$('acBtn').onclick = openAc;
$('acClose').onclick = closeAc;
$('acScrim').onclick = closeAc;
$('acAdd').onclick = acAdd;
$('acRename').onclick = acRename;
$('acDel').onclick = acDelete;
$('acList').addEventListener('click', e => { const b = e.target.closest('.acrow'); if (b) acSwitch(b.dataset.acid); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http') &&
    !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

$('shGal').addEventListener('click', e => {
  const x = e.target.closest('[data-gdel]'); if (x) { e.stopPropagation(); galDelete(x.dataset.gdel); return; }
  const b = e.target.closest('[data-g]'); if (!b) return;
  const v = b.dataset.g;
  if (v === 'add') $('bgFileCard').click(); else if (v === 'none') galSelect(null); else galSelect(v);
});
bgInit();
galInit();
(async () => {
  await tsInit(); S.trades = await load(); acLabel(); render(); paintStore();
  if (!CAN_ENC) { const i = $('bkPass'); if (i) { i.disabled = true; i.placeholder = 'Needs https'; } }
})();
