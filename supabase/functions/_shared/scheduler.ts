// Runtime-agnostic scheduler core. Depends only on:
//   * the pure windowLogic (canonical file, shared with the frontend),
//   * a CheckWindowRepo data-access interface (real impl = Supabase; test impl = fakes),
//   * a NotificationProvider (telegram in prod, mock in dev/tests).
//
// Because side effects are behind interfaces and the clock is injected, the whole
// missed→escalate→reassure flow is verifiable offline (see scheduler.test.ts).
//
// There are two independent daily windows — 'day' (morning) and 'night' (goodnight) —
// each running the exact same reminder/missed/reassurance state machine via
// windowState(). processSession() holds that shared logic; runCheckWindow() calls it
// once per session with the right settings/messages.

import { localDateInTz, windowState, type Session } from '../../../src/lib/windowLogic.ts';
import type { NotificationProvider } from './notifications.ts';
import {
  lateReassuranceMsg,
  lateReassuranceNightMsg,
  missedIlianaMsg,
  missedIlianaNightMsg,
  missedNonnaMsg,
  missedNonnaNightMsg,
  onTimeCheckinMsg,
  onTimeCheckinNightMsg,
  reminderMsg,
  reminderNightMsg,
} from './messages.ts';

export interface SettingsRow {
  timezone: string;
  window_start: string;
  window_end: string;
  night_window_start: string;
  night_window_end: string;
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
  checkin_notified_at: string | null;
}

export type NotificationType =
  | 'reminder'
  | 'missed_nonna'
  | 'missed_iliana'
  | 'late_reassurance'
  | 'checkin_iliana';

export interface NotificationLogInput {
  type: NotificationType;
  session: Session;
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
    date: string,
    session: Session
  ): Promise<{ checked_in_at: string } | null>;
  getDailyStatus(date: string, session: Session): Promise<DailyStatusRow>;
  setReminderSent(date: string, session: Session, atIso: string): Promise<void>;
  setMissedAlertSent(date: string, session: Session, atIso: string): Promise<void>;
  setLateNotified(date: string, session: Session, atIso: string): Promise<void>;
  setCheckinNotified(date: string, session: Session, atIso: string): Promise<void>;
  logNotification(row: NotificationLogInput): Promise<void>;
  formatTime(iso: string, tz: string): string;
}

export interface SessionSummary {
  date: string;
  phase: string;
  status: string;
  reminderSent: boolean;
  missedAlertSent: boolean; // true only if Iliana's alert was confirmed sent
  lateReassuranceSent: boolean;
  checkinNotifySent: boolean;
  failures: number;
}

export interface RunSummary {
  day: SessionSummary;
  night: SessionSummary;
}

interface SessionMessages {
  reminder: (name: string) => string;
  missedNonna: (name: string) => string;
  missedIliana: (name: string) => string;
  lateReassurance: (name: string, timeStr: string) => string;
  onTimeCheckin: (name: string, timeStr: string) => string;
}

const DAY_MESSAGES: SessionMessages = {
  reminder: reminderMsg,
  missedNonna: missedNonnaMsg,
  missedIliana: missedIlianaMsg,
  lateReassurance: lateReassuranceMsg,
  onTimeCheckin: onTimeCheckinMsg,
};

const NIGHT_MESSAGES: SessionMessages = {
  reminder: reminderNightMsg,
  missedNonna: missedNonnaNightMsg,
  missedIliana: missedIlianaNightMsg,
  lateReassurance: lateReassuranceNightMsg,
  onTimeCheckin: onTimeCheckinNightMsg,
};

async function processSession(
  repo: CheckWindowRepo,
  provider: NotificationProvider,
  recipients: Recipients,
  now: Date,
  session: Session,
  nonna: { id: string; display_name: string },
  tz: string,
  windowStart: string,
  windowEnd: string,
  msgs: SessionMessages,
  buttons: {
    nonna?: { text: string; url: string };
    iliana?: { text: string; url: string };
  }
): Promise<SessionSummary> {
  const today = localDateInTz(now, tz);

  const checkin = await repo.getCheckinForDate(nonna.id, today, session);
  const ds = await repo.getDailyStatus(today, session);

  const decision = windowState({
    now,
    tz,
    windowStart,
    windowEnd,
    checkedIn: checkin !== null,
    checkedInAt: checkin ? new Date(checkin.checked_in_at) : null,
    reminderSentAt: ds.reminder_sent_at ? new Date(ds.reminder_sent_at) : null,
    missedAlertSentAt: ds.missed_alert_sent_at ? new Date(ds.missed_alert_sent_at) : null,
    lateNotifiedAt: ds.late_checkin_notified_at
      ? new Date(ds.late_checkin_notified_at)
      : null,
    checkinNotifiedAt: ds.checkin_notified_at ? new Date(ds.checkin_notified_at) : null,
  });

  const nowIso = now.toISOString();
  let failures = 0;
  let reminderSent = false;
  let missedAlertSent = false;
  let lateReassuranceSent = false;
  let checkinNotifySent = false;

  const deliver = async (
    type: NotificationType,
    to: string | null,
    body: string,
    button?: { text: string; url: string }
  ): Promise<boolean> => {
    if (!to) {
      // No chat ID configured — log a failure so it's visible, don't crash.
      await repo.logNotification({
        type,
        session,
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
    const res = await provider.send({ to, body, button });
    await repo.logNotification({
      type,
      session,
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

  // 1) Window-open reminder to Nonna. Flag only on success so failures retry next poll.
  if (decision.reminderDue) {
    const ok = await deliver(
      'reminder',
      recipients.nonna,
      msgs.reminder(nonna.display_name),
      buttons.nonna
    );
    if (ok) {
      await repo.setReminderSent(today, session, nowIso);
      reminderSent = true;
    }
  }

  // 2) Window-close escalation: Nonna + Iliana. The Iliana alert is the safety-critical
  //    one — we only set the idempotency flag once IT is confirmed sent, so a failed
  //    Iliana send is retried on the next poll.
  if (decision.missedDue) {
    await deliver(
      'missed_nonna',
      recipients.nonna,
      msgs.missedNonna(nonna.display_name),
      buttons.nonna
    );
    const ilianaOk = await deliver(
      'missed_iliana',
      recipients.iliana,
      msgs.missedIliana(nonna.display_name),
      buttons.iliana
    );
    if (ilianaOk) {
      await repo.setMissedAlertSent(today, session, nowIso);
      missedAlertSent = true;
    }
  }

  // 3) Late reassurance to Iliana after she was told about a miss.
  if (decision.lateReassuranceDue) {
    const timeStr = checkin ? repo.formatTime(checkin.checked_in_at, tz) : '';
    const ok = await deliver(
      'late_reassurance',
      recipients.iliana,
      msgs.lateReassurance(nonna.display_name, timeStr),
      buttons.iliana
    );
    if (ok) {
      await repo.setLateNotified(today, session, nowIso);
      lateReassuranceSent = true;
    }
  }

  // 4) Tell Iliana Nonna checked in on time (within the window) — a quiet "all good"
  //    ping, separate from the late-reassurance case above.
  if (decision.checkinNotifyDue) {
    const timeStr = checkin ? repo.formatTime(checkin.checked_in_at, tz) : '';
    const ok = await deliver(
      'checkin_iliana',
      recipients.iliana,
      msgs.onTimeCheckin(nonna.display_name, timeStr),
      buttons.iliana
    );
    if (ok) {
      await repo.setCheckinNotified(today, session, nowIso);
      checkinNotifySent = true;
    }
  }

  return {
    date: today,
    phase: decision.phase,
    status: decision.status,
    reminderSent,
    missedAlertSent,
    lateReassuranceSent,
    checkinNotifySent,
    failures,
  };
}

export async function runCheckWindow(
  repo: CheckWindowRepo,
  provider: NotificationProvider,
  recipients: Recipients,
  now: Date,
  /** Base app URL (no trailing slash), e.g. "https://checkin-app-inky.vercel.app".
   *  When set, messages include a one-tap button straight into the app. */
  appUrl?: string
): Promise<RunSummary> {
  const settings = await repo.getSettings();
  const nonna = await repo.getNonna();
  const tz = settings.timezone;

  // One-tap buttons straight into each person's screen (omitted if no appUrl is set).
  // Telegram doesn't expose a size/scale control for inline buttons — a single button
  // always spans the full message width — so boldness here comes from the label text.
  const buttons = {
    nonna: appUrl ? { text: '✅ CHECK IN NOW', url: `${appUrl}/nonna` } : undefined,
    iliana: appUrl ? { text: '📋 OPEN DASHBOARD', url: `${appUrl}/iliana` } : undefined,
  };

  const day = await processSession(
    repo,
    provider,
    recipients,
    now,
    'day',
    nonna,
    tz,
    settings.window_start,
    settings.window_end,
    DAY_MESSAGES,
    buttons
  );

  const night = await processSession(
    repo,
    provider,
    recipients,
    now,
    'night',
    nonna,
    tz,
    settings.night_window_start,
    settings.night_window_end,
    NIGHT_MESSAGES,
    buttons
  );

  return { day, night };
}
