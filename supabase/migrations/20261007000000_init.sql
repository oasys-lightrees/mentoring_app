-- Lightech Mentoring App — PostgreSQL schema (Supabase)
-- Run once in Supabase → SQL Editor (or `supabase db push`). Safe to re-run.
--
-- Every record keeps its full JSON in `data` (what the app reads and writes) plus typed, generated columns for
-- reporting, BI tools and indexes. Deletes keep a tombstone (deleted = true) so other devices drop the record too.
-- Row Level Security is ON with no policies: the public anon/authenticated keys can read nothing. Only the
-- `api` Edge Function (direct database connection) touches these tables, and it enforces per-company access.

create or replace function public.mcrm_num(v jsonb) returns numeric
language sql immutable parallel safe as $$
  select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
              when jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v #>> '{}')::numeric
              else null end
$$;

create table if not exists public.platform (
  id          text primary key,
  data        jsonb,
  updated_at  bigint not null,
  updated_by  text not null default '',
  deleted     boolean not null default false
);

create table if not exists public.companies (
  id          text primary key,
  data        jsonb,
  updated_at  bigint not null,
  updated_by  text not null default '',
  deleted     boolean not null default false,
  slug        text generated always as (lower(coalesce(data->>'slug', data->>'preset', data->>'name', ''))) stored,
  name        text generated always as (data->>'name') stored,
  status      text generated always as (coalesce(data->>'status', 'active')) stored
);
create index if not exists companies_slug_idx on public.companies (slug);

create table if not exists public.leads (
  company_id  text not null,
  id          text not null,
  data        jsonb,
  updated_at  bigint not null,
  updated_by  text not null default '',
  deleted     boolean not null default false,
  name        text generated always as (data->>'name') stored,
  phone       text generated always as (data->>'phone') stored,
  email       text generated always as (data->>'email') stored,
  stage_id    text generated always as (data->>'stageId') stored,
  owner_id    text generated always as (data->>'ownerId') stored,
  source      text generated always as (data->>'source') stored,
  program_id  text generated always as (data->>'programId') stored,
  value       numeric generated always as (public.mcrm_num(data->'value')) stored,
  created_at  text generated always as (data->>'createdAt') stored,
  primary key (company_id, id)
);

create table if not exists public.sessions (
  company_id  text not null,
  id          text not null,
  data        jsonb,
  updated_at  bigint not null,
  updated_by  text not null default '',
  deleted     boolean not null default false,
  lead_id     text generated always as (data->>'leadId') stored,
  type_id     text generated always as (data->>'typeId') stored,
  mentor_id   text generated always as (data->>'mentorId') stored,
  date        text generated always as (data->>'date') stored,
  status      text generated always as (data->>'status') stored,
  primary key (company_id, id)
);

create table if not exists public.clients (
  company_id  text not null,
  id          text not null,
  data        jsonb,
  updated_at  bigint not null,
  updated_by  text not null default '',
  deleted     boolean not null default false,
  lead_id     text generated always as (data->>'leadId') stored,
  name        text generated always as (data->>'name') stored,
  coach_id    text generated always as (data->>'coachId') stored,
  program_id  text generated always as (data->>'programId') stored,
  value       numeric generated always as (public.mcrm_num(data->'value')) stored,
  primary key (company_id, id)
);

create index if not exists leads_upd_idx    on public.leads (company_id, updated_at);
create index if not exists sessions_upd_idx on public.sessions (company_id, updated_at);
create index if not exists clients_upd_idx  on public.clients (company_id, updated_at);
create index if not exists leads_phone_idx  on public.leads (company_id, phone);

-- Append-only change log (who changed what, when). Updates and deletes are blocked by a trigger.
create table if not exists public.audit_log (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  actor    text not null default '',
  company  text not null default '',
  action   text not null default '',
  path     text not null default '',
  detail   text not null default ''
);
create index if not exists audit_company_idx on public.audit_log (company, id desc);

create or replace function public.mcrm_audit_append_only() returns trigger
language plpgsql as $$ begin raise exception 'audit_log is append-only'; end $$;
drop trigger if exists audit_append_only on public.audit_log;
create trigger audit_append_only before update or delete on public.audit_log
  for each row execute function public.mcrm_audit_append_only();

-- Sign-in sessions, failed-login counters and form rate limits (short-lived).
create table if not exists public.kv (
  key         text primary key,
  value       text not null,
  expires_at  bigint not null
);
create index if not exists kv_exp_idx on public.kv (expires_at);

-- One-time setup code: created here, shown once below, consumed by the app's setup screen.
create table if not exists public.app_setup (
  id    int primary key default 1 check (id = 1),
  code  text not null
);
insert into public.app_setup (code)
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12))
  where not exists (select 1 from public.platform where id = 'main' and not deleted)
on conflict (id) do nothing;

alter table public.platform  enable row level security;
alter table public.companies enable row level security;
alter table public.leads     enable row level security;
alter table public.sessions  enable row level security;
alter table public.clients   enable row level security;
alter table public.audit_log enable row level security;
alter table public.kv        enable row level security;
alter table public.app_setup enable row level security;
revoke all on public.platform, public.companies, public.leads, public.sessions, public.clients,
              public.audit_log, public.kv, public.app_setup from anon, authenticated;

-- Shown in the SQL editor's result: copy it into the app's setup screen.
select coalesce((select 'SETUP CODE: ' || code from public.app_setup), 'Already set up (no setup code).') as setup;
