import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from './session';
import type { Role } from '../lib/types';
import type { ReactNode } from 'react';

/** Gate a route to a signed-in profile of a specific role. */
export default function RequireRole({
  role,
  children,
}: {
  role: Role;
  children: ReactNode;
}) {
  const { session, signOut } = useSession();

  // Signed in as the OTHER profile (e.g. a shared test device, or a Nonna deep-link
  // opened on a phone last signed in as Iliana) — clear that stale session so the
  // person lands on their own PIN screen instead of being bounced to someone else's.
  const mismatched = session !== null && session.role !== role;
  useEffect(() => {
    if (mismatched) signOut();
  }, [mismatched, signOut]);

  if (!session || mismatched) return <Navigate to={`/login/${role}`} replace />;

  return <>{children}</>;
}
