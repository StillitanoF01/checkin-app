import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCheckinForDate, getProfile, getSettings, recordCheckin } from '../lib/api';
import { localDateInTz } from '../lib/windowLogic';
import { formatDateLong, formatTimeInTz } from '../lib/format';
import type { Checkin, Profile } from '../lib/types';
import '../theme/nonna.css';

const DEFAULT_TZ = 'Australia/Sydney';

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
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [submitting, setSubmitting] = useState(false);

  // On load: find Nonna's profile, the timezone, and whether she's already checked in.
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
        try {
          zone = (await getSettings()).timezone || DEFAULT_TZ;
        } catch {
          /* fall back to default tz if settings unreadable */
        }
        if (cancelled) return;
        setTz(zone);

        const today = localDateInTz(new Date(), zone);
        const existing = await getCheckinForDate(nonna.id, today);
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
      const checkin = await recordCheckin(profile.id);
      setState({ kind: 'confirmed', checkin });
    } catch {
      setState({ kind: 'error', message: "That didn't work. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const today = formatDateLong(localDateInTz(new Date(), tz));
  const displayName = profile?.display_name ?? 'Nonna';

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
            {submitting ? 'Sending…' : "I'M OK\nCHECK IN"}
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
          <p className="nonna__confirm-text">Thanks {displayName}, see you tomorrow!</p>
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
