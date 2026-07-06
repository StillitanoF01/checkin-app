-- Adds a second, independent daily check-in window ("night" / goodnight), alongside the
-- existing "day" (morning) window. Every table that tracks per-day state gets a `session`
-- column so the same idempotent flow (reminder -> missed escalation -> late reassurance)
-- can run twice a day without duplicating tables or RPCs.

alter table settings
  add column if not exists night_window_start text not null default '18:00',
  add column if not exists night_window_end   text not null default '22:00';

-- checkins: one row per (profile, date, session).
alter table checkins
  add column if not exists session text not null default 'day' check (session in ('day', 'night'));

alter table checkins drop constraint if exists checkins_profile_id_checkin_date_key;
alter table checkins add constraint checkins_profile_id_checkin_date_session_key
  unique (profile_id, checkin_date, session);

-- daily_status: one row per (date, session).
alter table daily_status
  add column if not exists session text not null default 'day' check (session in ('day', 'night'));

alter table daily_status drop constraint if exists daily_status_pkey;
alter table daily_status add constraint daily_status_pkey primary key (checkin_date, session);

-- notifications_log: tag which session an alert belongs to.
alter table notifications_log
  add column if not exists session text not null default 'day' check (session in ('day', 'night'));

-- record_checkin: accept a session, default 'day' so existing callers are unaffected.
-- Dropped first because changing a function's signature isn't allowed via replace.
drop function if exists record_checkin(uuid);
create function record_checkin(p_profile_id uuid, p_session text default 'day')
returns setof checkins
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_tz   text;
  v_date date;
begin
  if p_session not in ('day', 'night') then
    raise exception 'session must be ''day'' or ''night''';
  end if;

  select timezone into v_tz from settings limit 1;
  v_date := (now() at time zone v_tz)::date;

  insert into checkins (profile_id, checkin_date, session)
  values (p_profile_id, v_date, p_session)
  on conflict (profile_id, checkin_date, session) do nothing;

  return query
    select * from checkins c
    where c.profile_id = p_profile_id and c.checkin_date = v_date and c.session = p_session;
end;
$$;

grant execute on function record_checkin(uuid, text) to anon;
