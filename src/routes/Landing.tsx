import { Navigate, useNavigate } from 'react-router-dom';
import { useSession } from '../auth/session';
import './Landing.css';

export default function Landing() {
  const navigate = useNavigate();
  const { session } = useSession();

  // Remembered device: send a signed-in user straight to their screen so Nonna
  // never has to re-log-in each morning.
  if (session) return <Navigate to={`/${session.role}`} replace />;

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
          onClick={() => navigate('/login/nonna')}
        >
          NONNA
        </button>
        <button
          type="button"
          className="landing__btn landing__btn--iliana"
          onClick={() => navigate('/login/iliana')}
        >
          ILIANA
        </button>
      </div>
    </main>
  );
}
