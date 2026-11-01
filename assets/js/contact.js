// Contact form: saves enquiries to the admin "Enquiries" inbox (see enquiry.js).
// Falls back to the visitor's email app if the portal isn't configured yet.
import { submitEnquiry, mailtoLink, summaryText } from './enquiry.js';

const form = document.getElementById('contact-form');
const status = form?.querySelector('.form-status');

// Prefill from ?service=…&email=… (hero quick-quote, pricing buttons)
const params = new URLSearchParams(location.search);
if (form) {
  const svc = params.get('service');
  if (svc) {
    const opt = [...form.service.options].find((o) => o.value.toLowerCase() === svc.toLowerCase() || o.text.toLowerCase() === svc.toLowerCase());
    if (opt) form.service.value = opt.value;
    else form.service.add(new Option(svc, svc, true, true));
  }
  if (params.get('email')) form.email.value = params.get('email');
  if (svc || params.get('email')) form.name.focus({ preventScroll: true });
}

const show = (msg, ok) => { status.textContent = msg; status.className = `form-status ${ok ? 'ok' : 'err'}`; };

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  if (form.company_website.value) return; // honeypot: bots fill hidden fields

  const data = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim() || null,
    service: form.service.value || null,
    budget: form.budget.value || null,
    message: form.message.value.trim(),
  };
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  const res = await submitEnquiry(data);
  btn.disabled = false;
  if (res.ok) {
    form.reset();
    show('Thanks — your message has been received. Tafadzwa will get back to you the same day.', true);
  } else {
    // No lead is ever lost: open the visitor's email app pre-filled.
    window.location.href = mailtoLink(`Website enquiry — ${data.service || 'General'}`, summaryText(data));
    show('Opening your email app to send this — or WhatsApp us on +263 71 857 4277.', true);
  }
});
