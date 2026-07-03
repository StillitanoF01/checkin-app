// Pure helpers for the dashboard's history + streak. Operate on 'YYYY-MM-DD' local
// calendar dates as strings, so they're free of timezone/DST drift.

const DAY_MS = 86_400_000;

function toUtcBase(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcBase(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The `count` most recent local dates ending at (and including) `today`, newest first. */
export function recentLocalDates(today: string, count: number): string[] {
  const base = toUtcBase(today);
  return Array.from({ length: count }, (_, i) => fromUtcBase(base - i * DAY_MS));
}

/** The previous calendar date. */
export function previousDate(ymd: string): string {
  return fromUtcBase(toUtcBase(ymd) - DAY_MS);
}

/**
 * Current streak of consecutive checked-in days ending at today (or yesterday if today
 * isn't checked in yet — so the streak doesn't read as "broken" before the morning tap).
 */
export function computeStreak(checkedDates: Set<string>, today: string): number {
  let cursor = checkedDates.has(today) ? today : previousDate(today);
  let streak = 0;
  while (checkedDates.has(cursor)) {
    streak += 1;
    cursor = previousDate(cursor);
  }
  return streak;
}
