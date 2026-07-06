import { supabase } from './supabase';
import type { Checkin, Profile, Role, Session, Settings } from './types';
import * as mock from './mockApi';

// Dev-only: when the Supabase URL is the placeholder, use the in-memory mock so the
// full UI can be demoed/verified without a backend. Production is untouched.
const USE_MOCK = (import.meta.env.VITE_SUPABASE_URL ?? '').includes('placeholder');

// ── Auth / profiles (all via SECURITY DEFINER RPCs — pin_hash never leaves the DB) ──

export async function getProfiles(): Promise<Profile[]> {
  if (USE_MOCK) return mock.getProfiles();
  const { data, error } = await supabase.rpc('get_profiles');
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function getProfile(role: Role): Promise<Profile | undefined> {
  const profiles = await getProfiles();
  return profiles.find((p) => p.role === role);
}

/** First-run: set a PIN only if none exists. Returns true on success. */
export async function setPin(role: Role, pin: string): Promise<boolean> {
  if (USE_MOCK) return mock.setPin(role, pin);
  const { data, error } = await supabase.rpc('set_pin', {
    p_role: role,
    p_pin: pin,
  });
  if (error) throw error;
  return data === true;
}

/** "Forgot PIN": overwrites an existing PIN unconditionally. Returns true on success. */
export async function resetPin(role: Role, pin: string): Promise<boolean> {
  if (USE_MOCK) return mock.resetPin(role, pin);
  const { data, error } = await supabase.rpc('reset_pin', {
    p_role: role,
    p_pin: pin,
  });
  if (error) throw error;
  return data === true;
}

/** Verify a PIN. Returns the matching profile, or null on failure. */
export async function verifyPin(
  role: Role,
  pin: string
): Promise<{ id: string; role: Role; display_name: string } | null> {
  if (USE_MOCK) return mock.verifyPin(role, pin);
  const { data, error } = await supabase.rpc('verify_pin', {
    p_role: role,
    p_pin: pin,
  });
  if (error) throw error;
  const row = (data ?? [])[0];
  return row ?? null;
}

// ── Check-ins ──

export async function recordCheckin(
  profileId: string,
  session: Session = 'day'
): Promise<Checkin> {
  if (USE_MOCK) return mock.recordCheckin(profileId, session);
  const { data, error } = await supabase.rpc('record_checkin', {
    p_profile_id: profileId,
    p_session: session,
  });
  if (error) throw error;
  return (data ?? [])[0] as Checkin;
}

export async function getCheckinForDate(
  profileId: string,
  date: string,
  session: Session = 'day'
): Promise<Checkin | null> {
  if (USE_MOCK) return mock.getCheckinForDate(profileId, date, session);
  const { data, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('profile_id', profileId)
    .eq('checkin_date', date)
    .eq('session', session)
    .maybeSingle();
  if (error) throw error;
  return (data as Checkin | null) ?? null;
}

export async function getRecentCheckins(limit = 30): Promise<Checkin[]> {
  if (USE_MOCK) return mock.getRecentCheckins(limit);
  const { data, error } = await supabase
    .from('checkins')
    .select('*')
    .order('checkin_date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Checkin[];
}

// ── Settings ──

export async function getSettings(): Promise<Settings> {
  if (USE_MOCK) return mock.getSettings();
  const { data, error } = await supabase.from('settings').select('*').single();
  if (error) throw error;
  return data as Settings;
}

export async function updateSettings(
  id: string,
  patch: Partial<Omit<Settings, 'id'>>
): Promise<Settings> {
  if (USE_MOCK) return mock.updateSettings(id, patch);
  const { data, error } = await supabase
    .from('settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Settings;
}
