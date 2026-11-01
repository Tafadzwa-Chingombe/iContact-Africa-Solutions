// Shared: send an enquiry/order to the admin console's "Enquiries" inbox.
// Falls back gracefully (WhatsApp / email) if the portal isn't configured yet.
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPPORT_EMAIL } from '../../portal/js/config.js';

export const WHATSAPP_NUMBER = '263718574277';
export const isConfigured = !SUPABASE_URL.includes('YOUR-PROJECT-REF');

export const whatsappLink = (text) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

export const mailtoLink = (subject, body) =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

/**
 * Save an enquiry. `data` = { name, email, phone?, service?, budget?, message }.
 * Resolves to { ok: true } when saved, or { ok: false, reason } so callers can
 * offer WhatsApp/email instead. Never throws.
 */
export async function submitEnquiry(data) {
  if (!isConfigured) return { ok: false, reason: 'not-configured' };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/enquiries`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        name: data.name, email: data.email, phone: data.phone || null,
        service: data.service || null, budget: data.budget || null, message: data.message,
      }),
    });
    return res.ok ? { ok: true } : { ok: false, reason: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/** Plain-text summary used for WhatsApp / email fallbacks. */
export const summaryText = (data) =>
  `Name: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone || '-'}\nService: ${data.service || '-'}` +
  `${data.budget ? `\nBudget: ${data.budget}` : ''}\n\n${data.message}`;
