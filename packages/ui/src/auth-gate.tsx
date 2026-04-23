import { Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useAuth } from './auth-provider';
import { AccessDenied } from './components/access-denied';

interface AuthGateProps {
  /** When set, the user must have one of these roles to proceed. Others see the Access Denied page. */
  requiredRoles?: string[];
}

export function AuthGate({ requiredRoles }: AuthGateProps) {
  const { user, isPending, error } = useAuth();
  const navigate = useNavigate();

  // Distinguish network errors (backend unreachable) from auth errors (401/no session).
  // Network errors have no HTTP status; auth errors are explicit server responses.
  const isNetworkError = error && !('status' in error && (error as { status?: number }).status);

  useEffect(() => {
    // Redirect to login when the server confirmed no session (null response or 401).
    // Network errors (e.g. backend not ready yet) should NOT trigger a redirect.
    if (!isPending && !user && !isNetworkError) {
      navigate({ to: '/login' });
    }
  }, [isPending, user, isNetworkError, navigate]);

  if (isPending || isNetworkError) {
    return (
      <div className="flex h-screen items-center justify-center">
        <span className="text-muted-foreground">{isNetworkError ? 'Connecting...' : 'Loading...'}</span>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Role-based access check
  if (requiredRoles?.length) {
    const userRole = (user as unknown as { role?: string }).role;
    if (!userRole || !requiredRoles.includes(userRole)) {
      return <AccessDenied email={user.email} />;
    }
  }

  return <Outlet />;
}
