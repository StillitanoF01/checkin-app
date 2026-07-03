import { useNavigate } from 'react-router-dom';
import { useSession } from '../auth/session';
import type { Role } from '../lib/types';
import './Landing.css';

export default function Landing() {
  const navigate = useNavigate();
  const { session } = useSession();

  // Always shows the chooser on load/refresh. If this device is already signed in as
  // that role, tapping the button skips straight past the PIN (Nonna never re-enters
  // it each morning); otherwise it goes to that role's login/setup screen.
  const go = (role: Role) => {
    if (session && session.role === role) {
      navigate(`/${role}`);
    } else {
      navigate(`/login/${role}`);
    }
  };

  return (
    <main className="landing">
      <div className="landing__brand">
        <span className="landing__mark" aria-hidden="true">
          ✓
        </span>
        <h1 className="landing__title">Check-In</h1>
        <p className="landing__tag">Good morning. Who's here?</p>
      </div>

      <div className="landing__buttons">
        <button
          type="button"
          className="landing__btn landing__btn--nonna"
          onClick={() => go('nonna')}
        >
          NONNA
        </button>
        <button
          type="button"
          className="landing__btn landing__btn--iliana"
          onClick={() => go('iliana')}
        >
          ILIANA
        </button>
      </div>
    </main>
  );
}
