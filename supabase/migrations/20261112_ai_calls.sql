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

alter table public.ai_calls enable row level security;
drop policy if exists "ai_calls admin" on public.ai_calls;
create policy "ai_calls admin" on public.ai_calls for all
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- One enquiry per AI call, even if two syncs overlap
create unique index if not exists enquiries_ai_call_id_key on public.enquiries (ai_call_id) where ai_call_id is not null;
