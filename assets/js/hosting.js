// Hosting page: web hosting plans (monthly/annual toggle) + email hosting
// (per-mailbox calculator). All prices come from catalog.js.
import { HOSTING_PLANS, EMAIL_PLANS, ANNUAL_MONTHS, PRICE_NOTE, money } from './catalog.js';
import { openOrder } from './order.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const check = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
document.querySelectorAll('[data-price-note]').forEach((el) => { el.textContent = PRICE_NOTE; });

// ---------- Web hosting ---------------------------------------------------------
const hostGrid = document.getElementById('hosting-plans');
const billingToggle = document.getElementById('billing-toggle');
let annual = true;
const saveMonths = 12 - ANNUAL_MONTHS;
document.querySelectorAll('[data-save-months]').forEach((el) => { el.textContent = `${saveMonths} months free`; });

function hostPrice(p) {
  if (!annual) return { big: money(p.monthly), unit: '/ month', sub: 'Billed monthly' };
  const yearly = p.monthly * ANNUAL_MONTHS;
  return { big: money(+(yearly / 12).toFixed(2)), unit: '/ month', sub: `${money(yearly)} billed yearly · save ${money(p.monthly * saveMonths)}` };
}

function renderHosting() {
  if (!hostGrid) return;
  hostGrid.innerHTML = HOSTING_PLANS.map((p) => {
    const pr = hostPrice(p);
    return `
    <article class="plan-card${p.popular ? ' featured' : ''}">
      ${p.popular ? '<span class="ribbon">Most popular</span>' : ''}
      <h3>${esc(p.name)}</h3>
      <p class="plan-tag">${esc(p.tagline)}</p>
      <div class="price-big"><b>${pr.big}</b><span>${pr.unit}</span></div>
      <p class="price-note">${esc(pr.sub)}</p>
      <button class="btn ${p.popular ? 'btn-primary' : 'btn-outline'} btn-block" data-order-host="${esc(p.id)}">Choose ${esc(p.name)}</button>
      <ul class="plan-features">${p.features.map((f) => `<li>${check}${esc(f)}</li>`).join('')}</ul>
    </article>`;
  }).join('');
}

billingToggle?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-billing]');
  if (!b) return;
  annual = b.dataset.billing === 'annual';
  billingToggle.querySelectorAll('[data-billing]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  renderHosting();
});

hostGrid?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-order-host]');
  if (!b) return;
  const p = HOSTING_PLANS.find((x) => x.id === b.dataset.orderHost);
  const pr = hostPrice(p);
  openOrder({
    title: `${p.name} web hosting`,
    service: 'Web hosting',
    lines: [`${p.name} plan — ${pr.big}${pr.unit} (${annual ? 'annual billing' : 'monthly billing'})`, pr.sub,
      'Domain: I’ll tell you / help me choose'],
    note: 'Moving from another host? Tell us below — migration of your site and emails is free on annual plans.',
  });
});

// ---------- Email hosting ----------------------------------------------------------
const mailGrid = document.getElementById('email-plans');
const seats = document.getElementById('mailboxes');
const seatsOut = document.getElementById('mailboxes-out');
const n = () => Math.max(1, Math.min(500, parseInt(seats?.value || '1', 10) || 1));

function renderEmail() {
  if (!mailGrid) return;
  const users = n();
  if (seatsOut) seatsOut.textContent = `${users} mailbox${users === 1 ? '' : 'es'}`;
  mailGrid.innerHTML = EMAIL_PLANS.map((p) => `
    <article class="plan-card${p.popular ? ' featured' : ''}">
      ${p.popular ? '<span class="ribbon">Best value</span>' : ''}
      <h3>${esc(p.name)}</h3>
      <p class="plan-tag">${esc(p.tagline)}</p>
      <div class="price-big"><b>${money(p.perUser)}</b><span>/ mailbox / month</span></div>
      <p class="plan-total">${users} × ${money(p.perUser)} = <b>${money(+(users * p.perUser).toFixed(2))}</b> / month</p>
      <button class="btn ${p.popular ? 'btn-primary' : 'btn-outline'} btn-block" data-order-mail="${esc(p.id)}">Choose ${esc(p.name)}</button>
      <ul class="plan-features">${p.features.map((f) => `<li>${check}${esc(f)}</li>`).join('')}</ul>
    </article>`).join('');
}

document.getElementById('seat-minus')?.addEventListener('click', () => { seats.value = n() - 1; renderEmail(); });
document.getElementById('seat-plus')?.addEventListener('click', () => { seats.value = n() + 1; renderEmail(); });
seats?.addEventListener('input', renderEmail);

mailGrid?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-order-mail]');
  if (!b) return;
  const p = EMAIL_PLANS.find((x) => x.id === b.dataset.orderMail);
  const users = n();
  openOrder({
    title: `${p.name} email hosting`,
    service: 'Email hosting',
    lines: [`${p.name} — ${users} mailbox${users === 1 ? '' : 'es'} × ${money(p.perUser)} = ${money(+(users * p.perUser).toFixed(2))}/month`,
      'Domain for the email addresses: I’ll confirm / help me choose'],
    note: 'Already have email elsewhere (Gmail, another host)? We’ll migrate your existing mail at no extra cost.',
  });
});

renderHosting();
renderEmail();
