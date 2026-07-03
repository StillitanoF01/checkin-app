// Single source of truth for every outbound message. Copy or channel changes happen
// here — the scheduler never inlines message text.

export function reminderMsg(nonnaName: string): string {
  return `Good morning ${nonnaName}! Just a gentle reminder to tap "I'm OK" in your Check-In app this morning. ❤️`;
}

export function missedNonnaMsg(nonnaName: string): string {
  return `Hi ${nonnaName}, we haven't heard from you yet today. Please open your Check-In app and tap "I'm OK" so we know you're alright.`;
}

export function missedIlianaMsg(nonnaName: string): string {
  return `Check-In alert: ${nonnaName} hasn't checked in yet today. You may want to give her a call.`;
}

export function lateReassuranceMsg(nonnaName: string, timeStr: string): string {
  return `Good news: ${nonnaName} has now checked in (at ${timeStr}). All is well. ❤️`;
}
