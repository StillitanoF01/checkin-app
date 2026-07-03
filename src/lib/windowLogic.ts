// Pure, dependency-free timezone + check-in window logic. NO I/O here — this is the
// safety-critical heart of the app and is exhaustively unit-tested (windowLogic.test.ts).
// The scheduled Edge Function wraps these functions; the frontend reuses the date/time
// helpers so "today" is computed identically on both sides.
//
// This module is intentionally DEPENDENCY-FREE (no imports) so the exact same file can
// be imported by both the Vite frontend and the Deno Edge Function without pulling in
// any transitive code. DayStatus is defined here and re-exported from types.ts.

export type DayStatus =
  | 'pending'
  | 'checked_in'
  | 'checked_in_late'
  | 'missed';

/** Local calendar date ('YYYY-MM-DD') for an instant in the given IANA timezone. */
export function localDateInTz(instant: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Minutes since local midnight (0–1439) for an instant in the given timezone. */
export function localMinutesInTz(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return get('hour') * 60 + get('minute');
}

/** Parse 'HH:MM' into minutes since midnight. */
export function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export type WindowPhase = 'before' | 'open' | 'closed';

export interface WindowInputs {
  now: Date;
  tz: string;
  windowStart: string; // 'HH:MM' local
  windowEnd: string; // 'HH:MM' local
  /** Whether Nonna has a check-in row for *today's local date*. */
  checkedIn: boolean;
  /** When she checked in (if she did), else null. */
  checkedInAt: Date | null;
  /** Per-day idempotency flags already recorded in daily_status. */
  reminderSentAt: Date | null;
  missedAlertSentAt: Date | null;
  lateNotifiedAt: Date | null;
}

export interface WindowDecision {
  phase: WindowPhase;
  /** 06:00 nudge to Nonna is due and not yet sent. */
  reminderDue: boolean;
  /** 10:00 escalation (Nonna + Iliana) is due and not yet sent. */
  missedDue: boolean;
  /** Reassurance to Iliana after a late check-in is due and not yet sent. */
  lateReassuranceDue: boolean;
  /** Display status for the dashboard. */
  status: DayStatus;
}

/**
 * Decide the window phase, which notifications are due (idempotent: only ever "due"
 * if the corresponding flag is unset), and the display status. Pure function of its
 * inputs — same inputs always yield the same decision, so re-runs send nothing new.
 */
export function windowState(input: WindowInputs): WindowDecision {
  const nowMin = localMinutesInTz(input.now, input.tz);
  const startMin = parseHHMM(input.windowStart);
  const endMin = parseHHMM(input.windowEnd);

  const phase: WindowPhase =
    nowMin < startMin ? 'before' : nowMin < endMin ? 'open' : 'closed';

  // Reminder: only meaningful during the open window, if not checked in / not sent.
  const reminderDue =
    phase === 'open' && !input.checkedIn && input.reminderSentAt === null;

  // Missed escalation: window has closed with no check-in, not yet alerted.
  const missedDue =
    phase === 'closed' && !input.checkedIn && input.missedAlertSentAt === null;

  // Late reassurance: she has now checked in, but only if we already told Iliana she
  // missed — and we haven't already sent the "all good" follow-up.
  const lateReassuranceDue =
    input.checkedIn &&
    input.missedAlertSentAt !== null &&
    input.lateNotifiedAt === null;

  let status: DayStatus;
  if (input.checkedIn) {
    const atMin =
      input.checkedInAt !== null
        ? localMinutesInTz(input.checkedInAt, input.tz)
        : nowMin;
    status = atMin >= endMin ? 'checked_in_late' : 'checked_in';
  } else {
    status = phase === 'closed' ? 'missed' : 'pending';
  }

  return { phase, reminderDue, missedDue, lateReassuranceDue, status };
}
