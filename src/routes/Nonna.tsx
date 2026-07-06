import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCheckinForDate, getProfile, getSettings, recordCheckin } from '../lib/api';
import { activeSessionForTime, localDateInTz } from '../lib/windowLogic';
import { formatDateLong, formatTimeInTz } from '../lib/format';
import type { Checkin, Profile, Session } from '../lib/types';
import '../theme/nonna.css';

const DEFAULT_TZ = 'Australia/Sydney';
const DEFAULT_DAY = { start: '06:00', end: '10:00' };
const DEFAULT_NIGHT = { start: '18:00', end: '22:00' };

const COPY: Record<
  Session,
  { button: string; confirmed: string }
> = {
  day: { button: "I'M OK\nCHECK IN", confirmed: 'see you tonight!' },
  night: { button: "I'M OK\nGOODNIGHT", confirmed: 'goodnight!' },
};

// Nonna's screen has no PIN: it's the one tap she needs each morning, and a Telegram
// deep-link should land here directly. Her profile is looked up by role, not by session.
type State =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'confirmed'; checkin: Checkin }
  | { kind: 'error'; message: string };

export default function Nonna() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tz, setTz] = useState(DEFAULT_TZ);
  const [session, setSession] = useState<Session>('day');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [submitting, setSubmitting] = useState(false);

  // On load: find Nonna's profile, the timezone/windows, and whether she's already
  // checked in for whichever session (morning/night) is current right now.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const nonna = await getProfile('nonna');
        if (cancelled) return;
        if (!nonna) {
          setState({ kind: 'error', message: "We couldn't find your profile." });
          return;
        }
        setProfile(nonna);

        let zone = DEFAULT_TZ;
        let day = DEFAULT_DAY;
        let night = DEFAULT_NIGHT;
        try {
          const settings = await getSettings();
          zone = settings.timezone || DEFAULT_TZ;
          day = { start: settings.window_start, end: settings.window_end };
          night = { start: settings.night_window_start, end: settings.night_window_end };
        } catch {
          /* fall back to defaults if settings unreadable */
        }
        if (cancelled) return;
        setTz(zone);
        const now = new Date();
        const activeSession = activeSessionForTime(now, zone, day, night);
        setSession(activeSession);

        const today = localDateInTz(now, zone);
        const existing = await getCheckinForDate(nonna.id, today, activeSession);
        if (cancelled) return;
        setState(
          existing ? { kind: 'confirmed', checkin: existing } : { kind: 'ready' }
        );
      } catch {
        if (!cancelled)
          setState({ kind: 'error', message: "We couldn't load your check-in." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheckIn = async () => {
    if (!profile || submitting) return;
    setSubmitting(true);
    try {
      const checkin = await recordCheckin(profile.id, session);
      setState({ kind: 'confirmed', checkin });
    } catch {
      setState({ kind: 'error', message: "That didn't work. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const today = formatDateLong(localDateInTz(new Date(), tz));
  const displayName = profile?.display_name ?? 'Nonna';
  const copy = COPY[session];

  return (
    <main className="nonna">
      <p className="nonna__greeting">Hello {displayName}!</p>
      <p className="nonna__date">{today}</p>

      {state.kind === 'loading' && (
        <div className="nonna__confirmed">
          <p className="nonna__confirm-text">Loading…</p>
        </div>
      )}

      {(state.kind === 'ready' || state.kind === 'error') && (
        <>
          <button
            type="button"
            className="nonna__button"
            onClick={handleCheckIn}
            disabled={submitting || !profile}
          >
            {submitting ? 'Sending…' : copy.button}
          </button>
          {state.kind === 'error' && (
            <p className="nonna__error" role="alert">
              {state.message}
            </p>
          )}
        </>
      )}

      {state.kind === 'confirmed' && (
        <div className="nonna__confirmed">
          <div className="nonna__tick" aria-hidden="true">
            ✓
          </div>
          <p className="nonna__confirm-text">
            Thanks {displayName}, {copy.confirmed}
          </p>
          <p className="nonna__confirm-time">
            Checked in at {formatTimeInTz(state.checkin.checked_in_at, tz)}
          </p>
        </div>
      )}

      <button
        type="button"
        className="nonna__switch"
        onClick={() => navigate('/', { replace: true })}
      >
        Not {displayName}?
      </button>
    </main>
  );
}
