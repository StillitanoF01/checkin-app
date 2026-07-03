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
  const { session } = useSession();

  if (!session) return <Navigate to={`/login/${role}`} replace />;
  // Signed in as the other profile — send them to their own screen.
  if (session.role !== role) return <Navigate to={`/${session.role}`} replace />;

  return <>{children}</>;
}
