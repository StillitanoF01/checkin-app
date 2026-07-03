// Runtime-agnostic scheduler core. Depends only on:
//   * the pure windowLogic (canonical file, shared with the frontend),
//   * a CheckWindowRepo data-access interface (real impl = Supabase; test impl = fakes),
//   * a NotificationProvider (telegram in prod, mock in dev/tests).
//
// Because side effects are behind interfaces and the clock is injected, the whole
// missed→escalate→reassure flow is verifiable offline (see scheduler.test.ts).

import { localDateInTz, windowState } from '../../../src/lib/windowLogic.ts';
import type { NotificationProvider } from './notifications.ts';
import {
  lateReassuranceMsg,
  missedIlianaMsg,
  missedNonnaMsg,
  reminderMsg,
} from './messages.ts';

export interface SettingsRow {
  timezone: string;
  window_start: string;
  window_end: string;
}

// Recipient chat IDs, resolved from env by the caller (never hardcoded). Keyed by role
// so adding more recipients later is a one-line change here + in the env resolution.
export interface Recipients {
  nonna: string | null; // TELEGRAM_GRANDMA_CHAT_ID
  iliana: string | null; // TELEGRAM_MUM_CHAT_ID
}

export interface DailyStatusRow {
  reminder_sent_at: string | null;
  missed_alert_sent_at: string | null;
  late_checkin_notified_at: string | null;
}

export type NotificationType =
  | 'reminder'
  | 'missed_nonna'
  | 'missed_iliana'
  | 'late_reassurance';

export interface NotificationLogInput {
  type: NotificationType;
  recipient: string;
  body: string;
  provider: string;
  provider_message_id: string | null;
  status: 'sent' | 'failed';
  error: string | null;
}

export interface CheckWindowRepo {
  getSettings(): Promise<SettingsRow>;
  getNonna(): Promise<{ id: string; display_name: string }>;
  getCheckinForDate(
    profileId: string,
    date: string
  ): Promise<{ checked_in_at: string } | null>;
  getDailyStatus(date: string): Promise<DailyStatusRow>;
  setReminderSent(date: string, atIso: string): Promise<void>;
  setMissedAlertSent(date: string, atIso: string): Promise<void>;
  setLateNotified(date: string, atIso: string): Promise<void>;
  logNotification(row: NotificationLogInput): Promise<void>;
  formatTime(iso: string, tz: string): string;
}

export interface RunSummary {
  date: string;
  phase: string;
  status: string;
  reminderSent: boolean;
  missedAlertSent: boolean; // true only if Iliana's alert was confirmed sent
  lateReassuranceSent: boolean;
  failures: number;
}

export async function runCheckWindow(
  repo: CheckWindowRepo,
  provider: NotificationProvider,
  recipients: Recipients,
  now: Date
): Promise<RunSummary> {
  const settings = await repo.getSettings();
  const nonna = await repo.getNonna();
  const tz = settings.timezone;

  // "Today" computed in the configured zone — identical to the frontend's calc.
  const today = localDateInTz(now, tz);

  const checkin = await repo.getCheckinForDate(nonna.id, today);
  const ds = await repo.getDailyStatus(today);

  const decision = windowState({
    now,
    tz,
    windowStart: settings.window_start,
    windowEnd: settings.window_end,
    checkedIn: checkin !== null,
    checkedInAt: checkin ? new Date(checkin.checked_in_at) : null,
    reminderSentAt: ds.reminder_sent_at ? new Date(ds.reminder_sent_at) : null,
    missedAlertSentAt: ds.missed_alert_sent_at
      ? new Date(ds.missed_alert_sent_at)
      : null,
    lateNotifiedAt: ds.late_checkin_notified_at
      ? new Date(ds.late_checkin_notified_at)
      : null,
  });

  const nowIso = now.toISOString();
  let failures = 0;
  let reminderSent = false;
  let missedAlertSent = false;
  let lateReassuranceSent = false;

  const deliver = async (
    type: NotificationType,
    to: string | null,
    body: string
  ): Promise<boolean> => {
    if (!to) {
      // No chat ID configured — log a failure so it's visible, don't crash.
      await repo.logNotification({
        type,
        recipient: '(unset)',
        body,
        provider: provider.name,
        provider_message_id: null,
        status: 'failed',
        error: 'No recipient chat ID configured',
      });
      failures += 1;
      return false;
    }
    const res = await provider.send({ to, body });
    await repo.logNotification({
      type,
      recipient: to,
      body,
      provider: res.provider,
      provider_message_id: res.providerMessageId,
      status: res.ok ? 'sent' : 'failed',
      error: res.error,
    });
    if (!res.ok) failures += 1;
    return res.ok;
  };

  // 1) 06:00 reminder to Nonna. Flag only on success so failures retry next poll.
  if (decision.reminderDue) {
    const ok = await deliver('reminder', recipients.nonna, reminderMsg(nonna.display_name));
    if (ok) {
      await repo.setReminderSent(today, nowIso);
      reminderSent = true;
    }
  }

  // 2) 10:00 escalation: Nonna + Iliana. The Iliana alert is the safety-critical one —
  //    we only set the idempotency flag once IT is confirmed sent, so a failed Iliana
  //    send is retried on the next poll.
  if (decision.missedDue) {
    await deliver('missed_nonna', recipients.nonna, missedNonnaMsg(nonna.display_name));
    const ilianaOk = await deliver(
      'missed_iliana',
      recipients.iliana,
      missedIlianaMsg(nonna.display_name)
    );
    if (ilianaOk) {
      await repo.setMissedAlertSent(today, nowIso);
      missedAlertSent = true;
    }
  }

  // 3) Late reassurance to Iliana after she was told about a miss.
  if (decision.lateReassuranceDue) {
    const timeStr = checkin ? repo.formatTime(checkin.checked_in_at, tz) : '';
    const ok = await deliver(
      'late_reassurance',
      recipients.iliana,
      lateReassuranceMsg(nonna.display_name, timeStr)
    );
    if (ok) {
      await repo.setLateNotified(today, nowIso);
      lateReassuranceSent = true;
    }
  }

  return {
    date: today,
    phase: decision.phase,
    status: decision.status,
    reminderSent,
    missedAlertSent,
    lateReassuranceSent,
    failures,
  };
}
