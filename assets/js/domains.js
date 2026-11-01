// Domain name checker (Domains page).
// Live availability via public RDAP for supported extensions; everything else
// (e.g. .co.zw) is shown as "We'll confirm". A domain is only ever shown as
// "Available" when the registry itself answers "not found".
import { TLDS, money, PRICE_NOTE } from './catalog.js';
import { openOrder } from './order.js';

const form = document.getElementById('domain-search');
const input = document.getElementById('domain-q');
const results = document.getElementById('domain-results');
const bar = document.getElementById('domain-cart');
const note = document.getElementById('domain-note');
if (note) note.textContent = PRICE_NOTE;

const selected = new Map(); // fqdn -> tld entry
let runId = 0;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byLongest = [...TLDS].sort((a, b) => b.tld.length - a.tld.length);

/** "https://www.My-Shop.co.zw/about" -> { label: 'my-shop', tld: 'co.zw' } */
export function parseQuery(raw) {
  let q = String(raw || '').trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#\s]/)[0];
  let tld = null;
  const hit = byLongest.find((t) => q.endsWith(`.${t.tld}`));
  if (hit) { tld = hit.tld; q = q.slice(0, -(hit.tld.length + 1)); }
  else if (q.includes('.')) q = q.split('.')[0]; // unknown extension: use the name part
  q = q.replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
  if (!q) return { error: 'Type the name you want, e.g. yourbusiness' };
  if (q.length > 63) return { error: 'That name is too long (max 63 characters).' };
  return { label: q, tld };
}

/** 'available' | 'taken' | 'unknown' */
async function checkLive(fqdn) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(fqdn)}`, {
      headers: { accept: 'application/rdap+json' }, signal: ctrl.signal,
    });
    const host = new URL(res.url).host;
    if (res.status === 200) return 'taken';
    // Only trust "not found" when it comes from the registry, not the rdap.org bootstrap.
    if (res.status === 404 && host !== 'rdap.org') return 'available';
    return 'unknown';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

const STATUS = {
  checking: ['Checking…', 'is-checking'],
  available: ['Available', 'is-available'],
  taken: ['Taken', 'is-taken'],
  unknown: ['We’ll confirm', 'is-unknown'],
};

function rowHtml(label, t) {
  const fqdn = `${label}.${t.tld}`;
  const promo = t.renew > t.register;
  return `
    <li class="domain-row" data-fqdn="${esc(fqdn)}" data-tld="${esc(t.tld)}">
      <div class="domain-name"><b>${esc(label)}</b><span>.${esc(t.tld)}</span><small>${esc(t.note || '')}</small></div>
      <span class="domain-status ${t.live ? STATUS.checking[1] : STATUS.unknown[1]}">${t.live ? STATUS.checking[0] : STATUS.unknown[0]}</span>
      <div class="domain-price"><b>${money(t.register)}</b><small>/yr${promo ? ` · renews ${money(t.renew)}` : ''}</small></div>
      <button class="btn btn-outline btn-sm domain-add" type="button" aria-pressed="false" ${t.live ? 'disabled' : ''}>Add</button>
    </li>`;
}

function setStatus(li, state) {
  const [text, cls] = STATUS[state];
  const badge = li.querySelector('.domain-status');
  badge.className = `domain-status ${cls}`;
  badge.textContent = text;
  const btn = li.querySelector('.domain-add');
  btn.disabled = state === 'taken' || state === 'checking';
  if (state === 'taken') { btn.textContent = 'Taken'; li.classList.add('taken'); }
}

function suggestions(label) {
  const base = label.replace(/-+/g, '-');
  return [...new Set([`${base}zw`, `get${base}`, `${base}hq`, `${base}-africa`, `my${base}`])]
    .filter((s) => s.length <= 63).slice(0, 4);
}

async function search(raw) {
  const parsed = parseQuery(raw);
  const id = ++runId;
  if (parsed.error) {
    results.innerHTML = `<p class="domain-error" role="alert">${esc(parsed.error)}</p>`;
    return;
  }
  const { label, tld } = parsed;
  const ordered = tld ? [TLDS.find((t) => t.tld === tld), ...TLDS.filter((t) => t.tld !== tld)] : TLDS;
  const sugg = suggestions(label);
  results.innerHTML = `
    <div class="domain-head"><h2>Results for <span>${esc(label)}</span></h2>
      <p class="muted">Live checks for most extensions. Zimbabwe extensions (.co.zw, .org.zw) are confirmed by our team, usually within the hour.</p></div>
    <ul class="domain-list">${ordered.map((t) => rowHtml(label, t)).join('')}</ul>
    <div class="domain-suggest"><span>Try also:</span>${sugg.map((s) => `<button type="button" class="chip" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
  history.replaceState(null, '', `?q=${encodeURIComponent(tld ? `${label}.${tld}` : label)}`);

  // Run live checks with limited concurrency (be polite to the registries).
  const queue = ordered.filter((t) => t.live);
  const worker = async () => {
    while (queue.length) {
      const t = queue.shift();
      const fqdn = `${label}.${t.tld}`;
      const state = await checkLive(fqdn);
      if (id !== runId) return; // a newer search started
      const li = results.querySelector(`[data-fqdn="${CSS.escape(fqdn)}"]`);
      if (li) setStatus(li, state);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

function renderCart() {
  const n = selected.size;
  bar.hidden = n === 0;
  document.body.classList.toggle('has-cart', n > 0);
  if (!n) return;
  const total = [...selected.values()].reduce((s, t) => s + t.register, 0);
  bar.querySelector('.cart-count').textContent = `${n} domain${n === 1 ? '' : 's'} selected`;
  bar.querySelector('.cart-list').textContent = [...selected.keys()].join(', ');
  bar.querySelector('.cart-total').textContent = `${money(total)} first year`;
}

results?.addEventListener('click', (e) => {
  const sug = e.target.closest('[data-suggest]');
  if (sug) { input.value = sug.dataset.suggest; search(input.value); return; }
  const btn = e.target.closest('.domain-add');
  if (!btn || btn.disabled) return;
  const li = btn.closest('.domain-row');
  const fqdn = li.dataset.fqdn;
  const t = TLDS.find((x) => x.tld === li.dataset.tld);
  if (selected.has(fqdn)) { selected.delete(fqdn); btn.textContent = 'Add'; btn.setAttribute('aria-pressed', 'false'); li.classList.remove('picked'); }
  else { selected.set(fqdn, t); btn.textContent = 'Added ✓'; btn.setAttribute('aria-pressed', 'true'); li.classList.add('picked'); }
  renderCart();
});

bar?.querySelector('.cart-order')?.addEventListener('click', () => {
  const lines = [...selected.entries()].map(([fqdn, t]) => `${fqdn} — ${money(t.register)}/yr (renews ${money(t.renew)})`);
  const withHosting = bar.querySelector('#cart-hosting')?.checked;
  const withEmail = bar.querySelector('#cart-email')?.checked;
  if (withHosting) lines.push('Add web hosting — please recommend a plan');
  if (withEmail) lines.push('Add professional email — please recommend a plan');
  openOrder({
    title: `Domain registration (${selected.size})`,
    service: 'Domain registration',
    lines,
    note: 'We confirm availability with the registry before invoicing. If a name has just been taken, we’ll suggest close alternatives.',
  });
});

bar?.querySelector('.cart-clear')?.addEventListener('click', () => {
  selected.clear();
  results.querySelectorAll('.domain-row.picked').forEach((li) => {
    li.classList.remove('picked');
    const b = li.querySelector('.domain-add'); b.textContent = 'Add'; b.setAttribute('aria-pressed', 'false');
  });
  renderCart();
});

form?.addEventListener('submit', (e) => { e.preventDefault(); search(input.value); });

// TLD price table
const table = document.getElementById('tld-table');
if (table) {
  table.innerHTML = TLDS.map((t) => `
    <tr><td><b>.${esc(t.tld)}</b><span class="muted block">${esc(t.note || '')}</span></td>
    <td class="num">${money(t.register)}</td><td class="num">${money(t.renew)}</td>
    <td>${t.live ? '<span class="chip ok">Instant check</span>' : '<span class="chip">Confirmed by our team</span>'}</td></tr>`).join('');
}

// Start a search from ?q= (homepage domain bar links here)
const q = new URLSearchParams(location.search).get('q');
if (q && input) { input.value = q; search(q); }
