// Supabase Edge Function: paynow
// Paynow checkout for iContact Academy courses (https://developers.paynow.co.zw).
//
// Called by the website (JSON, no login needed):
//   { action: 'config' }                                   → { enabled, methods }
//   { action: 'start', slug, full_name, email, phone,
//     method: 'web' | 'ecocash' | 'onemoney', mobile? }     → { payment_id, redirect_url? | instructions? }
//   { action: 'check', payment_id }                        → { status, paid, login_link? | existing_account? }
// Called by Paynow (form POST to the result URL):           status update → verify hash → fulfil
//
// On payment the buyer's student login is created (or their existing account reused),
// the course is unlocked, and an approved row appears in Admin → Academy.
//
// Secrets (Supabase → Edge Functions → Secrets — never in website files):
//   PAYNOW_INTEGRATION_ID, PAYNOW_INTEGRATION_KEY   from Paynow → Receive Payment Links → 3rd party integration
//   PAYNOW_CURRENCY   optional, default USD (must match the integration's currency)
//   PAYNOW_MODE       set to 'test' only while the integration is in Paynow TEST MODE; then
//   PAYNOW_AUTH_EMAIL (the merchant's Paynow email) is sent instead of the buyer's, as Paynow requires.
//   SITE_URL          optional, default https://tafadzwa-chingombe.github.io/iContact-Africa-Solutions/
// Deploy:  supabase functions deploy paynow --no-verify-jwt   (Paynow can't send a Supabase token)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const env = (k: string) => Deno.env.get(k) || '';
const SITE = (env('SITE_URL') || 'https://tafadzwa-chingombe.github.io/iContact-Africa-Solutions/').replace(/\/?$/, '/');
const FN_URL = `${env('SUPABASE_URL')}/functions/v1/paynow`;
const CURRENCY = env('PAYNOW_CURRENCY') || 'USD';
// PAYNOW_AUTH_EMAIL is only used when PAYNOW_MODE=test (Paynow test mode needs the merchant's email)
const TEST_MODE = env('PAYNOW_MODE').toLowerCase() === 'test';
const configured = () => !!(env('PAYNOW_INTEGRATION_ID') && env('PAYNOW_INTEGRATION_KEY'));
const URL_WEB = 'https://www.paynow.co.zw/interface/initiatetransaction';
const URL_MOBILE = 'https://www.paynow.co.zw/interface/remotetransaction';
const PAID = new Set(['paid', 'awaiting delivery', 'delivered']);
const FAILED = new Set(['cancelled', 'failed', 'disputed', 'refunded']);
type Row = Record<string, any>;
type DB = ReturnType<typeof createClient>;
let relayClient: DB | null = null;
const relay = () => (relayClient ||= createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } }));

// ---------- Paynow protocol (as in Paynow's official SDKs) ---------------------------------
// hash = UPPER(SHA512(all values in order, except "hash") + integration key)
async function sha512(s: string) {
  const buf = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
const hashOf = (pairs: [string, string][]) =>
  sha512(pairs.filter(([k]) => k.toLowerCase() !== 'hash').map(([, v]) => v).join('') + env('PAYNOW_INTEGRATION_KEY'));

async function verified(params: URLSearchParams) {
  const got = (params.get('hash') || '').toUpperCase();
  return !!got && got === await hashOf([...params.entries()]);
}

async function paynowPost(url: string, pairs: [string, string][] | null) {
  let body: URLSearchParams | undefined;
  if (pairs) {
    pairs.push(['hash', await hashOf(pairs)]);
    body = new URLSearchParams(pairs);
  }
  // Paynow resets TLS connections from Edge Functions, so the request goes out through the
  // database (public.paynow_post, pgsql-http) — locked to paynow.co.zw, service role only.
  const { data, error } = await relay().rpc('paynow_post', { p_url: url, p_body: body ? body.toString() : '' });
  if (error) throw new Error(`Couldn’t reach Paynow: ${error.message}`);
  const reply = Array.isArray(data) ? data[0] : data;
  if (!reply || reply.status >= 400) throw new Error(`Paynow HTTP ${reply?.status ?? 'no response'}`);
  const params = new URLSearchParams(String(reply.content || '').trim());
  const status = (params.get('status') || '').toLowerCase();
  if (status === 'error') throw new Error(params.get('error') || 'Paynow returned an error');
  if (!await verified(params)) throw new Error('Paynow response failed the security check (hash mismatch) — check PAYNOW_INTEGRATION_KEY.');
  return params;
}

// ---------- helpers ------------------------------------------------------------------------------
const mobileNumber = (p: string) => {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('263')) d = `0${d.slice(3)}`;
  return /^07\d{8}$/.test(d) ? d : '';
};
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const newRef = () => `ACAD-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
const returnUrlFor = (slug: string, id: string) => `${SITE}course.html?slug=${encodeURIComponent(slug)}&payment=${id}`;

// Record Paynow's latest status; fulfil once paid. Safe to call many times.
async function applyStatus(db: DB, pay: Row, params: URLSearchParams) {
  const status = (params.get('status') || '').toLowerCase();
  if (params.get('reference') && params.get('reference') !== pay.reference) throw new Error('Reference mismatch');
  const paid = PAID.has(status);
  if (paid && params.get('amount') && Math.abs(Number(params.get('amount')) - Number(pay.amount)) > 0.009) {
    await db.from('payments').update({ status: 'amount_mismatch', error: `Paid ${params.get('amount')}, expected ${pay.amount}` }).eq('id', pay.id);
    return { ...pay, status: 'amount_mismatch' };
  }
  const patch: Row = { status, paynow_reference: params.get('paynowreference') || pay.paynow_reference };
  if (paid && !pay.paid_at) patch.paid_at = new Date().toISOString();
  const { data } = await db.from('payments').update(patch).eq('id', pay.id).select().single();
  const row = data || { ...pay, ...patch };
  if (paid) return await fulfil(db, row);
  return row;
}

async function fulfil(db: DB, pay: Row) {
  // Claim the job so a status update and a browser check can't both fulfil
  const { data: claimed } = await db.from('payments').update({ fulfilled_at: new Date().toISOString() })
    .eq('id', pay.id).is('fulfilled_at', null).select().maybeSingle();
  if (!claimed) return (await db.from('payments').select('*').eq('id', pay.id).single()).data;
  try {
    const { data: prof } = await db.from('profiles').select('id, phone').ilike('email', pay.email).maybeSingle();
    let userId = prof?.id;
    const existing = !!prof;
    if (!userId) {
      const { data: created, error } = await db.auth.admin.createUser({
        email: pay.email, email_confirm: true,
        user_metadata: { full_name: pay.full_name, phone: pay.phone, role: 'student' },
      });
      if (error) throw error;
      userId = created.user.id;
      if (pay.phone) await db.from('profiles').update({ phone: pay.phone, full_name: pay.full_name }).eq('id', userId);
    } else if (pay.phone && !prof.phone) {
      await db.from('profiles').update({ phone: pay.phone }).eq('id', userId);
    }
    const { data: enr, error: e1 } = await db.from('enrollments').upsert({
      course_id: pay.course_id, user_id: userId, status: 'active', amount: pay.amount, currency: pay.currency,
      pay_method: 'paynow', pay_reference: pay.paynow_reference || pay.reference,
    }, { onConflict: 'course_id,user_id' }).select('id').single();
    if (e1) throw e1;
    const { data: order, error: e2 } = await db.from('academy_orders').insert({
      course_id: pay.course_id, full_name: pay.full_name, email: pay.email, phone: pay.phone,
      pay_method: 'paynow', pay_reference: pay.paynow_reference || pay.reference,
      message: `Paid online with Paynow (${pay.method === 'web' ? 'checkout page' : pay.method}). Access given automatically.`,
      status: 'approved', enrollment_id: enr.id,
    }).select('id').single();
    if (e2) throw e2;
    const { data } = await db.from('payments').update({ enrollment_id: enr.id, order_id: order.id, existing_account: existing, error: null })
      .eq('id', pay.id).select().single();
    return data;
  } catch (e) {
    const msg = (e as Error).message || String(e);
    await db.from('payments').update({ fulfilled_at: null, error: `Access not given yet: ${msg}` }).eq('id', pay.id);
    console.error('fulfil failed', pay.id, msg);
    return { ...pay, error: msg };
  }
}

// ---------- actions ------------------------------------------------------------------------------
async function start(db: DB, b: Row) {
  if (b.company_website) return { error: 'Rejected' }; // honeypot
  const full_name = String(b.full_name || '').trim().slice(0, 120);
  const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
  const phone = String(b.phone || '').trim().slice(0, 40) || null;
  const method = ['web', 'ecocash', 'onemoney'].includes(b.method) ? b.method : '';
  if (full_name.length < 2 || !emailOk(email) || !method) return { error: 'Please add your name, a valid email and how you want to pay.' };
  const mobile = method === 'web' ? '' : mobileNumber(b.mobile || b.phone);
  if (method !== 'web' && !mobile) return { error: `Enter the ${method === 'ecocash' ? 'EcoCash (Econet)' : 'OneMoney (NetOne)'} number to pay from, e.g. 0771234567.` };

  const { data: course } = await db.from('courses').select('id, slug, title, price, currency, status').eq('slug', String(b.slug || '')).maybeSingle();
  if (!course || course.status !== 'published') return { error: 'This course isn’t open for enrolment.' };
  if (course.currency !== CURRENCY) return { error: `Online payment is only set up for ${CURRENCY}.` };

  // Light abuse guard: max 6 attempts per email per 30 minutes
  const since = new Date(Date.now() - 30 * 60e3).toISOString();
  const { count } = await db.from('payments').select('id', { count: 'exact', head: true }).eq('email', email).gte('created_at', since);
  if ((count || 0) >= 6) return { error: 'Too many attempts — please wait a few minutes or WhatsApp us.' };

  const reference = newRef();
  const amount = Number(course.price).toFixed(2);
  const { data: pay, error } = await db.from('payments').insert({
    reference, course_id: course.id, full_name, email, phone: phone || (mobile || null), amount, currency: course.currency, method,
  }).select().single();
  if (error) throw error;

  const pairs: [string, string][] = [
    ['resulturl', FN_URL],
    ['returnurl', returnUrlFor(course.slug, pay.id)],
    ['reference', reference],
    ['amount', amount],
    ['id', env('PAYNOW_INTEGRATION_ID')],
    ['additionalinfo', `iContact Academy: ${course.title}`.slice(0, 120)],
    ['authemail', (TEST_MODE && env('PAYNOW_AUTH_EMAIL')) || email],
  ];
  if (method !== 'web') pairs.push(['phone', mobile], ['method', method]);
  pairs.push(['status', 'Message']);

  try {
    const out = await paynowPost(method === 'web' ? URL_WEB : URL_MOBILE, pairs);
    await db.from('payments').update({ status: 'sent', poll_url: out.get('pollurl'), paynow_reference: out.get('paynowreference') }).eq('id', pay.id);
    return {
      payment_id: pay.id,
      redirect_url: method === 'web' ? out.get('browserurl') : undefined,
      instructions: method !== 'web' ? (out.get('instructions') || `Check your phone: approve the ${method === 'ecocash' ? 'EcoCash' : 'OneMoney'} prompt with your PIN.`) : undefined,
    };
  } catch (e) {
    const msg = (e as Error).message;
    await db.from('payments').update({ status: 'failed', error: msg }).eq('id', pay.id);
    return { error: `Paynow couldn’t start the payment: ${msg}` };
  }
}

async function check(db: DB, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Unknown payment' };
  let { data: pay } = await db.from('payments').select('*').eq('id', id).maybeSingle();
  if (!pay) return { error: 'Unknown payment' };
  const settled = PAID.has(pay.status) || FAILED.has(pay.status);
  if (!settled && pay.poll_url && Date.now() - new Date(pay.created_at).getTime() < 48 * 3600e3) {
    try { pay = await applyStatus(db, pay, await paynowPost(pay.poll_url, null)); } catch (e) { console.error('poll failed', (e as Error).message); }
  } else if (PAID.has(pay.status) && !pay.enrollment_id) {
    pay = await fulfil(db, pay); // retry a failed fulfilment
  }
  const paid = PAID.has(pay.status);
  const out: Row = { status: pay.status, paid, failed: FAILED.has(pay.status), ready: !!pay.enrollment_id, email: pay.email };
  if (paid && pay.enrollment_id) {
    const { data: c } = await db.from('courses').select('title, slug').eq('id', pay.course_id).maybeSingle();
    out.course = c;
    if (pay.existing_account) {
      out.existing_account = true; // never hand a login link for an account the payer may not own
    } else if (pay.login_links_sent < 3 && Date.now() - new Date(pay.paid_at || pay.updated_at).getTime() < 24 * 3600e3) {
      const { data: link } = await db.auth.admin.generateLink({ type: 'recovery', email: pay.email, options: { redirectTo: `${SITE}portal/login.html` } });
      if (link?.properties?.action_link) {
        out.login_link = link.properties.action_link;
        await db.from('payments').update({ login_links_sent: pay.login_links_sent + 1 }).eq('id', pay.id);
      }
    }
  }
  return out;
}

// Paynow's status update (form POST to resulturl)
async function statusUpdate(db: DB, raw: string) {
  const params = new URLSearchParams(raw.trim());
  if (!await verified(params)) { console.error('status update: bad hash'); return; }
  const { data: pay } = await db.from('payments').select('*').eq('reference', params.get('reference') || '').maybeSingle();
  if (!pay) { console.error('status update: unknown reference', params.get('reference')); return; }
  // Double-check with Paynow before trusting a "paid" notice
  const confirmed = pay.poll_url && PAID.has((params.get('status') || '').toLowerCase()) ? await paynowPost(pay.poll_url, null) : params;
  await applyStatus(db, pay, confirmed);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  const type = req.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    // Paynow → result URL
    if (!configured()) return new Response('not configured', { status: 503 });
    try { await statusUpdate(db, await req.text()); } catch (e) { console.error('status update failed', (e as Error).message); }
    return new Response('OK');
  }

  const body = await req.json().catch(() => ({}));
  if (body.action === 'config') return json({ enabled: configured(), currency: CURRENCY, methods: ['ecocash', 'onemoney', 'web'] });
  if (!configured()) return json({ error: 'Online payment isn’t switched on yet.' }, 400);
  try {
    if (body.action === 'start') { const r = await start(db, body); return json(r, r.error ? 400 : 200); }
    if (body.action === 'check') { const r = await check(db, String(body.payment_id || '')); return json(r, r.error ? 404 : 200); }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong starting the payment. Please try again or WhatsApp us.' }, 500);
  }
});
