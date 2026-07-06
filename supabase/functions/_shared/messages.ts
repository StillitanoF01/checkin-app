// Single source of truth for every outbound message. Copy or channel changes happen
// here — the scheduler never inlines message text.

// The name used specifically in outbound Telegram messages. Deliberately independent
// from profiles.display_name (which still drives the UI — Nonna's own greeting and
// Iliana's dashboard continue to say "Nonna"). Change this one constant to update
// every message at once.
const MESSAGE_NAME = 'Luciana';

export function reminderMsg(_nonnaName: string): string {
  return `Buongiorno ${MESSAGE_NAME}! Don't forget to tap "I'm OK" in your Check-In app this morning.`;
}

export function missedNonnaMsg(_nonnaName: string): string {
  return `${MESSAGE_NAME} you have not checked in yet, your daughter is worried. Please open your Check-In app and tap "I'm OK".`;
}

export function missedIlianaMsg(_nonnaName: string): string {
  return `${MESSAGE_NAME} hasn't checked in yet today, RING YOUR MOTHER!`;
}

export function lateReassuranceMsg(_nonnaName: string, timeStr: string): string {
  return `Good news: ${MESSAGE_NAME} has checked in (at ${timeStr}).`;
}

export function onTimeCheckinMsg(_nonnaName: string, timeStr: string): string {
  return `${MESSAGE_NAME} checked in this morning at ${timeStr}. SHE'S ALIVE!`;
}

// ── Night (goodnight) session — same structure, evening copy ──

export function reminderNightMsg(_nonnaName: string): string {
  return `Buonanotte ${MESSAGE_NAME}! Don't forget to tap "I'm OK" in your Check-In app tonight.`;
}

export function missedNonnaNightMsg(_nonnaName: string): string {
  return `${MESSAGE_NAME} you have not said goodnight yet, your daughter is worried. Please open your Check-In app and tap "I'm OK".`;
}

export function missedIlianaNightMsg(_nonnaName: string): string {
  return `${MESSAGE_NAME} hasn't checked out yet, RING YOUR MOTHER!`;
}

export function lateReassuranceNightMsg(_nonnaName: string, timeStr: string): string {
  return `Good news: ${MESSAGE_NAME} has gone ninis after all (at ${timeStr}).`;
}

export function onTimeCheckinNightMsg(_nonnaName: string, timeStr: string): string {
  return `Good news: ${MESSAGE_NAME} has gone ninis (at ${timeStr}).`;
}
