import { useState } from 'react';

import { authClient } from './auth-client';

interface LoginPageProps {
  onSuccess?: () => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [error, setError] = useState<string | null>(null);

  const handleSso = async () => {
    try {
      setError(null);
      await authClient.signIn.social({
        provider: 'oidc',
        callbackURL: window.location.origin,
      });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SSO sign-in failed');
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.logo}>Typhoon</h1>
        <h2 style={styles.title}>Sign in to continue</h2>
        {error && <p style={styles.error}>{error}</p>}
        <button type="button" onClick={handleSso} style={styles.ssoButton}>
          Sign in with SSO
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: 'var(--background, #ffffff)',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    padding: '2.5rem',
    textAlign: 'center' as const,
  },
  logo: {
    fontSize: '1.5rem',
    fontWeight: 700,
    marginBottom: '0.25rem',
    color: 'var(--foreground, #0a0a0a)',
  },
  title: {
    fontSize: '0.875rem',
    fontWeight: 400,
    color: 'var(--muted-foreground, #737373)',
    marginBottom: '2rem',
  },
  error: {
    color: 'var(--destructive, #dc2626)',
    fontSize: '0.8125rem',
    marginBottom: '1rem',
  },
  ssoButton: {
    width: '100%',
    padding: '0.625rem',
    borderRadius: '0.375rem',
    border: '1px solid var(--border, #e5e5e5)',
    backgroundColor: 'var(--primary, #171717)',
    color: 'var(--primary-foreground, #fafafa)',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
