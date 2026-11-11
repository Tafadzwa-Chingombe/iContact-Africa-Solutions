-- ==========================================================================
-- iContact Africa Solutions — Client Portal schema (Supabase / Postgres)
-- Run this whole file once in: Supabase Dashboard → SQL Editor → New query.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS.
-- ==========================================================================

-- ---------- Profiles (1:1 with auth.users) --------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  company     text,
  phone       text,
  role        text not null default 'client' check (role in ('client','admin')),
  created_at  timestamptz not null default now()
);

-- Auto-create a profile whenever a user is created in Supabase Auth.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, company)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'company', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper used by every policy below.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Stop clients from promoting themselves to admin.
create or replace function public.protect_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null in the SQL Editor / service-role context, which is how
  -- you bootstrap the first admin. Every signed-in client has a uid.
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_role();

-- ---------- Projects -------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  service     text,                         -- Website, SEO, Branding, Ads…
  stage       text not null default 'scope'
              check (stage in ('scope','design','build','launch','live','on_hold')),
  progress    int  not null default 0 check (progress between 0 and 100),
  start_date  date,
  due_date    date,
  preview_url text,
  notes       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  due_date    date,
  done        boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- Invoices -------------------------------------------------------
create table if not exists public.invoices (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,
  number      text not null unique,
  description text,
  amount      numeric(12,2) not null check (amount >= 0),
  currency    text not null default 'USD',
  status      text not null default 'unpaid' check (status in ('draft','unpaid','paid','overdue','void')),
  issued_on   date not null default current_date,
  due_on      date,
  paid_on     date,
  pdf_path    text,      -- path inside the 'portal-files' storage bucket
  pay_url     text,      -- optional Paynow / PayPal / Stripe link
  created_at  timestamptz not null default now()
);

-- ---------- Files & approvals ---------------------------------------------
create table if not exists public.files (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  name         text not null,
  storage_path text not null,
  size_bytes   bigint,
  needs_approval boolean not null default false,
  approval     text not null default 'none' check (approval in ('none','pending','approved','changes_requested')),
  approved_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.file_comments (
  id          uuid primary key default gen_random_uuid(),
  file_id     uuid not null references public.files(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- ---------- Support tickets -----------------------------------------------
create table if not exists public.tickets (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,
  subject     text not null,
  priority    text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status      text not null default 'open' check (status in ('open','in_progress','waiting_client','closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create or replace function public.touch_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.tickets set updated_at = now() where id = new.ticket_id;
  return new;
end $$;

drop trigger if exists ticket_messages_touch on public.ticket_messages;
create trigger ticket_messages_touch
  after insert on public.ticket_messages
  for each row execute function public.touch_ticket();

-- ---------- Website enquiries (public contact form) -----------------------
create table if not exists public.enquiries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  phone       text,
  service     text,
  budget      text,
  message     text not null,
  created_at  timestamptz not null default now()
);


-- ---------- Indexes on foreign keys (used by joins, RLS checks and cascades) ----
create index if not exists projects_client_id_idx        on public.projects (client_id);
create index if not exists milestones_project_id_idx     on public.milestones (project_id);
create index if not exists invoices_client_id_idx        on public.invoices (client_id);
create index if not exists invoices_project_id_idx       on public.invoices (project_id);
create index if not exists files_project_id_idx          on public.files (project_id);
create index if not exists files_uploaded_by_idx         on public.files (uploaded_by);
create index if not exists file_comments_file_id_idx     on public.file_comments (file_id);
create index if not exists file_comments_author_id_idx   on public.file_comments (author_id);
create index if not exists tickets_client_id_idx         on public.tickets (client_id);
create index if not exists tickets_project_id_idx        on public.tickets (project_id);
create index if not exists ticket_messages_ticket_id_idx on public.ticket_messages (ticket_id);
create index if not exists ticket_messages_author_id_idx on public.ticket_messages (author_id);
create index if not exists enquiries_created_at_idx      on public.enquiries (created_at desc);

-- ==========================================================================
-- Row Level Security
-- ==========================================================================
alter table public.profiles        enable row level security;
alter table public.projects        enable row level security;
alter table public.milestones      enable row level security;
alter table public.invoices        enable row level security;
alter table public.files           enable row level security;
alter table public.file_comments   enable row level security;
alter table public.tickets         enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.enquiries       enable row level security;

-- Small helper: does the current user own this project?
create or replace function public.owns_project(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = p and client_id = auth.uid());
$$;

create or replace function public.owns_ticket(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tickets where id = t and client_id = auth.uid());
$$;

create or replace function public.owns_file(f uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.files fl join public.projects p on p.id = fl.project_id
    where fl.id = f and p.client_id = auth.uid()
  );
$$;

-- profiles
drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles update" on public.profiles;
drop policy if exists "profiles admin"  on public.profiles;
create policy "profiles read"   on public.profiles for select using (id = (select auth.uid()) or (select public.is_admin()));
create policy "profiles update" on public.profiles for update using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles admin"  on public.profiles for all    using ((select public.is_admin())) with check ((select public.is_admin()));

-- projects (clients read only; admins everything)
drop policy if exists "projects read"  on public.projects;
drop policy if exists "projects admin" on public.projects;
create policy "projects read"  on public.projects for select using (client_id = (select auth.uid()) or (select public.is_admin()));
create policy "projects admin" on public.projects for all    using ((select public.is_admin())) with check ((select public.is_admin()));

-- milestones
drop policy if exists "milestones read"  on public.milestones;
drop policy if exists "milestones admin" on public.milestones;
create policy "milestones read"  on public.milestones for select using (public.owns_project(project_id) or (select public.is_admin()));
create policy "milestones admin" on public.milestones for all    using ((select public.is_admin())) with check ((select public.is_admin()));

-- invoices (clients never see drafts)
drop policy if exists "invoices read"  on public.invoices;
drop policy if exists "invoices admin" on public.invoices;
create policy "invoices read"  on public.invoices for select using ((client_id = (select auth.uid()) and status <> 'draft') or (select public.is_admin()));
create policy "invoices admin" on public.invoices for all    using ((select public.is_admin())) with check ((select public.is_admin()));

-- files: clients read their project's files, upload to their projects, and set approval
drop policy if exists "files read"          on public.files;
drop policy if exists "files client insert" on public.files;
drop policy if exists "files client approve" on public.files;
drop policy if exists "files admin"         on public.files;
create policy "files read"           on public.files for select using (public.owns_project(project_id) or (select public.is_admin()));
create policy "files client insert"  on public.files for insert with check (public.owns_project(project_id) and uploaded_by = (select auth.uid()) and approval = 'none');
create policy "files client approve" on public.files for update using (public.owns_project(project_id) and needs_approval) with check (public.owns_project(project_id) and needs_approval);
create policy "files admin"          on public.files for all    using ((select public.is_admin())) with check ((select public.is_admin()));

-- Clients may only change approval fields on a file, nothing else.
create or replace function public.limit_client_file_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if new.name is distinct from old.name or new.storage_path is distinct from old.storage_path
     or new.project_id is distinct from old.project_id or new.needs_approval is distinct from old.needs_approval then
    raise exception 'Clients can only approve or request changes';
  end if;
  if new.approval not in ('approved','changes_requested') then
    raise exception 'Invalid approval value';
  end if;
  new.approved_at := case when new.approval = 'approved' then now() else null end;
  return new;
end $$;

drop trigger if exists files_limit_client_update on public.files;
create trigger files_limit_client_update
  before update on public.files
  for each row execute function public.limit_client_file_update();

-- file comments
drop policy if exists "file_comments read"   on public.file_comments;
drop policy if exists "file_comments insert" on public.file_comments;
drop policy if exists "file_comments admin"  on public.file_comments;
create policy "file_comments read"   on public.file_comments for select using (public.owns_file(file_id) or (select public.is_admin()));
create policy "file_comments insert" on public.file_comments for insert with check (author_id = (select auth.uid()) and (public.owns_file(file_id) or (select public.is_admin())));
create policy "file_comments admin"  on public.file_comments for all    using ((select public.is_admin())) with check ((select public.is_admin()));

-- tickets
drop policy if exists "tickets read"   on public.tickets;
drop policy if exists "tickets insert" on public.tickets;
drop policy if exists "tickets admin"  on public.tickets;
create policy "tickets read"   on public.tickets for select using (client_id = (select auth.uid()) or (select public.is_admin()));
create policy "tickets insert" on public.tickets for insert with check (client_id = (select auth.uid()) and status = 'open');
create policy "tickets admin"  on public.tickets for all    using ((select public.is_admin())) with check ((select public.is_admin()));

-- ticket messages
drop policy if exists "ticket_messages read"   on public.ticket_messages;
drop policy if exists "ticket_messages insert" on public.ticket_messages;
drop policy if exists "ticket_messages admin"  on public.ticket_messages;
create policy "ticket_messages read"   on public.ticket_messages for select using (public.owns_ticket(ticket_id) or (select public.is_admin()));
create policy "ticket_messages insert" on public.ticket_messages for insert with check (author_id = (select auth.uid()) and (public.owns_ticket(ticket_id) or (select public.is_admin())));
create policy "ticket_messages admin"  on public.ticket_messages for all    using ((select public.is_admin())) with check ((select public.is_admin()));

-- enquiries: anyone may submit, only admins may read
drop policy if exists "enquiries insert" on public.enquiries;
drop policy if exists "enquiries admin"  on public.enquiries;
create policy "enquiries insert" on public.enquiries for insert to anon, authenticated with check (true);
create policy "enquiries admin"  on public.enquiries for all using ((select public.is_admin())) with check ((select public.is_admin()));

-- ==========================================================================
-- Storage: private bucket. Paths are  <project_id>/<filename>
-- ==========================================================================
insert into storage.buckets (id, name, public)
values ('portal-files', 'portal-files', false)
on conflict (id) do nothing;

-- Paths:  <project_id>/<file>            → project files
--         invoices/<client_id>/<file>     → invoice PDFs
create or replace function public.can_access_storage_path(path text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  parts text[] := storage.foldername(path);
  uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if public.is_admin() then return true; end if;
  if parts[1] = 'invoices' then
    return parts[2] ~ uuid_re and parts[2]::uuid = auth.uid();
  end if;
  return parts[1] ~ uuid_re and public.owns_project(parts[1]::uuid);
end $$;

drop policy if exists "portal files read"   on storage.objects;
drop policy if exists "portal files upload" on storage.objects;
drop policy if exists "portal files admin"  on storage.objects;

create policy "portal files read" on storage.objects for select
  using (bucket_id = 'portal-files' and public.can_access_storage_path(name));

-- Clients may upload into their own project folders only (not invoices/).
create policy "portal files upload" on storage.objects for insert
  with check (bucket_id = 'portal-files' and (storage.foldername(name))[1] <> 'invoices'
              and public.can_access_storage_path(name));

create policy "portal files admin" on storage.objects for all
  using (bucket_id = 'portal-files' and (select public.is_admin()))
  with check (bucket_id = 'portal-files' and (select public.is_admin()));

-- ==========================================================================
-- Realtime: lets the dashboard refresh instantly when the team replies.
-- ==========================================================================
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['ticket_messages','tickets','files','file_comments'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ==========================================================================
-- Blog (admin CMS → public blog)
-- ==========================================================================
create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique
               check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120),
  title        text not null check (length(title) between 1 and 200),
  excerpt      text check (length(excerpt) <= 400),
  content      text not null default '',          -- Markdown
  cover_url    text,
  tags         text[] not null default '{}',
  status       text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,                         -- future date = scheduled
  author_id    uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists posts_author_id_idx on public.posts (author_id);
-- The public blog only ever lists published posts, newest first.
create index if not exists posts_published_idx on public.posts (published_at desc) where status = 'published';

create or replace function public.posts_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;

drop trigger if exists posts_before_write on public.posts;
create trigger posts_before_write
  before insert or update on public.posts
  for each row execute function public.posts_before_write();

alter table public.posts enable row level security;

drop policy if exists "posts public read" on public.posts;
drop policy if exists "posts admin"       on public.posts;
-- Anyone (including logged-out visitors) can read published, non-scheduled posts.
create policy "posts public read" on public.posts for select to anon, authenticated
  using (status = 'published' and published_at <= now());
create policy "posts admin" on public.posts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Public bucket for blog images (anyone can view via public URL; only admins upload).
insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do nothing;

drop policy if exists "blog images admin" on storage.objects;
create policy "blog images admin" on storage.objects for all to authenticated
  using (bucket_id = 'blog-images' and (select public.is_admin()))
  with check (bucket_id = 'blog-images' and (select public.is_admin()));

-- ==========================================================================
-- Careers: job vacancies managed from Admin Console → Careers
-- Safe to re-run. Also included in supabase/schema.sql.
-- ==========================================================================
create table if not exists public.jobs (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(title) between 2 and 140),
  location         text check (length(location) <= 80),
  employment_type  text check (length(employment_type) <= 40),
  department       text check (length(department) <= 60),
  summary          text check (length(summary) <= 1200),
  responsibilities text[] not null default '{}',
  requirements     text[] not null default '{}',
  closes_on        date,                               -- inclusive, Harare time; null = open until removed
  status           text not null default 'draft' check (status in ('draft','published')),
  author_id        uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists jobs_author_id_idx on public.jobs (author_id);
-- The Careers page only lists published jobs, ordered by closing date.
create index if not exists jobs_published_idx on public.jobs (closes_on) where status = 'published';

create or replace function public.jobs_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
  for each row execute function public.jobs_touch();

alter table public.jobs enable row level security;

drop policy if exists "jobs public read" on public.jobs;
drop policy if exists "jobs admin"       on public.jobs;
-- Visitors see published jobs (open or recently closed — the page labels them).
create policy "jobs public read" on public.jobs for select to anon, authenticated
  using (status = 'published');
create policy "jobs admin" on public.jobs for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

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

-- ==========================================================================
-- iContact Academy: self-paced paid courses
--   public.courses           catalogue (public sees published ones)
--   public.lessons           lesson content (enrolled students + free previews)
--   public.academy_orders    enrolment requests from the public site
--   public.enrollments       who has access to which course
--   public.lesson_progress   lessons a student has completed
-- Payments are confirmed manually (EcoCash / Paynow / bank); an admin approves
-- an order in Admin Console -> Academy, which creates the student's login and
-- the active enrolment.  Safe to re-run.  Also included in supabase/schema.sql.
-- ==========================================================================

-- ---------- Students are a third role --------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('client', 'admin', 'student'));

-- New accounts are clients unless an admin invited them as a student.
-- Only 'student' is accepted from invite metadata, so nobody can invite themselves an admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, company, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'company', ''),
    case when new.raw_user_meta_data->>'role' = 'student' then 'student' else 'client' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------- Tables ---------------------------------------------------------
create table if not exists public.courses (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  title         text not null check (length(title) between 3 and 120),
  subtitle      text check (length(subtitle) <= 200),
  category      text not null default 'marketing' check (category in ('marketing', 'web')),
  level         text not null default 'beginner' check (level in ('beginner', 'intermediate', 'advanced')),
  price         numeric(8,2) not null default 0 check (price >= 0),
  currency      text not null default 'USD' check (currency in ('USD', 'ZWG', 'ZAR')),
  duration_text text check (length(duration_text) <= 60),
  description   text check (length(description) <= 4000),
  outcomes      text[] not null default '{}',
  who_for       text check (length(who_for) <= 600),
  cover_url     text check (length(cover_url) <= 500),
  status        text not null default 'draft' check (status in ('draft', 'published')),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists courses_published_idx on public.courses (sort_order) where status = 'published';

create table if not exists public.lessons (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses(id) on delete cascade,
  module_title  text not null default 'Lessons' check (length(module_title) <= 120),
  title         text not null check (length(title) between 2 and 160),
  sort_order    int not null default 0,
  duration_min  int check (duration_min between 0 and 600),
  video_url     text check (length(video_url) <= 500),
  body          text check (length(body) <= 60000),
  is_preview    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists lessons_course_order_idx on public.lessons (course_id, sort_order);

create table if not exists public.enrollments (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'active' check (status in ('active', 'cancelled')),
  amount        numeric(8,2) check (amount >= 0),
  currency      text not null default 'USD',
  pay_method    text check (pay_method in ('ecocash', 'paynow', 'bank', 'other')),
  pay_reference text check (length(pay_reference) <= 120),
  created_at    timestamptz not null default now(),
  unique (course_id, user_id)
);
create index if not exists enrollments_user_idx on public.enrollments (user_id);

create table if not exists public.academy_orders (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses(id) on delete cascade,
  full_name     text not null check (length(full_name) between 2 and 120),
  email         text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  phone         text check (length(phone) <= 40),
  pay_method    text not null check (pay_method in ('ecocash', 'paynow', 'bank')),
  pay_reference text check (length(pay_reference) <= 120),
  message       text check (length(message) <= 1000),
  status        text not null default 'new' check (status in ('new', 'approved', 'rejected')),
  enrollment_id uuid references public.enrollments(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists academy_orders_course_idx on public.academy_orders (course_id);
create index if not exists academy_orders_enrollment_idx on public.academy_orders (enrollment_id);
create index if not exists academy_orders_new_idx on public.academy_orders (created_at desc) where status = 'new';

create table if not exists public.lesson_progress (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  completed_at  timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index if not exists lesson_progress_lesson_idx on public.lesson_progress (lesson_id);

-- keep updated_at fresh
create or replace function public.academy_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists courses_touch on public.courses;
create trigger courses_touch before update on public.courses for each row execute function public.academy_touch();
drop trigger if exists lessons_touch on public.lessons;
create trigger lessons_touch before update on public.lessons for each row execute function public.academy_touch();

-- ---------- Access helper --------------------------------------------------
create or replace function public.has_course_access(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.enrollments e
    where e.course_id = p_course and e.user_id = auth.uid() and e.status = 'active');
$$;
revoke all on function public.has_course_access(uuid) from public;
grant execute on function public.has_course_access(uuid) to anon, authenticated;

-- ---------- Row-level security ---------------------------------------------
alter table public.courses         enable row level security;
alter table public.lessons         enable row level security;
alter table public.enrollments     enable row level security;
alter table public.academy_orders  enable row level security;
alter table public.lesson_progress enable row level security;

drop policy if exists "courses public read" on public.courses;
drop policy if exists "courses admin"       on public.courses;
create policy "courses public read" on public.courses for select to anon, authenticated
  using (status = 'published' or (select public.is_admin()));
create policy "courses admin" on public.courses for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Lesson content: admins, enrolled students, and free-preview lessons of published courses.
drop policy if exists "lessons read"  on public.lessons;
drop policy if exists "lessons admin" on public.lessons;
create policy "lessons read" on public.lessons for select to anon, authenticated
  using (
    (select public.is_admin())
    or public.has_course_access(course_id)
    or (is_preview and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published'))
  );
create policy "lessons admin" on public.lessons for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "enrollments own read" on public.enrollments;
drop policy if exists "enrollments admin"    on public.enrollments;
create policy "enrollments own read" on public.enrollments for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "enrollments admin" on public.enrollments for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Anyone may request a place (like the contact form); only admins read or act on orders.
drop policy if exists "academy orders insert" on public.academy_orders;
drop policy if exists "academy orders admin"  on public.academy_orders;
create policy "academy orders insert" on public.academy_orders for insert to anon, authenticated
  with check (status = 'new' and enrollment_id is null
              and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published'));
create policy "academy orders admin" on public.academy_orders for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "progress own" on public.lesson_progress;
create policy "progress own" on public.lesson_progress for all to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.lessons l where l.id = lesson_id and public.has_course_access(l.course_id)));

-- ---------- Public catalogue + curriculum (titles only, never lesson content) ----
create or replace function public.course_catalog()
returns table (id uuid, slug text, title text, subtitle text, category text, level text, price numeric, currency text,
               duration_text text, description text, outcomes text[], who_for text, cover_url text,
               lesson_count bigint, total_minutes bigint, preview_count bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.slug, c.title, c.subtitle, c.category, c.level, c.price, c.currency, c.duration_text, c.description,
         c.outcomes, c.who_for, c.cover_url,
         count(l.id), coalesce(sum(l.duration_min), 0), count(l.id) filter (where l.is_preview)
  from public.courses c left join public.lessons l on l.course_id = c.id
  where c.status = 'published'
  group by c.id
  order by c.sort_order, c.title;
$$;
revoke all on function public.course_catalog() from public;
grant execute on function public.course_catalog() to anon, authenticated;

create or replace function public.course_curriculum(p_slug text)
returns table (module_title text, title text, sort_order int, duration_min int, is_preview boolean, lesson_id uuid)
language sql stable security definer set search_path = public as $$
  select l.module_title, l.title, l.sort_order, l.duration_min, l.is_preview,
         case when l.is_preview then l.id end
  from public.lessons l join public.courses c on c.id = l.course_id
  where c.slug = p_slug and (c.status = 'published' or public.is_admin())
  order by l.sort_order, l.created_at;
$$;
revoke all on function public.course_curriculum(text) from public;
grant execute on function public.course_curriculum(text) to anon, authenticated;

-- ==========================================================================

-- ==========================================================================
-- AI calls: conversations with Nyasha (the ElevenLabs voice assistant),
-- copied from ElevenLabs by the elevenlabs-sync Edge Function (admin "Sync").
-- Calls that capture contact details also become rows in public.enquiries.
-- Safe to re-run.
-- ==========================================================================

-- Enquiries can now come from the AI assistant (phone-only leads have no email)
alter table public.enquiries add column if not exists source text not null default 'website';
alter table public.enquiries add column if not exists ai_call_id text;
alter table public.enquiries alter column email drop not null;

create table if not exists public.ai_calls (
  conversation_id  text primary key,
  agent_id         text,
  started_at       timestamptz not null,
  duration_secs    int not null default 0,
  status           text,
  channel          text,             -- widget, phone, whatsapp …
  call_successful  text,             -- success | failure | unknown
  title            text,
  summary          text,
  contact_name     text,
  business_name    text,
  phone            text,
  email            text,
  service          text,
  budget           text,
  preferred_slot   text,
  outcome          text,
  follow_up_notes  text,
  do_not_call      boolean not null default false,
  sentiment        text,
  rating           int,
  cost_usd         numeric(10,4),
  has_audio        boolean not null default false,
  transcript       jsonb not null default '[]'::jsonb,   -- [{role, message, t}]
  data             jsonb not null default '{}'::jsonb,   -- every data-collection field
  evaluations      jsonb not null default '{}'::jsonb,   -- {criteria: result}
  handled          boolean not null default false,       -- followed up by admin
  enquiry_id       uuid references public.enquiries (id) on delete set null,
  synced_at        timestamptz not null default now()
);
create index if not exists ai_calls_started_at_idx on public.ai_calls (started_at desc);
create index if not exists ai_calls_enquiry_id_idx on public.ai_calls (enquiry_id);
-- One enquiry per AI call, even if two syncs overlap
create unique index if not exists enquiries_ai_call_id_key on public.enquiries (ai_call_id) where ai_call_id is not null;

alter table public.ai_calls enable row level security;
drop policy if exists "ai_calls admin" on public.ai_calls;
create policy "ai_calls admin" on public.ai_calls for all
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- After running: make yourself admin (replace the email):
--   update public.profiles set role = 'admin' where email = 'you@example.com';
-- ==========================================================================
