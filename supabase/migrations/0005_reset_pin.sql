-- Iliana-only "forgot PIN" flow: after enough wrong attempts, the UI offers a reset.
-- Unlike set_pin (which only works when no PIN exists yet), reset_pin overwrites an
-- existing PIN unconditionally — trust model is "whoever holds the phone can reset it",
-- same as any lightweight family app. Nonna no longer has a PIN at all, so this only
-- matters for Iliana in practice, but it's written generically per-role like set_pin.

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

grant execute on function reset_pin(text, text) to anon;
