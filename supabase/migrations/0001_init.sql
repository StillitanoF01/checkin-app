-- Check-In app — initial schema, RLS, and RPCs.
-- Design goals:
--   * pin_hash is NEVER readable by the anon client (routed through RPCs).
--   * All local-time / window math is done in the configured IANA timezone.
--   * Per-day notification flags live in daily_status for idempotency (Phase 4).

-- pgcrypto provides crypt()/gen_salt() for PIN hashing. On Supabase it installs into
-- the `extensions` schema, so functions below set search_path = public, extensions.
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists profiles (
  id           uuid primary key default gen_random_uuid(),
  role         text not null unique check (role in ('nonna', 'iliana')),
  display_name text not null,
  pin_hash     text,                       -- bcrypt via pgcrypto; null = no PIN yet
  created_at   timestamptz not null default now()
);

create table if not exists settings (
  id           uuid primary key default gen_random_uuid(),
  timezone     text not null default 'Australia/Sydney',
  window_start text not null default '06:00',   -- 'HH:MM' local
  window_end   text not null default '10:00',   -- 'HH:MM' local
  updated_at   timestamptz not null default now(),
  singleton    boolean not null default true unique  -- enforce a single row
);
-- Notification recipients are Telegram chat IDs supplied via env to the Edge Function
-- (never stored here). See supabase/functions/README.md.

create table if not exists checkins (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles(id) on delete cascade,
  checkin_date  date not null,                 -- local calendar date
  checked_in_at timestamptz not null default now(),
  unique (profile_id, checkin_date)
);

-- One row per Nonna-day; holds the idempotency flags the scheduler sets.
create table if not exists daily_status (
  checkin_date             date primary key,
  reminder_sent_at         timestamptz,
  missed_alert_sent_at     timestamptz,
  late_checkin_notified_at timestamptz,
  checkin_notified_at      timestamptz
);

create table if not exists notifications_log (
  id                  uuid primary key default gen_random_uuid(),
  type                text not null check (type in
                        ('reminder','missed_nonna','missed_iliana','late_reassurance','checkin_iliana')),
  recipient           text not null,
  body                text not null,
  provider            text not null default 'telegram',
  provider_message_id text,
  status              text not null default 'sent' check (status in ('sent','failed')),
  error               text,
  sent_at             timestamptz not null default now()
);

create index if not exists checkins_date_idx on checkins (checkin_date);
create index if not exists notif_sent_idx on notifications_log (sent_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed: two profiles (no PIN yet -> first-run setup) and one settings row.
-- ─────────────────────────────────────────────────────────────────────────────

insert into profiles (role, display_name)
values ('nonna', 'Nonna'), ('iliana', 'Iliana')
on conflict (role) do nothing;

insert into settings (singleton) values (true)
on conflict (singleton) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: lock everything down. Reads/writes go through the RPCs below (or the
-- narrow policies). profiles is never directly selectable (protects pin_hash).
-- ─────────────────────────────────────────────────────────────────────────────

alter table profiles          enable row level security;
alter table settings          enable row level security;
alter table checkins          enable row level security;
alter table daily_status      enable row level security;
alter table notifications_log enable row level security;

-- No policies on profiles / daily_status / notifications_log => anon has no direct
-- access; only SECURITY DEFINER functions (and the service role) can touch them.

-- Non-sensitive read surfaces the dashboard needs directly:
create policy checkins_read on checkins for select using (true);
create policy settings_read on settings for select using (true);
create policy settings_update on settings for update using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- RPCs (SECURITY DEFINER). Granted to anon so the frontend can call them without
-- ever reading pin_hash directly.
-- ─────────────────────────────────────────────────────────────────────────────

-- Safe profile list for the landing page (role, name, whether a PIN is set).
create or replace function get_profiles()
returns table (id uuid, role text, display_name text, has_pin boolean)
language sql
security definer
set search_path = public, extensions
as $$
  select id, role, display_name, (pin_hash is not null) as has_pin
  from profiles
  order by role;
$$;

-- First-run: set a PIN only if one is not already set. Returns true on success.
create or replace function set_pin(p_role text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  updated int;
begin
  if p_pin !~ '^\d{4,8}$' then
    raise exception 'PIN must be 4-8 digits';
  end if;

  update profiles
     set pin_hash = crypt(p_pin, gen_salt('bf'))
   where role = p_role and pin_hash is null;

  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;

-- "Forgot PIN" reset: overwrites an existing PIN unconditionally (unlike set_pin, which
-- refuses if one is already set). Used by the UI after repeated wrong attempts.
create or replace function reset_pin(p_role text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  updated int;
begin
  if p_pin !~ '^\d{4,8}$' then
    raise exception 'PIN must be 4-8 digits';
  end if;

  update profiles
     set pin_hash = crypt(p_pin, gen_salt('bf'))
   where role = p_role;

  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;

-- Verify a PIN. Returns the profile row (no hash) on success, nothing on failure.
create or replace function verify_pin(p_role text, p_pin text)
returns table (id uuid, role text, display_name text)
language sql
security definer
set search_path = public, extensions
as $$
  select id, role, display_name
  from profiles
  where role = p_role
    and pin_hash is not null
    and pin_hash = crypt(p_pin, pin_hash);
$$;

-- Record today's check-in (idempotent per local day). Returns the check-in row.
-- Returns `setof checkins` (not a named table) so the output column names don't collide
-- with the real table columns inside the insert/on-conflict below.
-- Dropped first because changing a function's return type isn't allowed via replace.
drop function if exists record_checkin(uuid);
create function record_checkin(p_profile_id uuid)
returns setof checkins
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tz   text;
  v_date date;
begin
  select timezone into v_tz from settings limit 1;
  v_date := (now() at time zone v_tz)::date;

  insert into checkins (profile_id, checkin_date)
  values (p_profile_id, v_date)
  on conflict (profile_id, checkin_date) do nothing;

  return query
    select * from checkins c
    where c.profile_id = p_profile_id and c.checkin_date = v_date;
end;
$$;

grant execute on function get_profiles()             to anon;
grant execute on function set_pin(text, text)        to anon;
grant execute on function reset_pin(text, text)      to anon;
grant execute on function verify_pin(text, text)     to anon;
grant execute on function record_checkin(uuid)       to anon;
