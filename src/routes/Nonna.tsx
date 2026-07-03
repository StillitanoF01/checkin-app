import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../auth/session';
import { getCheckinForDate, getSettings, recordCheckin } from '../lib/api';
import { localDateInTz } from '../lib/windowLogic';
import { formatDateLong, formatTimeInTz } from '../lib/format';
import type { Checkin } from '../lib/types';
import '../theme/nonna.css';

const DEFAULT_TZ = 'Australia/Sydney';

type State =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'confirmed'; checkin: Checkin }
  | { kind: 'error'; message: string };

export default function Nonna() {
  const { session, signOut } = useSession();
  const navigate = useNavigate();
  const [tz, setTz] = useState(DEFAULT_TZ);

  const switchUser = () => {
    signOut();
    navigate('/', { replace: true });
  };
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [submitting, setSubmitting] = useState(false);

  // On load: find out the timezone and whether she's already checked in today.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        let zone = DEFAULT_TZ;
        try {
          zone = (await getSettings()).timezone || DEFAULT_TZ;
        } catch {
          /* fall back to default tz if settings unreadable */
        }
        if (cancelled) return;
        setTz(zone);

        const today = localDateInTz(new Date(), zone);
        const existing = await getCheckinForDate(session.profileId, today);
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
  }, [session]);

  const handleCheckIn = async () => {
    if (!session || submitting) return;
    setSubmitting(true);
    try {
      const checkin = await recordCheckin(session.profileId);
      setState({ kind: 'confirmed', checkin });
    } catch {
      setState({ kind: 'error', message: "That didn't work. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const today = formatDateLong(localDateInTz(new Date(), tz));

  return (
    <main className="nonna">
      <p className="nonna__greeting">Hello {session?.displayName} ❤️</p>
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
            disabled={submitting}
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
          <p className="nonna__confirm-text">
            Thanks {session?.displayName}, see you tomorrow ❤️
          </p>
          <p className="nonna__confirm-time">
            Checked in at {formatTimeInTz(state.checkin.checked_in_at, tz)}
          </p>
        </div>
      )}

      <button type="button" className="nonna__switch" onClick={switchUser}>
        Not {session?.displayName}? Switch user
      </button>
    </main>
  );
}
