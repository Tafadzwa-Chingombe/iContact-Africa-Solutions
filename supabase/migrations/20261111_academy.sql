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
