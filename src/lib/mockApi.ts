// Dev-only in-memory backend. Active only when VITE_SUPABASE_URL is the placeholder
// (see USE_MOCK in api.ts), so the real app is never affected. Lets the whole UI be
// demoed/verified locally without a Supabase project. State persists in localStorage so
// check-ins survive a reload.

import type { Checkin, Profile, Role, Settings } from './types';
import { localDateInTz } from './windowLogic';

const NONNA_ID = 'mock-nonna';
const ILIANA_ID = 'mock-iliana';

interface Store {
  pins: Partial<Record<Role, string>>;
  settings: Settings;
  checkins: Checkin[];
}

const KEY = 'checkin.mock';

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    /* ignore */
  }
  return {
    pins: {},
    settings: {
      id: 'mock-settings',
      timezone: 'Australia/Sydney',
      window_start: '06:00',
      window_end: '10:00',
    },
    checkins: [],
  };
}

let store = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(store));
const delay = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120));

export async function getProfiles(): Promise<Profile[]> {
  return delay([
    { id: NONNA_ID, role: 'nonna', display_name: 'Nonna', has_pin: !!store.pins.nonna },
    { id: ILIANA_ID, role: 'iliana', display_name: 'Iliana', has_pin: !!store.pins.iliana },
  ]);
}

export async function setPin(role: Role, pin: string): Promise<boolean> {
  if (store.pins[role]) return delay(false);
  store.pins[role] = pin;
  save();
  return delay(true);
}

export async function verifyPin(
  role: Role,
  pin: string
): Promise<{ id: string; role: Role; display_name: string } | null> {
  if (store.pins[role] !== pin) return delay(null);
  return delay({
    id: role === 'nonna' ? NONNA_ID : ILIANA_ID,
    role,
    display_name: role === 'nonna' ? 'Nonna' : 'Iliana',
  });
}

export async function recordCheckin(profileId: string): Promise<Checkin> {
  const date = localDateInTz(new Date(), store.settings.timezone);
  let existing = store.checkins.find(
    (c) => c.profile_id === profileId && c.checkin_date === date
  );
  if (!existing) {
    existing = {
      id: `mock-${date}`,
      profile_id: profileId,
      checkin_date: date,
      checked_in_at: new Date().toISOString(),
    };
    store.checkins.push(existing);
    save();
  }
  return delay(existing);
}

export async function getCheckinForDate(
  profileId: string,
  date: string
): Promise<Checkin | null> {
  return delay(
    store.checkins.find(
      (c) => c.profile_id === profileId && c.checkin_date === date
    ) ?? null
  );
}

export async function getRecentCheckins(limit = 30): Promise<Checkin[]> {
  const sorted = [...store.checkins].sort((a, b) =>
    a.checkin_date < b.checkin_date ? 1 : -1
  );
  return delay(sorted.slice(0, limit));
}

export async function getSettings(): Promise<Settings> {
  return delay(store.settings);
}

export async function updateSettings(
  _id: string,
  patch: Partial<Omit<Settings, 'id'>>
): Promise<Settings> {
  store.settings = { ...store.settings, ...patch };
  save();
  return delay(store.settings);
}
