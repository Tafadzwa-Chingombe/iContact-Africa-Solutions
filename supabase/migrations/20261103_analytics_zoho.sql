-- ==========================================================================
-- 1. Website analytics (cookieless) → Admin Console → Analytics
-- 2. Zoho Invoice sync fields → Admin Console → Billing
-- Safe to re-run. Also included in supabase/schema.sql.
-- ==========================================================================

-- ---------- 1. Page views ---------------------------------------------------
-- One row per page load. visitor/session ids are random per browser tab
-- (sessionStorage) — no cookies, no IP address, no cross-site tracking.
create table if not exists public.page_views (
  id            uuid primary key default gen_random_uuid(),
  session_id    text not null check (length(session_id) between 8 and 64),
  path          text not null check (length(path) <= 300),
  title         text check (length(title) <= 200),
  referrer      text check (length(referrer) <= 300),   -- host only, e.g. "google.com"
  utm_source    text check (length(utm_source) <= 80),
  utm_campaign  text check (length(utm_campaign) <= 80),
  device        text check (device in ('mobile','tablet','desktop')),
  browser       text check (length(browser) <= 30),
  language      text check (length(language) <= 20),
  timezone      text check (length(timezone) <= 60),     -- rough location without geo-IP
  screen_w      int  check (screen_w between 0 and 10000),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index if not exists page_views_created_at_idx on public.page_views (created_at desc);
create index if not exists page_views_last_seen_idx  on public.page_views (last_seen_at desc);
create index if not exists page_views_session_idx    on public.page_views (session_id, created_at desc);

alter table public.page_views enable row level security;

drop policy if exists "page_views insert" on public.page_views;
drop policy if exists "page_views admin"  on public.page_views;
-- Anyone may record a view (with server-set timestamps); only admins can read.
create policy "page_views insert" on public.page_views for insert to anon, authenticated
  with check (created_at > now() - interval '1 minute' and last_seen_at > now() - interval '1 minute');
create policy "page_views admin" on public.page_views for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Heartbeat: keeps a view "live" while the tab is open. Visitors can't read or
-- update rows directly, so this narrow function does it for them.
create or replace function public.pv_ping(p_id uuid, p_session text)
returns void language sql security definer set search_path = public as $$
  update public.page_views set last_seen_at = now()
  where id = p_id and session_id = p_session and created_at > now() - interval '6 hours';
$$;
revoke all on function public.pv_ping(uuid, text) from public;
grant execute on function public.pv_ping(uuid, text) to anon, authenticated;

-- Dashboard numbers, computed in the database (admins only).
create or replace function public.analytics_summary(p_days int default 30)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 400)));
        out jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  with v as (select * from public.page_views where created_at >= since)
  select jsonb_build_object(
    'views',     (select count(*) from v),
    'visitors',  (select count(distinct session_id) from v),
    'live',      (select count(distinct session_id) from public.page_views where last_seen_at > now() - interval '90 seconds'),
    'avg_secs',  (select coalesce(round(avg(least(extract(epoch from last_seen_at - created_at), 1800))), 0) from v),
    'bounce',    (select coalesce(round(100.0 * count(*) filter (where n = 1) / nullif(count(*), 0)), 0)
                    from (select count(*) n from v group by session_id) s),
    'daily',     (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'views', views, 'visitors', visitors) order by day), '[]') from (
                    select to_char((created_at at time zone 'Africa/Harare')::date, 'YYYY-MM-DD') as day,
                           count(*) as views, count(distinct session_id) as visitors
                    from v group by 1) x),
    'pages',     (select coalesce(jsonb_agg(p), '[]') from (
                    select jsonb_build_object('path', path, 'title', max(title), 'views', count(*), 'visitors', count(distinct session_id)) p
                    from v group by path order by count(*) desc limit 12) x),
    'referrers', (select coalesce(jsonb_agg(r), '[]') from (
                    select jsonb_build_object('source', coalesce(nullif(utm_source, ''), nullif(referrer, ''), 'Direct'), 'visitors', count(distinct session_id)) r
                    from v group by coalesce(nullif(utm_source, ''), nullif(referrer, ''), 'Direct') order by count(distinct session_id) desc limit 10) x),
    'devices',   (select coalesce(jsonb_object_agg(coalesce(device, 'unknown'), n), '{}') from (
                    select device, count(distinct session_id) n from v group by device) x),
    'timezones', (select coalesce(jsonb_agg(t), '[]') from (
                    select jsonb_build_object('timezone', coalesce(timezone, 'Unknown'), 'visitors', count(distinct session_id)) t
                    from v group by timezone order by count(distinct session_id) desc limit 8) x)
  ) into out;
  return out;
end $$;
revoke all on function public.analytics_summary(int) from public, anon;
grant execute on function public.analytics_summary(int) to authenticated;

-- Live: who's on the site right now (latest page per tab, last 90 seconds).
create or replace function public.analytics_live()
returns table (session_id text, path text, title text, referrer text, device text, timezone text, started_at timestamptz, last_seen_at timestamptz, pages bigint)
language plpgsql stable security invoker set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
    select distinct on (pv.session_id) pv.session_id, pv.path, pv.title, pv.referrer, pv.device, pv.timezone,
           (select min(x.created_at) from public.page_views x where x.session_id = pv.session_id),
           pv.last_seen_at,
           (select count(*) from public.page_views x where x.session_id = pv.session_id)
    from public.page_views pv
    where pv.last_seen_at > now() - interval '90 seconds'
    order by pv.session_id, pv.created_at desc;
end $$;
revoke all on function public.analytics_live() from public, anon;
grant execute on function public.analytics_live() to authenticated;

-- Live feed in the admin console.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'page_views') then
    alter publication supabase_realtime add table public.page_views;
  end if;
end $$;

-- ---------- 2. Zoho Invoice sync -------------------------------------------
alter table public.profiles add column if not exists zoho_contact_id text;
create unique index if not exists profiles_zoho_contact_id_key on public.profiles (zoho_contact_id) where zoho_contact_id is not null;

alter table public.invoices add column if not exists source           text not null default 'portal';
alter table public.invoices add column if not exists zoho_invoice_id  text;
alter table public.invoices add column if not exists zoho_customer_id text;
alter table public.invoices add column if not exists customer_name    text;   -- from Zoho, for invoices not yet linked to a portal client
alter table public.invoices add column if not exists customer_email   text;
alter table public.invoices add column if not exists balance          numeric(12,2);
alter table public.invoices add column if not exists synced_at        timestamptz;
-- Zoho customers without a portal login can still be listed in Billing.
alter table public.invoices alter column client_id drop not null;
create unique index if not exists invoices_zoho_invoice_id_key on public.invoices (zoho_invoice_id) where zoho_invoice_id is not null;

do $$ begin
  alter table public.invoices add constraint invoices_source_check check (source in ('portal','zoho'));
exception when duplicate_object then null; end $$;
