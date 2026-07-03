import { Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider } from './auth/session';
import RequireRole from './auth/RequireRole';
import Landing from './routes/Landing';
import Login from './routes/Login';
import Nonna from './routes/Nonna';
import Iliana from './routes/Iliana';

export default function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login/:role" element={<Login />} />
        <Route
          path="/nonna"
          element={
            <RequireRole role="nonna">
              <Nonna />
            </RequireRole>
          }
        />
        <Route
          path="/iliana"
          element={
            <RequireRole role="iliana">
              <Iliana />
            </RequireRole>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionProvider>
  );
}
