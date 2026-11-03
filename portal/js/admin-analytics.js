// Admin console → Live traffic. Cookieless website analytics stored in Supabase
// (public.page_views, recorded by assets/js/track.js on every public page).
import { supabase, esc, ago, toast } from './supabase.js';

const RANGES = [['1', 'Today'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days']];
let timer = null;
let channel = null;
let feed = [];

const nf = new Intl.NumberFormat('en');
const n = (v) => nf.format(Number(v || 0));
const dur = (s) => { s = Math.round(Number(s || 0)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };
const range = () => sessionStorage.getItem('analyticsRange') || '7';
const pageName = (path, title) => (title ? title.replace(/\s+[—|–-]\s+iContact.*$/i, '') : path) || '/';
const place = (tz) => (tz ? tz.split('/').pop().replace(/_/g, ' ') : 'Unknown');

// Small nav badge with the number of people on the site right now.
export function startLiveBadge() {
  const tick = async () => {
    const { data, error } = await supabase.rpc('analytics_live');
    const el = document.querySelector('[data-count="live"]');
    if (el && !error) { el.textContent = data.length || ''; el.hidden = !data.length; }
  };
  tick(); setInterval(tick, 30000);
}

export function analyticsView() {
  return `
    <div class="toolbar">
      <div class="segmented" role="tablist" aria-label="Date range">
        ${RANGES.map(([v, l]) => `<button data-arange="${v}" class="${v === range() ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      <span class="muted small" id="an-updated" aria-live="polite"></span>
    </div>
    <div id="an-body"><section class="card"><p class="muted">Loading traffic…</p></section></div>`;
}

export function stopAnalytics() {
  clearInterval(timer); timer = null;
  if (channel) { supabase.removeChannel(channel); channel = null; }
}

export async function bindAnalytics() {
  stopAnalytics();
  document.querySelectorAll('[data-arange]').forEach((b) => b.addEventListener('click', () => {
    sessionStorage.setItem('analyticsRange', b.dataset.arange);
    document.querySelectorAll('[data-arange]').forEach((x) => x.classList.toggle('on', x === b));
    refresh();
  }));
  await refresh();
  timer = setInterval(refresh, 15000);
  channel = supabase.channel('analytics-feed')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'page_views' }, (p) => {
      feed = [p.new, ...feed].slice(0, 25);
      drawFeed();
      document.querySelector('.live-kpi')?.classList.add('pulse-once');
      setTimeout(() => document.querySelector('.live-kpi')?.classList.remove('pulse-once'), 900);
    })
    .subscribe();
}

async function refresh() {
  const body = document.getElementById('an-body');
  if (!body) return stopAnalytics();
  const [sum, live, recent] = await Promise.all([
    supabase.rpc('analytics_summary', { p_days: Number(range()) }),
    supabase.rpc('analytics_live'),
    feed.length ? { data: null } : supabase.from('page_views').select('id,path,title,referrer,device,timezone,created_at').order('created_at', { ascending: false }).limit(25),
  ]);
  const err = sum.error || live.error;
  if (err) {
    body.innerHTML = /analytics_|page_views|function/.test(err.message)
      ? `<section class="card"><div class="empty"><h3>One-time setup needed</h3>
          <p>Run <code>supabase/migrations/20261103_analytics_zoho.sql</code> (or the latest <code>supabase/schema.sql</code>) in Supabase → SQL Editor, then refresh. Visits are recorded from that moment on.</p></div></section>`
      : `<section class="card"><p class="muted">${esc(err.message)}</p></section>`;
    if (!/analytics_|page_views|function/.test(err.message)) toast(err.message, 'error');
    return stopAnalytics();
  }
  if (recent.data) feed = recent.data;
  draw(body, sum.data, live.data);
  const el = document.querySelector('[data-count="live"]');
  if (el) { el.textContent = live.data.length || ''; el.hidden = !live.data.length; }
  const up = document.getElementById('an-updated');
  if (up) up.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · refreshes every 15s`;
}

function draw(body, s, live) {
  const label = RANGES.find(([v]) => v === range())[1].toLowerCase();
  const dev = s.devices || {};
  const devTotal = Object.values(dev).reduce((a, b) => a + b, 0) || 1;
  body.innerHTML = `
    <section class="kpis">
      <div class="kpi kpi-accent live-kpi"><span class="kpi-label"><span class="live-dot-lg" aria-hidden="true"></span>On the site now</span><span class="kpi-value">${n(live.length)}</span><span class="kpi-sub">active in the last 90 seconds</span></div>
      <div class="kpi"><span class="kpi-label">Visitors</span><span class="kpi-value">${n(s.visitors)}</span><span class="kpi-sub">${label}</span></div>
      <div class="kpi"><span class="kpi-label">Page views</span><span class="kpi-value">${n(s.views)}</span><span class="kpi-sub">${s.visitors ? (s.views / s.visitors).toFixed(1) : '0'} per visit</span></div>
      <div class="kpi"><span class="kpi-label">Avg. time on page</span><span class="kpi-value">${dur(s.avg_secs)}</span><span class="kpi-sub">${n(s.bounce)}% single-page visits</span></div>
    </section>

    <div class="grid-2 an-grid">
      <section class="card">
        <header class="card-head"><h3>Who’s on the site right now</h3><span class="muted small">${n(live.length)} live</span></header>
        ${live.length ? `<ul class="list live-list">${live.sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at)).map((v) => `
          <li><span class="list-dot live"></span><div><strong>${esc(pageName(v.path, v.title))}</strong>
            <span class="muted block">${esc(v.device || 'unknown')} · ${esc(place(v.timezone))} · from ${esc(v.referrer || 'direct')} · ${v.pages} page${v.pages > 1 ? 's' : ''}</span></div>
            <span class="list-meta">${ago(v.started_at)}</span></li>`).join('')}</ul>`
          : '<div class="empty"><p class="muted">Nobody on the site right now. This updates live.</p></div>'}
      </section>
      <section class="card">
        <header class="card-head"><h3>Live feed</h3><span class="muted small">every page view as it happens</span></header>
        <ul class="list feed-list" id="an-feed"></ul>
      </section>
    </div>

    <section class="card">
      <header class="card-head"><h3>Visitors per day</h3><span class="muted small">${label} · hover a bar for details</span></header>
      ${chart(s.daily || [])}
    </section>

    <div class="grid-2 an-grid">
      <section class="card"><header class="card-head"><h3>Top pages</h3><span class="muted small">views</span></header>
        ${bars((s.pages || []).map((p) => ({ label: pageName(p.path, p.title), sub: p.path, value: p.views })))}</section>
      <section class="card"><header class="card-head"><h3>Where visitors come from</h3><span class="muted small">visitors</span></header>
        ${bars((s.referrers || []).map((r) => ({ label: r.source, value: r.visitors })))}</section>
    </div>
    <div class="grid-2 an-grid">
      <section class="card"><header class="card-head"><h3>Devices</h3><span class="muted small">visitors</span></header>
        ${bars(['mobile', 'desktop', 'tablet'].filter((d) => dev[d]).map((d) => ({ label: `${d[0].toUpperCase()}${d.slice(1)}`, value: dev[d], note: `${Math.round((100 * dev[d]) / devTotal)}%` })))}</section>
      <section class="card"><header class="card-head"><h3>Visitor time zones</h3><span class="muted small">approximate location</span></header>
        ${bars((s.timezones || []).map((t) => ({ label: place(t.timezone), sub: t.timezone, value: t.visitors })))}</section>
    </div>
    <p class="muted small an-note">Cookieless and anonymous: no IP addresses, no cross-site tracking, and visitors with “Do Not Track” or Global Privacy Control switched on aren’t counted. Browsers signed in to the Client Portal (you and your clients) aren’t counted either.</p>`;
  drawFeed();
}

function drawFeed() {
  const ul = document.getElementById('an-feed');
  if (!ul) return;
  ul.innerHTML = feed.length ? feed.slice(0, 12).map((v) => `
    <li><span class="list-dot"></span><div><strong>${esc(pageName(v.path, v.title))}</strong>
      <span class="muted block">${esc(v.device || 'unknown')} · ${esc(place(v.timezone))}${v.referrer ? ` · from ${esc(v.referrer)}` : ''}</span></div>
      <span class="list-meta">${ago(v.created_at)}</span></li>`).join('')
    : '<li class="muted">No visits recorded yet.</li>';
}

// Ranked horizontal bars (single hue; value always printed as text).
function bars(rows) {
  if (!rows.length) return '<p class="muted">No data yet.</p>';
  const max = Math.max(...rows.map((r) => r.value)) || 1;
  return `<table class="an-bars"><tbody>${rows.map((r) => `
    <tr title="${esc(r.sub || r.label)}"><td class="an-bar-label"><span>${esc(r.label)}</span>
      <span class="an-bar" style="--w:${Math.max(2, (100 * r.value) / max).toFixed(1)}%" aria-hidden="true"></span></td>
      <td class="num">${n(r.value)}${r.note ? ` <span class="muted">${r.note}</span>` : ''}</td></tr>`).join('')}</tbody></table>`;
}

// Daily visitors as a column chart, with every day in the range filled in.
function chart(daily) {
  const days = Number(range());
  const map = new Map(daily.map((d) => [d.day, d]));
  const today = new Date(Date.now() + 2 * 3600e3); // Harare
  const pts = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(today - i * 864e5).toISOString().slice(0, 10);
    pts.push({ day: key, visitors: map.get(key)?.visitors || 0, views: map.get(key)?.views || 0 });
  }
  if (!pts.some((p) => p.visitors)) return '<p class="muted">No visits in this period yet.</p>';
  const W = 720, H = 200, padL = 34, padB = 22, padT = 10;
  const max = Math.max(...pts.map((p) => p.visitors));
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * 4;
  const cw = (W - padL) / pts.length;
  const bw = Math.max(3, Math.min(28, cw - 2));
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const fmtDay = (k) => new Date(`${k}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const every = Math.ceil(pts.length / 7);
  return `<div class="an-chart" role="img" aria-label="Visitors per day">
    <svg viewBox="0 0 ${W} ${H}" width="100%">
      ${[0, 1, 2, 3, 4].map((g) => `<line x1="${padL}" x2="${W}" y1="${y(g * step)}" y2="${y(g * step)}" class="an-grid-line"/><text x="${padL - 6}" y="${y(g * step) + 4}" class="an-axis" text-anchor="end">${g * step}</text>`).join('')}
      ${pts.map((p, i) => {
        const x = padL + i * cw + (cw - bw) / 2; const h = Math.max(0, y(0) - y(p.visitors));
        return `<g class="an-col" data-tip="${esc(`${fmtDay(p.day)}: ${p.visitors} visitor${p.visitors === 1 ? '' : 's'} · ${p.views} view${p.views === 1 ? '' : 's'}`)}">
          <rect class="an-hit" x="${padL + i * cw}" y="${padT}" width="${cw}" height="${H - padT - padB}"/>
          ${h ? `<rect class="an-colbar" x="${x}" y="${y(p.visitors)}" width="${bw}" height="${h}" rx="${Math.min(3, bw / 2)}"/>` : ''}
          ${i % every === 0 || i === pts.length - 1 ? `<text x="${padL + i * cw + cw / 2}" y="${H - 6}" class="an-axis" text-anchor="middle">${fmtDay(p.day)}</text>` : ''}
        </g>`;
      }).join('')}
    </svg><div class="an-tip" hidden></div></div>`;
}

// Tooltip for the column chart (delegated, so it survives re-renders).
document.addEventListener('pointerover', (e) => {
  const g = e.target.closest?.('.an-col');
  const wrap = e.target.closest?.('.an-chart');
  const tip = wrap?.querySelector('.an-tip');
  if (!tip) return;
  if (!g) { tip.hidden = true; return; }
  tip.textContent = g.dataset.tip; tip.hidden = false;
  const r = g.querySelector('.an-hit').getBoundingClientRect(); const w = wrap.getBoundingClientRect();
  tip.style.left = `${Math.min(Math.max(r.left - w.left + r.width / 2, 70), w.width - 70)}px`;
});
document.addEventListener('pointerleave', (e) => { if (e.target.classList?.contains('an-chart')) e.target.querySelector('.an-tip').hidden = true; }, true);
