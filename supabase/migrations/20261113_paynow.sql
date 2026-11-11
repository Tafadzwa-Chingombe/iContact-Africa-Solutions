-- ==========================================================================
-- Paynow checkout for Academy courses.
-- Rows are written only by the `paynow` Edge Function (service role); admins can read them.
-- A paid payment creates the student's login + enrolment and an approved academy_orders row.
-- Safe to re-run.
-- ==========================================================================
create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,                  -- our reference sent to Paynow, e.g. ACAD-7KQ2M9XA
  kind              text not null default 'course' check (kind in ('course')),
  course_id         uuid references public.courses (id) on delete set null,
  full_name         text not null,
  email             text not null,
  phone             text,
  amount            numeric(10,2) not null check (amount > 0),
  currency          text not null default 'USD',
  method            text not null check (method in ('web', 'ecocash', 'onemoney')),
  status            text not null default 'created',       -- created | sent | paid | cancelled | failed | … (Paynow status, lower-case)
  paynow_reference  text,
  poll_url          text,
  error             text,
  existing_account  boolean,
  enrollment_id     uuid references public.enrollments (id) on delete set null,
  order_id          uuid references public.academy_orders (id) on delete set null,
  fulfilled_at      timestamptz,
  login_links_sent  int not null default 0,
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists payments_created_at_idx on public.payments (created_at desc);
create index if not exists payments_course_idx on public.payments (course_id);
create index if not exists payments_enrollment_idx on public.payments (enrollment_id);
create index if not exists payments_order_idx on public.payments (order_id);

drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments
  for each row execute function public.academy_touch();

alter table public.payments enable row level security;
drop policy if exists "payments admin read" on public.payments;
create policy "payments admin read" on public.payments for select using ((select public.is_admin()));

-- ---------- Relay: Paynow refuses TLS connections from Edge Functions, so the
-- function sends its Paynow requests through the database (pgsql-http / libcurl).
-- Locked to paynow.co.zw and callable only by the service role (the Edge Function).
create extension if not exists http with schema extensions;

create or replace function public.paynow_post(p_url text, p_body text)
returns table (status int, content text)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_url !~* '^https://www\.paynow\.co\.zw/interface/' then  -- Paynow mixes /interface/ and /Interface/
    raise exception 'paynow_post: URL not allowed';
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '30');
  return query
    select r.status, r.content::text
    from extensions.http((
      'POST', p_url, array[]::extensions.http_header[],
      'application/x-www-form-urlencoded', coalesce(p_body, '')
    )::extensions.http_request) r;
end $$;
revoke all on function public.paynow_post(text, text) from public, anon, authenticated;
grant execute on function public.paynow_post(text, text) to service_role;
