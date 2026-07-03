// Small display formatters. All time formatting is timezone-aware (never local-machine).

/** e.g. "7:42 am" for an ISO instant, shown in the configured timezone. */
export function formatTimeInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
    .format(new Date(iso))
    .toLowerCase();
}

/** e.g. "Thursday, 3 July" for a YYYY-MM-DD local date (no timezone shift). */
export function formatDateLong(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(y, m - 1, d));
}

/** e.g. "Thu 3 Jul" — compact form for history rows. */
export function formatDateShort(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(y, m - 1, d));
}
