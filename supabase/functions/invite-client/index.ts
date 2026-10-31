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

  // 2. Validate input.
  const { email, full_name, company, redirectTo } = await req.json().catch(() => ({}));
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Valid email required' }, 400);

  // 3. Send the invite. The DB trigger creates the profile row from this metadata.
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: full_name || '', company: company || '' },
    redirectTo,
  });
  if (error) return json({ error: error.message }, 400);

  return json({ id: data.user?.id, email });
});
