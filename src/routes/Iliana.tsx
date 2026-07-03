import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../auth/session';
import SettingsForm from '../components/SettingsForm';
import {
  getProfiles,
  getRecentCheckins,
  getSettings,
} from '../lib/api';
import { localDateInTz, windowState } from '../lib/windowLogic';
import { computeStreak, recentLocalDates } from '../lib/history';
import { formatDateShort, formatTimeInTz } from '../lib/format';
import type { Checkin, DayStatus, Settings } from '../lib/types';
import './Iliana.css';

const HISTORY_DAYS = 14;

interface DashData {
  settings: Settings;
  checkinsByDate: Map<string, Checkin>;
  today: string;
  todayStatus: DayStatus;
  streak: number;
  lastCheckin: Checkin | null;
  /** Earliest check-in date — days before this are "no data", not "missed". */
  firstCheckinDate: string | null;
  nonnaName: string;
}

const STATUS_META: Record<
  DayStatus,
  { label: string; icon: string; cls: string }
> = {
  checked_in: { label: 'Checked in', icon: '✅', cls: 'ok' },
  checked_in_late: { label: 'Checked in (late)', icon: '🕙', cls: 'late' },
  missed: { label: 'Missed', icon: '❌', cls: 'missed' },
  pending: { label: 'Not yet', icon: '⏳', cls: 'pending' },
};

export default function Iliana() {
  const { session, signOut } = useSession();
  const navigate = useNavigate();
  const logOut = () => {
    signOut();
    navigate('/', { replace: true });
  };
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  const load = useMemo(
    () => async () => {
      try {
        const [settingsRow, profiles, checkins] = await Promise.all([
          getSettings(),
          getProfiles(),
          getRecentCheckins(HISTORY_DAYS + 1),
        ]);
        const nonna = profiles.find((p) => p.role === 'nonna');
        const nonnaCheckins = nonna
          ? checkins.filter((c) => c.profile_id === nonna.id)
          : checkins;

        const byDate = new Map(nonnaCheckins.map((c) => [c.checkin_date, c]));
        const tz = settingsRow.timezone;
        const today = localDateInTz(new Date(), tz);
        const todayCheckin = byDate.get(today) ?? null;

        const decision = windowState({
          now: new Date(),
          tz,
          windowStart: settingsRow.window_start,
          windowEnd: settingsRow.window_end,
          checkedIn: todayCheckin !== null,
          checkedInAt: todayCheckin ? new Date(todayCheckin.checked_in_at) : null,
          reminderSentAt: null,
          missedAlertSentAt: null,
          lateNotifiedAt: null,
          checkinNotifiedAt: null,
        });

        setSettings(settingsRow);
        setData({
          settings: settingsRow,
          checkinsByDate: byDate,
          today,
          todayStatus: decision.status,
          streak: computeStreak(new Set(byDate.keys()), today),
          lastCheckin: nonnaCheckins[0] ?? null,
          firstCheckinDate:
            byDate.size > 0 ? [...byDate.keys()].sort()[0] : null,
          nonnaName: nonna?.display_name ?? 'Nonna',
        });
      } catch {
        setError('Could not load the dashboard. Check your connection and reload.');
      }
    },
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <main className="dash">
        <p className="dash__error">{error}</p>
        <button className="btn btn--secondary" onClick={logOut}>
          Log out
        </button>
      </main>
    );
  }

  if (!data || !settings) {
    return (
      <main className="dash">
        <p className="dash__muted">Loading…</p>
      </main>
    );
  }

  const tz = data.settings.timezone;
  const meta = STATUS_META[data.todayStatus];
  const todayCheckin = data.checkinsByDate.get(data.today) ?? null;
  const historyDates = recentLocalDates(data.today, HISTORY_DAYS);

  return (
    <main className="dash">
      <header className="dash__header">
        <div>
          <h1 className="dash__title">Good morning, {session?.displayName}</h1>
          <p className="dash__muted">{data.nonnaName}'s check-ins</p>
        </div>
        <button className="dash__logout" onClick={logOut}>
          Log out
        </button>
      </header>

      {/* Today's status */}
      <section className={`card status status--${meta.cls}`}>
        <span className="status__icon" aria-hidden="true">
          {meta.icon}
        </span>
        <div>
          <p className="status__label">{meta.label} today</p>
          <p className="status__sub">
            {todayCheckin
              ? `at ${formatTimeInTz(todayCheckin.checked_in_at, tz)}`
              : data.todayStatus === 'missed'
                ? `No check-in by ${data.settings.window_end}`
                : `Window ${data.settings.window_start}–${data.settings.window_end}`}
          </p>
        </div>
      </section>

      {/* Quick stats */}
      <section className="stats">
        <div className="card stat">
          <p className="stat__value">{data.streak}</p>
          <p className="stat__label">day streak</p>
        </div>
        <div className="card stat">
          <p className="stat__value">
            {data.lastCheckin
              ? formatTimeInTz(data.lastCheckin.checked_in_at, tz)
              : '—'}
          </p>
          <p className="stat__label">
            {data.lastCheckin
              ? `last · ${formatDateShort(data.lastCheckin.checkin_date)}`
              : 'no check-ins yet'}
          </p>
        </div>
      </section>

      {/* History */}
      <section className="card">
        <h2 className="card__title">Recent days</h2>
        <ul className="history">
          {historyDates.map((date) => {
            const c = data.checkinsByDate.get(date);
            const isToday = date === data.today;
            const inUse =
              data.firstCheckinDate !== null && date >= data.firstCheckinDate;
            const missed = !c && date < data.today && inUse;
            return (
              <li key={date} className="history__row">
                <span className="history__date">
                  {formatDateShort(date)}
                  {isToday && <span className="history__today"> · today</span>}
                </span>
                {c ? (
                  <span className="history__ok">
                    ✅ {formatTimeInTz(c.checked_in_at, tz)}
                  </span>
                ) : missed ? (
                  <span className="history__missed">❌ missed</span>
                ) : isToday ? (
                  <span className="history__pending">⏳ not yet</span>
                ) : (
                  <span className="history__none">—</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <SettingsForm settings={settings} onSaved={setSettings} />
    </main>
  );
}
