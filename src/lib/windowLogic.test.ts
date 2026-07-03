import { describe, expect, it } from 'vitest';
import {
  localDateInTz,
  localMinutesInTz,
  parseHHMM,
  windowState,
  type WindowInputs,
} from './windowLogic';

const SYD = 'Australia/Sydney';

// Base set of inputs for a "nothing sent, not checked in" 06:00–10:00 Sydney window.
function inputs(overrides: Partial<WindowInputs>): WindowInputs {
  return {
    now: new Date('2025-01-15T07:00:00+11:00'),
    tz: SYD,
    windowStart: '06:00',
    windowEnd: '10:00',
    checkedIn: false,
    checkedInAt: null,
    reminderSentAt: null,
    missedAlertSentAt: null,
    lateNotifiedAt: null,
    ...overrides,
  };
}

describe('parseHHMM', () => {
  it('parses hours and minutes to minutes-since-midnight', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('06:00')).toBe(360);
    expect(parseHHMM('10:30')).toBe(630);
    expect(parseHHMM('23:59')).toBe(1439);
  });
});

describe('localMinutesInTz — timezone & DST correctness', () => {
  it('maps an explicit-offset instant to the right local minutes', () => {
    // 06:00 in Sydney, given directly with the summer (+11) offset.
    const dst = new Date('2025-01-15T06:00:00+11:00');
    expect(localMinutesInTz(dst, SYD)).toBe(360);
  });

  it('handles the standard-time (+10) offset identically', () => {
    // Winter: Sydney is +10 (no DST). A UTC-naive implementation would be off by 60.
    const std = new Date('2025-07-03T06:00:00+10:00');
    expect(localMinutesInTz(std, SYD)).toBe(360);
  });

  it('is not fooled by a raw UTC instant (proves math is not UTC-naive)', () => {
    // 2025-01-15T00:00:00Z is 11:00 in Sydney (DST +11), i.e. 660 minutes.
    expect(localMinutesInTz(new Date('2025-01-15T00:00:00Z'), SYD)).toBe(660);
  });
});

describe('localDateInTz — day rollover', () => {
  it('rolls to the next local day when UTC is still the previous day', () => {
    // 13:00Z on Jan 15 = 00:00 Jan 16 in Sydney (+11).
    expect(localDateInTz(new Date('2025-01-15T13:00:00Z'), SYD)).toBe('2025-01-16');
    // UTC would still say Jan 15.
    expect(localDateInTz(new Date('2025-01-15T13:00:00Z'), 'UTC')).toBe('2025-01-15');
  });
});

describe('windowState — phases', () => {
  it('is "before" ahead of the window', () => {
    const d = windowState(inputs({ now: new Date('2025-01-15T05:30:00+11:00') }));
    expect(d.phase).toBe('before');
    expect(d.reminderDue).toBe(false);
    expect(d.status).toBe('pending');
  });

  it('is "open" during the window', () => {
    const d = windowState(inputs({ now: new Date('2025-01-15T07:00:00+11:00') }));
    expect(d.phase).toBe('open');
  });

  it('is "closed" once the end time passes', () => {
    const d = windowState(inputs({ now: new Date('2025-01-15T10:00:00+11:00') }));
    expect(d.phase).toBe('closed');
  });
});

describe('windowState — 06:00 reminder', () => {
  it('is due when open, not checked in, not yet sent', () => {
    expect(windowState(inputs({})).reminderDue).toBe(true);
  });

  it('is NOT due before the window opens', () => {
    const d = windowState(inputs({ now: new Date('2025-01-15T05:00:00+11:00') }));
    expect(d.reminderDue).toBe(false);
  });

  it('is suppressed once checked in', () => {
    const d = windowState(inputs({ checkedIn: true, checkedInAt: new Date() }));
    expect(d.reminderDue).toBe(false);
  });

  it('is idempotent — not due again after being sent', () => {
    const d = windowState(inputs({ reminderSentAt: new Date() }));
    expect(d.reminderDue).toBe(false);
  });
});

describe('windowState — 10:00 missed escalation', () => {
  const afterClose = new Date('2025-01-15T10:05:00+11:00');

  it('is due when closed with no check-in and not yet alerted', () => {
    const d = windowState(inputs({ now: afterClose }));
    expect(d.phase).toBe('closed');
    expect(d.missedDue).toBe(true);
    expect(d.status).toBe('missed');
  });

  it('is NOT due while the window is still open', () => {
    expect(windowState(inputs({})).missedDue).toBe(false);
  });

  it('is suppressed by a check-in inside the window', () => {
    const d = windowState(
      inputs({
        now: afterClose,
        checkedIn: true,
        checkedInAt: new Date('2025-01-15T08:00:00+11:00'),
      })
    );
    expect(d.missedDue).toBe(false);
    expect(d.status).toBe('checked_in');
  });

  it('is idempotent — not due again after the alert was sent', () => {
    const d = windowState(inputs({ now: afterClose, missedAlertSentAt: new Date() }));
    expect(d.missedDue).toBe(false);
  });
});

describe('windowState — late check-in & reassurance', () => {
  const afterClose = new Date('2025-01-15T11:00:00+11:00');
  const lateAt = new Date('2025-01-15T10:45:00+11:00');

  it('marks status checked_in_late when checked in after the window', () => {
    const d = windowState(
      inputs({ now: afterClose, checkedIn: true, checkedInAt: lateAt })
    );
    expect(d.status).toBe('checked_in_late');
  });

  it('reassurance is due only if Iliana was already told she missed', () => {
    const d = windowState(
      inputs({
        now: afterClose,
        checkedIn: true,
        checkedInAt: lateAt,
        missedAlertSentAt: new Date('2025-01-15T10:00:00+11:00'),
      })
    );
    expect(d.lateReassuranceDue).toBe(true);
  });

  it('reassurance is NOT due if no missed alert ever went out', () => {
    const d = windowState(
      inputs({ now: afterClose, checkedIn: true, checkedInAt: lateAt })
    );
    expect(d.lateReassuranceDue).toBe(false);
  });

  it('reassurance is idempotent — not due once sent', () => {
    const d = windowState(
      inputs({
        now: afterClose,
        checkedIn: true,
        checkedInAt: lateAt,
        missedAlertSentAt: new Date('2025-01-15T10:00:00+11:00'),
        lateNotifiedAt: new Date('2025-01-15T10:46:00+11:00'),
      })
    );
    expect(d.lateReassuranceDue).toBe(false);
  });
});

describe('windowState — full missed→late sequence is idempotent on re-run', () => {
  it('sends each notification exactly once across repeated evaluations', () => {
    // 1) Window closed, nothing sent yet -> missed is due.
    let flags = {
      reminderSentAt: null as Date | null,
      missedAlertSentAt: null as Date | null,
      lateNotifiedAt: null as Date | null,
    };
    const at1030 = new Date('2025-01-15T10:30:00+11:00');
    let d = windowState(inputs({ now: at1030, ...flags }));
    expect(d.missedDue).toBe(true);

    // Scheduler records the send:
    flags = { ...flags, missedAlertSentAt: at1030 };

    // 2) Re-run one poll later, still no check-in -> nothing new due.
    d = windowState(inputs({ now: new Date('2025-01-15T10:35:00+11:00'), ...flags }));
    expect(d.missedDue).toBe(false);
    expect(d.reminderDue).toBe(false);

    // 3) Nonna checks in late -> reassurance due exactly once.
    const lateAt = new Date('2025-01-15T10:40:00+11:00');
    d = windowState(
      inputs({
        now: new Date('2025-01-15T10:41:00+11:00'),
        checkedIn: true,
        checkedInAt: lateAt,
        ...flags,
      })
    );
    expect(d.lateReassuranceDue).toBe(true);

    // Scheduler records it:
    flags = { ...flags, lateNotifiedAt: new Date('2025-01-15T10:41:00+11:00') };

    // 4) Re-run again -> nothing due.
    d = windowState(
      inputs({
        now: new Date('2025-01-15T10:46:00+11:00'),
        checkedIn: true,
        checkedInAt: lateAt,
        ...flags,
      })
    );
    expect(d.lateReassuranceDue).toBe(false);
    expect(d.missedDue).toBe(false);
  });
});

describe('windowState — DST boundary day (Sydney autumn transition)', () => {
  it('computes the window correctly on the fall-back day (Apr 6 2025)', () => {
    // On 2025-04-06 Sydney rolls +11 -> +10 at 03:00. The 06:00 window is after the
    // transition (+10). 07:00 local should be "open".
    const d = windowState(
      inputs({ now: new Date('2025-04-06T07:00:00+10:00'), reminderSentAt: null })
    );
    expect(d.phase).toBe('open');
    expect(d.reminderDue).toBe(true);
  });
});
