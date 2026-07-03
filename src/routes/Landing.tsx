import { useNavigate } from 'react-router-dom';
import { useSession } from '../auth/session';
import './Landing.css';

export default function Landing() {
  const navigate = useNavigate();
  const { session } = useSession();

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
        {/* Nonna has no PIN — always go straight to her check-in screen. */}
        <button
          type="button"
          className="landing__btn landing__btn--nonna"
          onClick={() => navigate('/nonna')}
        >
          NONNA
        </button>
        {/* Iliana skips the PIN only if this device is already signed in as her. */}
        <button
          type="button"
          className="landing__btn landing__btn--iliana"
          onClick={() =>
            navigate(session?.role === 'iliana' ? '/iliana' : '/login/iliana')
          }
        >
          ILIANA
        </button>
      </div>
    </main>
  );
}
