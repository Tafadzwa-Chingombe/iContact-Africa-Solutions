// Supabase Edge Function: zoho-sync
// Keeps Admin Console → Billing in sync with Zoho Invoice.
//
//   { action: 'status' }              → is Zoho configured? last sync time
//   { action: 'pull' }                → import / update every Zoho invoice into the portal
//   { action: 'push', invoice_id }    → create a portal invoice in Zoho (and link it)
//   { action: 'payment', invoice_id } → record a portal "Mark paid" as a Zoho payment
//
// Secrets (Supabase → Edge Functions → Secrets — never in website files):
//   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN
//   ZOHO_ORG_ID — optional; without it Zoho uses your default organisation
//   ZOHO_DC  — your Zoho data centre domain: com (default), eu, in, com.au, jp, ca, sa, uk
// Deploy:  supabase functions deploy zoho-sync
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const env = (k: string) => Deno.env.get(k) || '';
const DC = env('ZOHO_DC') || 'com';
const API = `https://www.zohoapis.${DC}/invoice/v3`;
const configured = () => ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN'].every((k) => env(k));

// ---------- Zoho API ---------------------------------------------------------
let token = '';
async function accessToken() {
  if (token) return token;
  const q = new URLSearchParams({
    refresh_token: env('ZOHO_REFRESH_TOKEN'), client_id: env('ZOHO_CLIENT_ID'),
    client_secret: env('ZOHO_CLIENT_SECRET'), grant_type: 'refresh_token',
  });
  const res = await fetch(`https://accounts.zoho.${DC}/oauth/v2/token?${q}`, { method: 'POST' });
  const out = await res.json();
  if (!out.access_token) throw new Error(`Zoho sign-in failed: ${out.error || res.status}. Check the ZOHO_* secrets and ZOHO_DC.`);
  return (token = out.access_token);
}

async function zoho(path: string, init: RequestInit = {}) {
  const org = env('ZOHO_ORG_ID');
  const url = org ? `${API}${path}${path.includes('?') ? '&' : '?'}organization_id=${org}` : `${API}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || (out.code !== undefined && out.code !== 0)) throw new Error(`Zoho: ${out.message || res.status}`);
  return out;
}

async function zohoAll(path: string, key: string) {
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; page <= 50; page++) {
    const out = await zoho(`${path}?page=${page}&per_page=200`);
    rows.push(...(out[key] || []));
    if (!out.page_context?.has_more_page) break;
  }
  return rows;
}

// Zoho status → portal status
const STATUS: Record<string, string> = {
  draft: 'draft', paid: 'paid', void: 'void', overdue: 'overdue',
  sent: 'unpaid', viewed: 'unpaid', unpaid: 'unpaid', partially_paid: 'unpaid', pending: 'unpaid',
};
const lower = (s: unknown) => String(s || '').trim().toLowerCase();

// ---------- handler ----------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  // Admins only
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await db.auth.getUser(jwt);
  if (!user) return json({ error: 'Not signed in' }, 401);
  const { data: caller } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (caller?.role !== 'admin') return json({ error: 'Admins only' }, 403);

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'status';

  if (action === 'status') {
    const { data } = await db.from('invoices').select('synced_at').not('synced_at', 'is', null)
      .order('synced_at', { ascending: false }).limit(1);
    return json({ configured: configured(), dc: DC, last_synced_at: data?.[0]?.synced_at || null });
  }
  if (!configured()) return json({ error: 'Zoho Invoice is not connected yet — add the ZOHO_* secrets (see setup guide).' }, 400);

  try {
    if (action === 'pull') return json(await pull(db));
    if (action === 'push') return json(await push(db, body.invoice_id));
    if (action === 'payment') return json(await payment(db, body.invoice_id));
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});

// Import every Zoho invoice. Zoho is the source of truth for anything it owns.
async function pull(db: ReturnType<typeof createClient>) {
  const [invoices, contacts] = await Promise.all([zohoAll('/invoices', 'invoices'), zohoAll('/contacts', 'contacts')]);
  const { data: profiles } = await db.from('profiles').select('id, email, company, zoho_contact_id').eq('role', 'client');

  // Map Zoho customers → portal clients: saved link first, then matching email.
  const byZoho = new Map((profiles || []).filter((p) => p.zoho_contact_id).map((p) => [p.zoho_contact_id, p.id]));
  const byEmail = new Map((profiles || []).filter((p) => p.email).map((p) => [lower(p.email), p.id]));
  const contactEmail = new Map(contacts.map((c) => [String(c.contact_id), lower(c.email)]));
  let linked = 0;
  for (const c of contacts) {
    const id = String(c.contact_id);
    const pid = byEmail.get(lower(c.email));
    if (pid && !byZoho.has(id) && !(profiles || []).find((p) => p.id === pid)?.zoho_contact_id) {
      await db.from('profiles').update({ zoho_contact_id: id }).eq('id', pid);
      byZoho.set(id, pid); linked++;
    }
  }

  const now = new Date().toISOString();
  const { data: existing } = await db.from('invoices').select('id, number, zoho_invoice_id, client_id');
  const byZid = new Map((existing || []).filter((i) => i.zoho_invoice_id).map((i) => [i.zoho_invoice_id, i]));
  const byNumber = new Map((existing || []).filter((i) => !i.zoho_invoice_id).map((i) => [i.number, i]));

  let created = 0, updated = 0;
  for (const z of invoices) {
    const zid = String(z.invoice_id);
    const cid = String(z.customer_id || '');
    const row = {
      number: String(z.invoice_number),
      description: (z.reference_number as string) || null,
      amount: Number(z.total || 0),
      balance: Number(z.balance ?? 0),
      currency: String(z.currency_code || 'USD'),
      status: STATUS[lower(z.status)] || 'unpaid',
      issued_on: z.date || null,
      due_on: z.due_date || null,
      paid_on: lower(z.status) === 'paid' ? (z.last_payment_date || z.date || null) : null,
      pay_url: (z.invoice_url as string) || null,
      zoho_invoice_id: zid,
      zoho_customer_id: cid,
      customer_name: (z.customer_name as string) || (z.company_name as string) || null,
      customer_email: (z.email as string) || contactEmail.get(cid) || null,
      synced_at: now,
    };
    const client_id = byZoho.get(cid) || byEmail.get(lower(row.customer_email)) || null;
    const match = byZid.get(zid) || byNumber.get(row.number);
    if (match) {
      // Keep a client link the admin set by hand; otherwise use the Zoho mapping.
      const patch = { ...row, client_id: match.client_id || client_id };
      const { error } = await db.from('invoices').update(patch).eq('id', match.id);
      if (error) throw new Error(`${row.number}: ${error.message}`);
      updated++;
    } else {
      const { error } = await db.from('invoices').insert({ ...row, client_id, source: 'zoho' });
      if (error) throw new Error(`${row.number}: ${error.message}`);
      created++;
    }
  }
  return { ok: true, created, updated, linked_clients: linked, total: invoices.length, synced_at: now };
}

// Create (or find) the Zoho contact for a portal client.
async function contactFor(db: ReturnType<typeof createClient>, clientId: string) {
  const { data: p } = await db.from('profiles').select('*').eq('id', clientId).single();
  if (!p) throw new Error('Client not found');
  if (p.zoho_contact_id) return p.zoho_contact_id;
  if (p.email) {
    const found = await zoho(`/contacts?email=${encodeURIComponent(p.email)}`);
    const hit = (found.contacts || [])[0];
    if (hit) { await db.from('profiles').update({ zoho_contact_id: String(hit.contact_id) }).eq('id', p.id); return String(hit.contact_id); }
  }
  const [first, ...rest] = String(p.full_name || '').split(' ');
  const out = await zoho('/contacts', {
    method: 'POST',
    body: JSON.stringify({
      contact_name: p.company || p.full_name || p.email, company_name: p.company || '',
      contact_persons: [{ first_name: first || '', last_name: rest.join(' '), email: p.email || '', phone: p.phone || '', is_primary_contact: true }],
    }),
  });
  const id = String(out.contact.contact_id);
  await db.from('profiles').update({ zoho_contact_id: id }).eq('id', p.id);
  return id;
}

// Send a portal-made invoice to Zoho. Zoho numbers it; the portal adopts that number.
async function push(db: ReturnType<typeof createClient>, invoiceId: string) {
  const { data: inv } = await db.from('invoices').select('*').eq('id', invoiceId).single();
  if (!inv) throw new Error('Invoice not found');
  if (inv.zoho_invoice_id) return { ok: true, already: true, number: inv.number };
  if (!inv.client_id) throw new Error('Pick a client for this invoice first');
  const customer_id = await contactFor(db, inv.client_id);
  const out = await zoho('/invoices', {
    method: 'POST',
    body: JSON.stringify({
      customer_id, date: inv.issued_on, due_date: inv.due_on || undefined, reference_number: inv.number,
      line_items: [{ name: inv.description || `Invoice ${inv.number}`, description: inv.description || '', rate: Number(inv.amount), quantity: 1 }],
    }),
  });
  const z = out.invoice;
  const patch = {
    zoho_invoice_id: String(z.invoice_id), zoho_customer_id: customer_id, number: String(z.invoice_number),
    pay_url: inv.pay_url || z.invoice_url || null, balance: Number(z.balance ?? inv.amount), synced_at: new Date().toISOString(),
  };
  const { error } = await db.from('invoices').update(patch).eq('id', inv.id);
  if (error) throw new Error(error.message);
  return { ok: true, number: patch.number };
}

// Mirror "Mark paid" in Zoho by recording a payment for the outstanding balance.
async function payment(db: ReturnType<typeof createClient>, invoiceId: string) {
  const { data: inv } = await db.from('invoices').select('*').eq('id', invoiceId).single();
  if (!inv?.zoho_invoice_id) return { ok: true, skipped: 'not a Zoho invoice' };
  const z = (await zoho(`/invoices/${inv.zoho_invoice_id}`)).invoice;
  const due = Number(z.balance || 0);
  if (due <= 0) return { ok: true, skipped: 'already paid in Zoho' };
  await zoho('/customerpayments', {
    method: 'POST',
    body: JSON.stringify({
      customer_id: z.customer_id, payment_mode: 'cash', amount: due,
      date: inv.paid_on || new Date().toISOString().slice(0, 10),
      invoices: [{ invoice_id: inv.zoho_invoice_id, amount_applied: due }],
      description: 'Recorded from the iContact client portal',
    }),
  });
  await db.from('invoices').update({ balance: 0, synced_at: new Date().toISOString() }).eq('id', inv.id);
  return { ok: true, recorded: due };
}
