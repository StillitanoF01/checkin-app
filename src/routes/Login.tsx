import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, Link } from 'react-router-dom';
import PinPad from '../components/PinPad';
import { getProfile, resetPin, setPin, verifyPin } from '../lib/api';
import { useSession } from '../auth/session';
import type { Profile, Role } from '../lib/types';
import './Login.css';

const PIN_LENGTH = 4;
// After this many wrong PINs in a row, offer a "forgot PIN" reset link.
const RESET_AFTER_ATTEMPTS = 5;

type Phase =
  | 'loading'
  | 'setup-enter'
  | 'setup-confirm'
  | 'login'
  | 'reset-enter'
  | 'reset-confirm'
  | 'error-load';

export default function Login() {
  const { role } = useParams<{ role: Role }>();
  const navigate = useNavigate();
  const { signIn } = useSession();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [pin, setPinValue] = useState('');
  const [firstEntry, setFirstEntry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const submitting = useRef(false);

  const validRole = role === 'iliana';

  // Load the profile to decide setup vs login.
  useEffect(() => {
    if (!validRole) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await getProfile(role);
        if (cancelled) return;
        if (!p) {
          setPhase('error-load');
          return;
        }
        setProfile(p);
        setPhase(p.has_pin ? 'login' : 'setup-enter');
      } catch {
        if (!cancelled) setPhase('error-load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, validRole]);

  // React when the PIN reaches full length.
  useEffect(() => {
    if (pin.length !== PIN_LENGTH || submitting.current) return;

    const run = async () => {
      submitting.current = true;
      setBusy(true);
      setError(null);
      try {
        if (phase === 'setup-enter' || phase === 'reset-enter') {
          setFirstEntry(pin);
          setPinValue('');
          setPhase(phase === 'setup-enter' ? 'setup-confirm' : 'reset-confirm');
        } else if (phase === 'setup-confirm') {
          if (pin !== firstEntry) {
            setError("Those didn't match — let's try again.");
            setFirstEntry('');
            setPinValue('');
            setPhase('setup-enter');
            return;
          }
          const ok = await setPin(role as Role, pin);
          if (!ok || !profile) {
            setError('Could not set the PIN. Please try again.');
            setPinValue('');
            setPhase('setup-enter');
            return;
          }
          signIn({
            profileId: profile.id,
            role: role as Role,
            displayName: profile.display_name,
          });
          navigate(`/${role}`, { replace: true });
        } else if (phase === 'reset-confirm') {
          if (pin !== firstEntry) {
            setError("Those didn't match — let's try again.");
            setFirstEntry('');
            setPinValue('');
            setPhase('reset-enter');
            return;
          }
          const ok = await resetPin(role as Role, pin);
          if (!ok || !profile) {
            setError('Could not reset the PIN. Please try again.');
            setPinValue('');
            setPhase('reset-enter');
            return;
          }
          signIn({
            profileId: profile.id,
            role: role as Role,
            displayName: profile.display_name,
          });
          navigate(`/${role}`, { replace: true });
        } else if (phase === 'login') {
          const match = await verifyPin(role as Role, pin);
          if (!match) {
            setError('Wrong PIN. Please try again.');
            setPinValue('');
            setWrongAttempts((n) => n + 1);
            return;
          }
          signIn({
            profileId: match.id,
            role: match.role,
            displayName: match.display_name,
          });
          navigate(`/${role}`, { replace: true });
        }
      } catch {
        setError('Something went wrong. Please try again.');
        setPinValue('');
      } finally {
        setBusy(false);
        submitting.current = false;
      }
    };
    void run();
  }, [pin, phase, firstEntry, profile, role, navigate, signIn]);

  const startReset = () => {
    setError(null);
    setFirstEntry('');
    setPinValue('');
    setWrongAttempts(0);
    setPhase('reset-enter');
  };

  // Nonna has no PIN at all — send any stale /login/nonna link straight to her screen.
  // (Checked here, after every hook above has already run, so hook order stays stable.)
  if (role === 'nonna') return <Navigate to="/nonna" replace />;

  if (!validRole) {
    return (
      <main className="login">
        <p className="login__error">Unknown profile.</p>
        <Link className="login__back" to="/">
          ← Back
        </Link>
      </main>
    );
  }

  const title =
    phase === 'loading'
      ? 'Loading…'
      : phase === 'error-load'
        ? 'Could not load'
        : phase === 'setup-enter'
          ? `Create a PIN for ${profile?.display_name ?? role}`
          : phase === 'setup-confirm'
            ? 'Re-enter the PIN to confirm'
            : phase === 'reset-enter'
              ? `Choose a new PIN for ${profile?.display_name ?? role}`
              : phase === 'reset-confirm'
                ? 'Re-enter the new PIN to confirm'
                : `Enter ${profile?.display_name ?? role}'s PIN`;

  return (
    <main className="login">
      <Link className="login__back" to="/">
        ← Back
      </Link>
      <h1 className="login__title">{title}</h1>

      {phase === 'error-load' && (
        <p className="login__error">
          Couldn't reach the server. Check your connection and reload.
        </p>
      )}

      {(phase === 'setup-enter' ||
        phase === 'setup-confirm' ||
        phase === 'login' ||
        phase === 'reset-enter' ||
        phase === 'reset-confirm') && (
        <>
          <PinPad
            value={pin}
            onChange={(v) => {
              setError(null);
              setPinValue(v);
            }}
            length={PIN_LENGTH}
            disabled={busy}
          />
          {error && (
            <p className="login__error" role="alert">
              {error}
            </p>
          )}
          {(phase === 'setup-enter' || phase === 'reset-enter') && (
            <p className="login__hint">Choose a 4-digit PIN you'll remember.</p>
          )}
          {/* Hidden by default — only appears after repeated wrong PINs. */}
          {phase === 'login' && wrongAttempts >= RESET_AFTER_ATTEMPTS && (
            <button type="button" className="login__reset" onClick={startReset}>
              Forgot your PIN? Reset it
            </button>
          )}
        </>
      )}
    </main>
  );
}
