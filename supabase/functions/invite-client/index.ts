// Supabase Edge Function: invite-client
// Lets an admin invite a client from the portal's admin console.
// The service-role key stays server-side (Supabase injects it automatically).
//
// Deploy:  supabase functions deploy invite-client
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1. Who is calling? Must be a signed-in admin.
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Not signed in' }, 401);
  const { data: caller } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (caller?.role !== 'admin') return json({ error: 'Admins only' }, 403);

  // 2. Validate input. `invite: false` creates a billing-only client (no email sent yet).
  const { email, full_name, company, phone, redirectTo, invite = true } = await req.json().catch(() => ({}));
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Valid email required' }, 400);
  const meta = { full_name: full_name || '', company: company || '' };

  // Already has an account? Return it (and send a sign-in link if an invite was asked for).
  const { data: existing } = await admin.from('profiles').select('id, role').ilike('email', email).maybeSingle();
  if (existing) {
    if (invite) {
      const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
      const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
      if (error) return json({ error: error.message }, 400);
    }
    return json({ id: existing.id, email, existing: true, invited: !!invite });
  }

  // 3. Create the account. The DB trigger creates the profile row from this metadata.
  const { data, error } = invite
    ? await admin.auth.admin.inviteUserByEmail(email, { data: meta, redirectTo })
    : await admin.auth.admin.createUser({ email, user_metadata: meta, email_confirm: false });
  if (error) return json({ error: error.message }, 400);
  if (phone && data.user) await admin.from('profiles').update({ phone }).eq('id', data.user.id);

  return json({ id: data.user?.id, email, invited: !!invite });
});
