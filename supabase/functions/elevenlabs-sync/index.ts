// Supabase Edge Function: elevenlabs-sync
// Copies conversations with Nyasha (ElevenLabs voice/chat assistant) into Admin Console → AI calls.
//
//   { action: 'status' }                    → is ElevenLabs configured? last sync time
//   { action: 'sync', full?: true }         → import new calls (full: re-check the last 300)
//   { action: 'audio', conversation_id }    → the call recording (audio/mpeg), streamed from ElevenLabs
//
// Secrets (Supabase → Edge Functions → Secrets — never in website files):
//   ELEVENLABS_API_KEY  — an ElevenLabs API key with "ElevenAgents: Read" access
//   ELEVENLABS_AGENT_ID — optional; defaults to the website assistant (Nyasha)
// Deploy:  supabase functions deploy elevenlabs-sync
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const env = (k: string) => Deno.env.get(k) || '';
const API = 'https://api.elevenlabs.io/v1/convai';
const AGENT = () => env('ELEVENLABS_AGENT_ID') || 'agent_0101m6ntdac3e89s6m1wz7a49hgr';
type Row = Record<string, any>;

async function el(path: string): Promise<Response> {
  const res = await fetch(`${API}${path}`, { headers: { 'xi-api-key': env('ELEVENLABS_API_KEY') } });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) throw new Error('ElevenLabs refused the API key — check ELEVENLABS_API_KEY and that it has ElevenAgents read access.');
    throw new Error(`ElevenLabs ${res.status}: ${msg.slice(0, 200)}`);
  }
  return res;
}

// Data-collection values: ElevenLabs returns {value} per field; ignore blanks and "not given"
const val = (d: Row, k: string) => {
  const v = d?.[k]?.value;
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return !s || /^(not given|none|n\/a|unknown)$/i.test(s) ? null : s;
};

function mapCall(c: Row): Row {
  const a = c.analysis || {};
  const d = a.data_collection_results || {};
  const m = c.metadata || {};
  const data: Row = {};
  Object.entries(d).forEach(([k, x]: [string, any]) => { data[k] = x?.value ?? null; });
  const evaluations: Row = {};
  Object.entries(a.evaluation_criteria_results || {}).forEach(([k, x]: [string, any]) => { evaluations[k] = { result: x?.result, why: x?.rationale }; });
  const transcript = (c.transcript || [])
    .filter((t: Row) => t.message && String(t.message).trim())
    .map((t: Row) => ({ role: t.role, message: t.message, t: t.time_in_call_secs ?? null }));
  return {
    conversation_id: c.conversation_id,
    agent_id: c.agent_id,
    started_at: new Date((m.start_time_unix_secs || 0) * 1000).toISOString(),
    duration_secs: m.call_duration_secs || 0,
    status: c.status,
    channel: m.conversation_initiation_source || c.conversation_initiation_client_data?.source_info?.source || null,
    call_successful: a.call_successful || null,
    title: a.call_summary_title || null,
    summary: a.transcript_summary || null,
    contact_name: val(d, 'contact_name'),
    business_name: val(d, 'business_name'),
    phone: val(d, 'phone_whatsapp'),
    email: val(d, 'email'),
    service: val(d, 'service_needed'),
    budget: val(d, 'budget_range'),
    preferred_slot: val(d, 'preferred_slot'),
    outcome: val(d, 'outcome'),
    follow_up_notes: val(d, 'follow_up_notes'),
    do_not_call: d?.do_not_call?.value === true || String(d?.do_not_call?.value).toLowerCase() === 'true',
    sentiment: a.sentiment_analysis?.overall_label || null,
    rating: m.feedback?.rating ?? null,
    cost_usd: typeof m.cost_fiat === 'number' ? Math.round(m.cost_fiat * 10000) / 10000 : null,
    has_audio: !!c.has_audio,
    transcript, data, evaluations,
    synced_at: new Date().toISOString(),
  };
}

const SERVICE: Row = { 'new website': 'Website', redesign: 'Website redesign', 'e-commerce': 'E-commerce', seo: 'SEO', 'paid ads': 'Paid Advertising',
  'social media': 'Social Media / GMB', branding: 'Brand & Design', 'domains/hosting/email': 'Domains / Hosting / Email', 'existing client support': 'Support' };

async function sync(db: ReturnType<typeof createClient>, full: boolean) {
  const { data: known } = await db.from('ai_calls').select('conversation_id, status, enquiry_id');
  const have = new Map((known || []).map((r: Row) => [r.conversation_id, r]));
  const ids: string[] = [];
  let cursor = ''; let stop = false;
  for (let page = 0; page < (full ? 3 : 10) && !stop; page++) {
    const q = new URLSearchParams({ agent_id: AGENT(), page_size: '100' });
    if (cursor) q.set('cursor', cursor);
    const out = await (await el(`/conversations?${q}`)).json();
    for (const c of out.conversations || []) {
      const prev = have.get(c.conversation_id);
      if (prev?.status === 'done' && !full) { stop = true; break; }       // newest-first: the rest are already imported
      if (prev?.status === 'done') continue;
      if (!c.message_count) continue;                                     // dropped connections with nothing said
      if (['initiated', 'in-progress', 'processing'].includes(c.status)) continue; // pick up next sync, once analysed
      ids.push(c.conversation_id);
    }
    if (!out.has_more || !out.next_cursor) break;
    cursor = out.next_cursor;
  }

  let imported = 0, leads = 0;
  for (const id of ids.slice(0, 60)) {                                     // keep one sync under the function time limit
    const row = mapCall(await (await el(`/conversations/${encodeURIComponent(id)}`)).json());
    // Lead → Enquiries (once), unless they asked not to be contacted
    if ((row.phone || row.email) && !row.do_not_call && !have.get(id)?.enquiry_id) {
      const who = row.contact_name || row.business_name || row.phone || row.email;
      const message = [row.summary, row.preferred_slot ? `Preferred call time: ${row.preferred_slot}` : '', row.follow_up_notes && row.follow_up_notes !== row.summary ? `Notes: ${row.follow_up_notes}` : '']
        .filter(Boolean).join('\n\n') || 'Lead captured by the AI assistant.';
      const { data: enq, error } = await db.from('enquiries').insert({
        name: row.business_name && row.contact_name ? `${row.contact_name} (${row.business_name})` : who,
        email: row.email, phone: row.phone, service: SERVICE[String(row.service || '').toLowerCase()] || row.service, budget: row.budget,
        message, source: 'ai_call', ai_call_id: id, created_at: row.started_at,
      }).select('id').single();
      if (!error) { row.enquiry_id = enq.id; leads++; }
    }
    const { error } = await db.from('ai_calls').upsert(row, { onConflict: 'conversation_id' });
    if (error) throw new Error(error.message);
    imported++;
  }
  return { imported, leads, more: ids.length > 60 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await db.auth.getUser(jwt);
  if (!user) return json({ error: 'Not signed in' }, 401);
  const { data: caller } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (caller?.role !== 'admin') return json({ error: 'Admins only' }, 403);

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'status';
  const configured = !!env('ELEVENLABS_API_KEY');

  if (action === 'status') {
    const { data } = await db.from('ai_calls').select('synced_at').order('synced_at', { ascending: false }).limit(1);
    return json({ configured, last_synced_at: data?.[0]?.synced_at || null });
  }
  if (!configured) return json({ error: 'ElevenLabs is not connected yet — add the ELEVENLABS_API_KEY secret (see setup guide).' }, 400);

  try {
    if (action === 'sync') return json(await sync(db, !!body.full));
    if (action === 'audio') {
      const id = String(body.conversation_id || '');
      if (!/^conv_[A-Za-z0-9]+$/.test(id)) return json({ error: 'Bad conversation id' }, 400);
      const res = await el(`/conversations/${id}/audio`);
      return new Response(res.body, { headers: { ...cors, 'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg', 'Cache-Control': 'private, max-age=600' } });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
