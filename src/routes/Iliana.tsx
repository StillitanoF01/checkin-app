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
import type { Checkin, DayStatus, Session, Settings } from '../lib/types';
import './Iliana.css';

const HISTORY_DAYS = 14;

interface SessionData {
  status: DayStatus;
  checkin: Checkin | null;
}

interface DashData {
  settings: Settings;
  checkinsByDate: Record<Session, Map<string, Checkin>>;
  today: string;
  day: SessionData;
  night: SessionData;
  streak: number;
  lastCheckin: Checkin | null;
  /** Earliest check-in date — days before this are "no data", not "missed". */
  firstCheckinDate: string | null;
  nonnaName: string;
}

const STATUS_META: Record<DayStatus, { icon: string; cls: string }> = {
  checked_in: { icon: '✅', cls: 'ok' },
  checked_in_late: { icon: '🕙', cls: 'late' },
  missed: { icon: '❌', cls: 'missed' },
  pending: { icon: '⏳', cls: 'pending' },
};

// Morning check-in / goodnight check-out get different verbs for the same statuses.
const STATUS_LABEL: Record<Session, Record<DayStatus, string>> = {
  day: {
    checked_in: 'Checked in',
    checked_in_late: 'Checked in (late)',
    missed: 'Missed',
    pending: 'Not yet',
  },
  night: {
    checked_in: 'Checked out',
    checked_in_late: 'Checked out (late)',
    missed: 'Missed',
    pending: 'Not yet',
  },
};

function sessionStatus(
  checkin: Checkin | null,
  now: Date,
  tz: string,
  windowStart: string,
  windowEnd: string
): DayStatus {
  return windowState({
    now,
    tz,
    windowStart,
    windowEnd,
    checkedIn: checkin !== null,
    checkedInAt: checkin ? new Date(checkin.checked_in_at) : null,
    reminderSentAt: null,
    missedAlertSentAt: null,
    lateNotifiedAt: null,
    checkinNotifiedAt: null,
  }).status;
}

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
  const [showSettings, setShowSettings] = useState(false);

  const load = useMemo(
    () => async () => {
      try {
        const [settingsRow, profiles, checkins] = await Promise.all([
          getSettings(),
          getProfiles(),
          getRecentCheckins(HISTORY_DAYS * 2 + 2),
        ]);
        const nonna = profiles.find((p) => p.role === 'nonna');
        const nonnaCheckins = nonna
          ? checkins.filter((c) => c.profile_id === nonna.id)
          : checkins;

        const byDate: Record<Session, Map<string, Checkin>> = {
          day: new Map(
            nonnaCheckins.filter((c) => c.session === 'day').map((c) => [c.checkin_date, c])
          ),
          night: new Map(
            nonnaCheckins
              .filter((c) => c.session === 'night')
              .map((c) => [c.checkin_date, c])
          ),
        };
        const tz = settingsRow.timezone;
        const now = new Date();
        const today = localDateInTz(now, tz);
        const dayCheckin = byDate.day.get(today) ?? null;
        const nightCheckin = byDate.night.get(today) ?? null;

        const dayDates = [...byDate.day.keys()];
        const nightDates = [...byDate.night.keys()];
        const allDates = [...dayDates, ...nightDates];

        setSettings(settingsRow);
        setData({
          settings: settingsRow,
          checkinsByDate: byDate,
          today,
          day: {
            status: sessionStatus(
              dayCheckin,
              now,
              tz,
              settingsRow.window_start,
              settingsRow.window_end
            ),
            checkin: dayCheckin,
          },
          night: {
            status: sessionStatus(
              nightCheckin,
              now,
              tz,
              settingsRow.night_window_start,
              settingsRow.night_window_end
            ),
            checkin: nightCheckin,
          },
          streak: computeStreak(new Set(dayDates), today),
          lastCheckin: nonnaCheckins.filter((c) => c.session === 'day')[0] ?? null,
          firstCheckinDate: allDates.length > 0 ? [...allDates].sort()[0] : null,
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
  const historyDates = recentLocalDates(data.today, HISTORY_DAYS);

  const renderStatusCard = (
    label: string,
    session: Session,
    s: SessionData,
    windowStart: string,
    windowEnd: string
  ) => {
    const meta = STATUS_META[s.status];
    return (
      <section className={`card status status--${meta.cls}`}>
        <span className="status__icon" aria-hidden="true">
          {meta.icon}
        </span>
        <div>
          <p className="status__session-label">{label}</p>
          <p className="status__label">{STATUS_LABEL[session][s.status]}</p>
          <p className="status__sub">
            {s.checkin
              ? `at ${formatTimeInTz(s.checkin.checked_in_at, tz)}`
              : s.status === 'missed'
                ? `No check-in by ${windowEnd}`
                : `Window ${windowStart}–${windowEnd}`}
          </p>
        </div>
      </section>
    );
  };

  return (
    <main className="dash">
      <header className="dash__header">
        <div>
          <h1 className="dash__title">Good day, {session?.displayName}</h1>
          <p className="dash__muted">{data.nonnaName}'s check-ins</p>
        </div>
        <div className="dash__header-actions">
          <button
            type="button"
            className="dash__icon-btn"
            aria-label="Settings"
            onClick={() => setShowSettings(true)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19.14 12.94a7.14 7.14 0 0 0 .06-.94 7.14 7.14 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
              />
            </svg>
          </button>
          <button className="dash__logout" onClick={logOut}>
            Log out
          </button>
        </div>
      </header>

      {/* Today's status — one card per session */}
      <div className="status-grid">
        {renderStatusCard(
          'Morning',
          'day',
          data.day,
          data.settings.window_start,
          data.settings.window_end
        )}
        {renderStatusCard(
          'Evening',
          'night',
          data.night,
          data.settings.night_window_start,
          data.settings.night_window_end
        )}
      </div>

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
        <div className="history__title-row">
          <h2 className="card__title">Check in summary</h2>
          <span className="history__head-slots" aria-hidden="true">
            <span className="history__head-label">Morning</span>
            <span className="history__head-label">Evening</span>
          </span>
        </div>
        <ul className="history">
          {historyDates.map((date) => {
            const dayC = data.checkinsByDate.day.get(date);
            const nightC = data.checkinsByDate.night.get(date);
            const isToday = date === data.today;
            const inUse =
              data.firstCheckinDate !== null && date >= data.firstCheckinDate;

            const slot = (c: Checkin | undefined, isTodaySlot: boolean) => {
              if (c) return <span className="history__ok">✅ {formatTimeInTz(c.checked_in_at, tz)}</span>;
              if (date < data.today && inUse) return <span className="history__missed">❌ missed</span>;
              if (isTodaySlot) return <span className="history__pending">⏳ not yet</span>;
              return <span className="history__none">—</span>;
            };

            return (
              <li key={date} className="history__row">
                <span className="history__date">
                  {formatDateShort(date)}
                  {isToday && <span className="history__today"> · today</span>}
                </span>
                <span className="history__slots">
                  {slot(dayC, isToday)}
                  {slot(nightC, isToday)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {showSettings && (
        <div className="settings-modal">
          <div
            className="settings-modal__backdrop"
            onClick={() => setShowSettings(false)}
          />
          <div className="settings-modal__panel">
            <button
              type="button"
              className="settings-modal__close"
              aria-label="Close settings"
              onClick={() => setShowSettings(false)}
            >
              ✕
            </button>
            <SettingsForm settings={settings} onSaved={setSettings} />
          </div>
        </div>
      )}
    </main>
  );
}
