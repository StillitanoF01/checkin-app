// Shared domain types (mirror the Supabase schema in supabase/migrations).

// DayStatus is owned by the dependency-free windowLogic module; re-export it here so
// callers can import all domain types from one place.
import type { DayStatus } from './windowLogic';
export type { DayStatus };

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
  window_start: string; // 'HH:MM' local
  window_end: string; // 'HH:MM' local
}

export interface Checkin {
  id: string;
  profile_id: string;
  checkin_date: string; // 'YYYY-MM-DD' local date
  checked_in_at: string; // ISO timestamptz
}

export interface DailyStatus {
  checkin_date: string;
  status: DayStatus;
  reminder_sent_at: string | null;
  missed_alert_sent_at: string | null;
  late_checkin_notified_at: string | null;
}

export type NotificationType =
  | 'reminder' // 06:00 to Nonna
  | 'missed_nonna' // 10:00 to Nonna
  | 'missed_iliana' // 10:00 to Iliana
  | 'late_reassurance'; // late check-in -> Iliana

export interface NotificationLogRow {
  id: string;
  type: NotificationType;
  recipient: string;
  body: string;
  sent_at: string;
  provider: string;
  provider_message_id: string | null;
  status: 'sent' | 'failed';
  error: string | null;
}
