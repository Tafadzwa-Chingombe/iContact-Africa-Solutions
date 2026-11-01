// Order request modal used by the Domains and Hosting pages.
// openOrder({ title, service, lines: ['…'], note }) shows a short form and
// saves the order to the admin Enquiries inbox (WhatsApp/email fallback).
import { submitEnquiry, whatsappLink, mailtoLink, summaryText } from './enquiry.js';

let dialog;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'order-modal';
  dialog.setAttribute('aria-labelledby', 'order-title');
  document.body.appendChild(dialog);
  dialog.addEventListener('click', (e) => { if (e.target === dialog || e.target.closest('[data-close]')) dialog.close(); });
  return dialog;
}

export function openOrder({ title, service, lines = [], note = '' }) {
  const d = ensureDialog();
  d.innerHTML = `
    <div class="order-inner">
      <button class="order-close" data-close aria-label="Close">&times;</button>
      <p class="eyebrow">Order request</p>
      <h2 id="order-title">${esc(title)}</h2>
      ${lines.length ? `<ul class="order-lines">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      ${note ? `<p class="order-note">${esc(note)}</p>` : ''}
      <form class="order-form" novalidate>
        <div class="form-grid">
          <div class="field"><label for="o-name">Name</label><input id="o-name" name="name" autocomplete="name" required></div>
          <div class="field"><label for="o-email">Email</label><input id="o-email" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="o-phone">Phone / WhatsApp</label><input id="o-phone" name="phone" type="tel" autocomplete="tel"></div>
          <div class="field"><label for="o-company">Business name</label><input id="o-company" name="company" autocomplete="organization"></div>
          <div class="field full"><label for="o-notes">Anything else? <span class="muted">(optional)</span></label><textarea id="o-notes" name="notes" rows="3" placeholder="e.g. move my existing website and emails from another host"></textarea></div>
          <input class="hp" type="text" name="company_website" tabindex="-1" autocomplete="off" aria-hidden="true">
        </div>
        <div class="order-actions">
          <button class="btn btn-primary" type="submit">Send order request</button>
          <a class="btn btn-outline order-wa" target="_blank" rel="noopener">Order on WhatsApp</a>
        </div>
        <p class="order-small">No payment now — we confirm availability and send you an invoice. You'll get a Client Portal login to manage everything.</p>
        <div class="form-status" role="status" aria-live="polite"></div>
      </form>
    </div>`;
  const form = d.querySelector('form');
  const status = d.querySelector('.form-status');
  const wa = d.querySelector('.order-wa');
  const orderText = `${title}\n${lines.map((l) => `• ${l}`).join('\n')}`;
  const updateWa = () => {
    const who = form.name.value.trim() ? `\n\nName: ${form.name.value.trim()}` : '';
    wa.href = whatsappLink(`Hi iContact, I'd like to order:\n${orderText}${who}`);
  };
  updateWa();
  form.addEventListener('input', updateWa);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity() || form.company_website.value) return;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Sending…';
    const data = {
      name: form.name.value.trim(), email: form.email.value.trim(), phone: form.phone.value.trim(),
      service: service,
      message: `ORDER REQUEST — ${title}\n${lines.map((l) => `• ${l}`).join('\n')}` +
        `${form.company.value.trim() ? `\n\nBusiness: ${form.company.value.trim()}` : ''}` +
        `${form.notes.value.trim() ? `\n\nNotes: ${form.notes.value.trim()}` : ''}`,
    };
    const res = await submitEnquiry(data);
    btn.disabled = false; btn.textContent = 'Send order request';
    if (res.ok) {
      form.querySelector('.form-grid').hidden = true;
      form.querySelector('.order-actions').hidden = true;
      status.className = 'form-status ok';
      status.textContent = 'Order received. We’ll confirm availability and send your invoice — usually the same day.';
    } else {
      status.className = 'form-status err';
      status.innerHTML = `We couldn’t send that automatically. Please <a href="${esc(whatsappLink(summaryText(data)))}" target="_blank" rel="noopener">send it on WhatsApp</a> or <a href="${esc(mailtoLink(`Order: ${title}`, summaryText(data)))}">by email</a>.`;
    }
  });
  d.showModal();
  form.name.focus();
}
