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
-- After running: make yourself admin (replace the email):
--   update public.profiles set role = 'admin' where email = 'you@example.com';
-- ==========================================================================
