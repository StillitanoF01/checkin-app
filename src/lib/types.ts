// Shared domain types (mirror the Supabase schema in supabase/migrations).

// DayStatus/Session are owned by the dependency-free windowLogic module; re-export them
// here so callers can import all domain types from one place.
import type { DayStatus, Session } from './windowLogic';
export type { DayStatus, Session };

export type Role = 'nonna' | 'iliana';

export interface Profile {
  id: string;
  role: Role;
  display_name: string;
  has_pin: boolean; // derived: whether pin_hash is set (never expose the hash)
}

export interface Settings {
  id: string;
  timezone: string; // IANA, e.g. 'Australia/Sydney'
  window_start: string; // 'HH:MM' local — day (morning) window
  window_end: string; // 'HH:MM' local
  night_window_start: string; // 'HH:MM' local — night (goodnight) window
  night_window_end: string; // 'HH:MM' local
}

export interface Checkin {
  id: string;
  profile_id: string;
  checkin_date: string; // 'YYYY-MM-DD' local date
  checked_in_at: string; // ISO timestamptz
  session: Session;
}

export interface DailyStatus {
  checkin_date: string;
  session: Session;
  status: DayStatus;
  reminder_sent_at: string | null;
  missed_alert_sent_at: string | null;
  late_checkin_notified_at: string | null;
}

export type NotificationType =
  | 'reminder' // window open to Nonna
  | 'missed_nonna' // window close to Nonna
  | 'missed_iliana' // window close to Iliana
  | 'late_reassurance' // late check-in -> Iliana
  | 'checkin_iliana'; // on-time check-in -> Iliana

export interface NotificationLogRow {
  id: string;
  type: NotificationType;
  session: Session;
  recipient: string;
  body: string;
  sent_at: string;
  provider: string;
  provider_message_id: string | null;
  status: 'sent' | 'failed';
  error: string | null;
}
