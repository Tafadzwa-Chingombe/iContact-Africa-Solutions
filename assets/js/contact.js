// Contact form: saves enquiries to Supabase (the admin console's "Enquiries" inbox).
// Falls back to opening the visitor's email app if the portal isn't configured yet.
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPPORT_EMAIL } from '../../portal/js/config.js';

const form = document.getElementById('contact-form');
const status = form?.querySelector('.form-status');
const configured = !SUPABASE_URL.includes('YOUR-PROJECT-REF');

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

  try {
    if (!configured) throw new Error('not-configured');
    const res = await fetch(`${SUPABASE_URL}/rest/v1/enquiries`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    form.reset();
    show('Thanks — your message has been received. Tafadzwa will get back to you the same day.', true);
  } catch (err) {
    // Fallback so no lead is ever lost: open the visitor's email app pre-filled.
    const body = `Name: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone || '-'}\nService: ${data.service || '-'}\nBudget: ${data.budget || '-'}\n\n${data.message}`;
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Website enquiry — ${data.service || 'General'}`)}&body=${encodeURIComponent(body)}`;
    show('Opening your email app to send this — or WhatsApp us on +263 71 857 4277.', true);
  } finally {
    btn.disabled = false;
  }
});
