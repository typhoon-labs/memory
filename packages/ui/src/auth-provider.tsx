import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from 'react';
import { authClient } from './auth-client';

type Session = typeof authClient.$Infer.Session.session;
type User = typeof authClient.$Infer.Session.user;

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isPending: boolean;
  error: Error | null;
  refetchSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending, error, refetch } = authClient.useSession();
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Retry session fetch when the backend is unreachable (e.g. server restarting).
  // Don't retry on HTTP errors (401, 500) — only on network-level failures.
  useEffect(() => {
    const isNetworkError = error && !('status' in error && (error as { status?: number }).status);
    if (isNetworkError && !isPending) {
      retryTimer.current = setTimeout(() => refetch(), 2000);
    }
    return () => clearTimeout(retryTimer.current);
  }, [error, isPending, refetch]);

  const value: AuthContextValue = {
    session: data?.session ?? null,
    user: data?.user ?? null,
    isPending,
    error: error ?? null,
    refetchSession: refetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return context;
}

export function useSignOut() {
  const { refetchSession } = useAuth();
  return useCallback(async () => {
    try {
      await authClient.signOut();
    } finally {
      refetchSession();
    }
  }, [refetchSession]);
}
