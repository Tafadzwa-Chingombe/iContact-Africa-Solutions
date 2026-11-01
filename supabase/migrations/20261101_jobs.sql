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
