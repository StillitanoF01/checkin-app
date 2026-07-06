import { beforeEach, describe, expect, it } from 'vitest';
import { MockProvider } from '../../supabase/functions/_shared/notifications.ts';
import {
  runCheckWindow,
  type CheckWindowRepo,
  type DailyStatusRow,
  type NotificationLogInput,
  type Recipients,
  type SettingsRow,
} from '../../supabase/functions/_shared/scheduler.ts';
import type { Session } from './windowLogic';

// Telegram chat IDs, resolved from env in production. Grandma=Nonna, Mum=Iliana.
const RECIPIENTS: Recipients = { nonna: 'chat-nonna', iliana: 'chat-iliana' };

const EMPTY_DAILY: DailyStatusRow = {
  reminder_sent_at: null,
  missed_alert_sent_at: null,
  late_checkin_notified_at: null,
  checkin_notified_at: null,
};

// In-memory implementation of the data-access layer the scheduler depends on. Lets us
// drive the whole missed→escalate→reassure flow (for both sessions) with an injected
// clock and no network. Maps are keyed by `date:session` since day and night are
// tracked independently.
class FakeRepo implements CheckWindowRepo {
  settings: SettingsRow = {
    timezone: 'Australia/Sydney',
    window_start: '06:00',
    window_end: '10:00',
    night_window_start: '18:00',
    night_window_end: '22:00',
  };
  nonna = { id: 'nonna-id', display_name: 'Nonna' };
  checkins = new Map<string, string>(); // "date:session" -> checked_in_at ISO
  daily = new Map<string, DailyStatusRow>(); // "date:session" -> flags
  logs: NotificationLogInput[] = [];

  private key(date: string, session: Session) {
    return `${date}:${session}`;
  }

  private ds(date: string, session: Session): DailyStatusRow {
    return this.daily.get(this.key(date, session)) ?? EMPTY_DAILY;
  }

  getSettings() {
    return Promise.resolve(this.settings);
  }
  getNonna() {
    return Promise.resolve(this.nonna);
  }
  getCheckinForDate(_profileId: string, date: string, session: Session) {
    const at = this.checkins.get(this.key(date, session));
    return Promise.resolve(at ? { checked_in_at: at } : null);
  }
  getDailyStatus(date: string, session: Session) {
    return Promise.resolve(this.ds(date, session));
  }
  setReminderSent(date: string, session: Session, atIso: string) {
    this.daily.set(this.key(date, session), { ...this.ds(date, session), reminder_sent_at: atIso });
    return Promise.resolve();
  }
  setMissedAlertSent(date: string, session: Session, atIso: string) {
    this.daily.set(this.key(date, session), {
      ...this.ds(date, session),
      missed_alert_sent_at: atIso,
    });
    return Promise.resolve();
  }
  setLateNotified(date: string, session: Session, atIso: string) {
    this.daily.set(this.key(date, session), {
      ...this.ds(date, session),
      late_checkin_notified_at: atIso,
    });
    return Promise.resolve();
  }
  setCheckinNotified(date: string, session: Session, atIso: string) {
    this.daily.set(this.key(date, session), {
      ...this.ds(date, session),
      checkin_notified_at: atIso,
    });
    return Promise.resolve();
  }
  logNotification(row: NotificationLogInput) {
    this.logs.push(row);
    return Promise.resolve();
  }
  formatTime(iso: string, tz: string) {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  }
}

const t = (iso: string) => new Date(iso);

describe('runCheckWindow — missed morning escalation', () => {
  let repo: FakeRepo;
  let provider: MockProvider;
  beforeEach(() => {
    repo = new FakeRepo();
    provider = new MockProvider();
  });

  it('sends exactly one message to each party when the window closes with no check-in', async () => {
    const summary = await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T10:05:00+11:00'));

    expect(summary.day.status).toBe('missed');
    expect(summary.day.missedAlertSent).toBe(true);
    expect(provider.sent.map((m) => m.to).sort()).toEqual([
      'chat-iliana', // Iliana
      'chat-nonna', // Nonna
    ]);
    const types = repo.logs.map((l) => l.type).sort();
    expect(types).toEqual(['missed_iliana', 'missed_nonna']);
    expect(repo.logs.every((l) => l.status === 'sent')).toBe(true);
    expect(repo.logs.every((l) => l.session === 'day')).toBe(true);
  });

  it('is idempotent — a second poll sends nothing further', async () => {
    await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T10:05:00+11:00'));
    await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T10:10:00+11:00'));
    expect(provider.sent).toHaveLength(2); // still just the first escalation
  });
});

describe('runCheckWindow — check-in suppresses alerts', () => {
  it('sends the 06:00 reminder, then no missed alert once she has checked in', async () => {
    const repo = new FakeRepo();
    const provider = new MockProvider();

    // 07:00 — open window, not checked in -> one reminder to Nonna.
    let summary = await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T07:00:00+11:00'));
    expect(summary.day.reminderSent).toBe(true);
    expect(provider.sent).toHaveLength(1);
    expect(repo.logs[0].type).toBe('reminder');

    // She checks in at 07:30 -> the on-time notification to Iliana fires once.
    repo.checkins.set('2025-01-15:day', '2025-01-15T07:30:00+11:00');
    summary = await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T07:31:00+11:00'));
    expect(summary.day.checkinNotifySent).toBe(true);
    expect(provider.sent).toHaveLength(2);
    expect(provider.sent[1].to).toBe('chat-iliana');

    // 10:05 — window closed but she checked in -> no escalation, and the on-time
    // notification doesn't repeat.
    summary = await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T10:05:00+11:00'));
    expect(summary.day.status).toBe('checked_in');
    expect(summary.day.missedAlertSent).toBe(false);
    expect(provider.sent).toHaveLength(2); // unchanged
  });
});

describe('runCheckWindow — late check-in reassurance', () => {
  it('reassures Iliana exactly once after a missed morning, then stops', async () => {
    const repo = new FakeRepo();
    const provider = new MockProvider();

    // Missed escalation first (2 sends).
    await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T10:05:00+11:00'));
    expect(provider.sent).toHaveLength(2);

    // Nonna finally checks in at 10:40.
    repo.checkins.set('2025-01-15:day', '2025-01-15T10:40:00+11:00');

    // Next poll -> one reassurance message to Iliana.
    const summary = await runCheckWindow(
      repo,
      provider,
      RECIPIENTS,
      t('2025-01-15T10:41:00+11:00')
    );
    expect(summary.day.status).toBe('checked_in_late');
    expect(summary.day.lateReassuranceSent).toBe(true);
    expect(provider.sent).toHaveLength(3);
    expect(provider.sent[2].to).toBe('chat-iliana'); // Iliana
    expect(repo.logs.at(-1)?.type).toBe('late_reassurance');

    // Further polls send nothing.
    await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T10:46:00+11:00'));
    expect(provider.sent).toHaveLength(3);
  });
});

describe('runCheckWindow — on-time check-in notification to Iliana', () => {
  it('notifies Iliana once when Nonna checks in on time', async () => {
    const repo = new FakeRepo();
    const provider = new MockProvider();
    repo.checkins.set('2025-01-15:day', '2025-01-15T07:30:00+11:00');

    const summary = await runCheckWindow(
      repo,
      provider,
      RECIPIENTS,
      t('2025-01-15T07:31:00+11:00')
    );
    expect(summary.day.status).toBe('checked_in');
    expect(summary.day.checkinNotifySent).toBe(true);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0].to).toBe('chat-iliana');
    expect(repo.logs[0].type).toBe('checkin_iliana');

    // Re-polling doesn't send it again.
    await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T07:35:00+11:00'));
    expect(provider.sent).toHaveLength(1);
  });

  it('does not fire this notification for a late check-in (uses lateReassurance instead)', async () => {
    const repo = new FakeRepo();
    const provider = new MockProvider();

    // Missed escalation first, then a late check-in.
    await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T10:05:00+11:00'));
    repo.checkins.set('2025-01-15:day', '2025-01-15T10:40:00+11:00');
    const summary = await runCheckWindow(
      repo,
      provider,
      RECIPIENTS,
      t('2025-01-15T10:41:00+11:00')
    );
    expect(summary.day.status).toBe('checked_in_late');
    expect(summary.day.checkinNotifySent).toBe(false);
    expect(summary.day.lateReassuranceSent).toBe(true);
    expect(repo.logs.some((l) => l.type === 'checkin_iliana')).toBe(false);
  });
});

describe('runCheckWindow — one-tap buttons (appUrl)', () => {
  const APP_URL = 'https://checkin-app-inky.vercel.app';

  it('omits buttons when appUrl is not provided', async () => {
    const repo = new FakeRepo();
    const provider = new MockProvider();
    await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T07:00:00+11:00'));
    expect(provider.sent[0].button).toBeUndefined();
  });

  it("adds a bold 'CHECK IN NOW' button to Nonna's reminder linking to /nonna", async () => {
    const repo = new FakeRepo();
    const provider = new MockProvider();
    await runCheckWindow(
      repo,
      provider,
      RECIPIENTS,
      t('2025-01-15T07:00:00+11:00'),
      APP_URL
    );
    expect(provider.sent[0].button).toEqual({
      text: '✅ CHECK IN NOW',
      url: `${APP_URL}/nonna`,
    });
  });

  it("adds a bold 'OPEN DASHBOARD' button to Iliana's missed alert linking to /iliana", async () => {
    const repo = new FakeRepo();
    const provider = new MockProvider();
    await runCheckWindow(
      repo,
      provider,
      RECIPIENTS,
      t('2025-01-15T10:05:00+11:00'),
      APP_URL
    );
    const ilianaMsg = provider.sent.find((m) => m.to === 'chat-iliana');
    expect(ilianaMsg?.button).toEqual({
      text: '📋 OPEN DASHBOARD',
      url: `${APP_URL}/iliana`,
    });
  });
});

describe('runCheckWindow — failed send retries (flag not set on failure)', () => {
  it("does not set the missed flag if Iliana's message fails, so it retries next poll", async () => {
    const repo = new FakeRepo();
    // Provider that fails every send.
    const failing = {
      name: 'failing',
      send: () =>
        Promise.resolve({
          ok: false,
          provider: 'failing',
          providerMessageId: null,
          error: 'simulated failure',
        }),
    };

    const first = await runCheckWindow(repo, failing, RECIPIENTS, t('2025-01-15T10:05:00+11:00'));
    expect(first.day.missedAlertSent).toBe(false);
    expect(first.day.failures).toBeGreaterThan(0);
    expect(repo.daily.get('2025-01-15:day')?.missed_alert_sent_at ?? null).toBeNull();

    // Now the provider recovers — the retry actually delivers.
    const provider = new MockProvider();
    const second = await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T10:10:00+11:00'));
    expect(second.day.missedAlertSent).toBe(true);
    expect(provider.sent).toHaveLength(2);
  });
});

describe('runCheckWindow — night (goodnight) session runs independently of day', () => {
  it('sends the goodnight reminder at window-open, separate from the morning flow', async () => {
    const repo = new FakeRepo();
    const provider = new MockProvider();

    // 18:30 — morning window long closed & missed, goodnight window just opened.
    const summary = await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T18:30:00+11:00'));

    expect(summary.day.status).toBe('missed'); // no morning check-in either
    expect(summary.night.reminderSent).toBe(true);
    const nightLogs = repo.logs.filter((l) => l.session === 'night');
    expect(nightLogs).toHaveLength(1);
    expect(nightLogs[0].type).toBe('reminder');
    expect(nightLogs[0].body).toContain('Buonanotte');
  });

  it('escalates to Nonna + Iliana when the goodnight window closes with no check-in', async () => {
    const repo = new FakeRepo();
    const provider = new MockProvider();

    const summary = await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T22:05:00+11:00'));

    expect(summary.night.status).toBe('missed');
    expect(summary.night.missedAlertSent).toBe(true);
    const nightLogs = repo.logs.filter((l) => l.session === 'night').map((l) => l.type).sort();
    expect(nightLogs).toEqual(['missed_iliana', 'missed_nonna']);
    const ilianaMsg = provider.sent.find((m) => m.to === 'chat-iliana');
    expect(ilianaMsg?.body).toContain('RING YOUR MOTHER');
  });

  it('notifies Iliana with the "gone ninis" message for an on-time goodnight check-in', async () => {
    const repo = new FakeRepo();
    const provider = new MockProvider();
    repo.checkins.set('2025-01-15:night', '2025-01-15T20:15:00+11:00');

    const summary = await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T20:16:00+11:00'));

    expect(summary.night.status).toBe('checked_in');
    expect(summary.night.checkinNotifySent).toBe(true);
    const nightLog = repo.logs.find((l) => l.type === 'checkin_iliana' && l.session === 'night');
    expect(nightLog?.body).toContain('gone ninis');
    expect(nightLog?.body).not.toContain('after all');
  });

  it('uses distinct copy for a late goodnight check-in reassurance', async () => {
    const repo = new FakeRepo();
    const provider = new MockProvider();

    // Missed escalation first.
    await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T22:05:00+11:00'));
    // She finally checks in late.
    repo.checkins.set('2025-01-15:night', '2025-01-15T22:40:00+11:00');

    const summary = await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T22:41:00+11:00'));
    expect(summary.night.status).toBe('checked_in_late');
    expect(summary.night.lateReassuranceSent).toBe(true);
    const lateMsg = repo.logs.find((l) => l.type === 'late_reassurance' && l.session === 'night');
    expect(lateMsg?.body).toContain('gone ninis after all');
  });

  it("day and night flags don't interfere with each other on the same poll", async () => {
    const repo = new FakeRepo();
    const provider = new MockProvider();
    // Both windows closed with no check-in at all (e.g. a poll run just after midnight
    // for yesterday would be a different date, so pick a time after both close today).
    const summary = await runCheckWindow(repo, provider, RECIPIENTS, t('2025-01-15T22:05:00+11:00'));

    expect(summary.day.status).toBe('missed');
    expect(summary.day.missedAlertSent).toBe(true);
    expect(summary.night.status).toBe('missed');
    expect(summary.night.missedAlertSent).toBe(true);
    // 2 for day (Nonna+Iliana) + 2 for night (Nonna+Iliana) = 4 total.
    expect(provider.sent).toHaveLength(4);
  });
});
