import { useEffect, useState } from 'react';
import { startAuth, type Auth } from './auth';
import { loadRuntimeConfig, type RuntimeConfig } from './config';
import { Session } from './Session';

type Boot =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | { state: 'ready'; config: RuntimeConfig; auth: Auth };

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await loadRuntimeConfig();
        const auth = await startAuth(config);
        if (!cancelled) setBoot({ state: 'ready', config, auth });
      } catch (err) {
        if (!cancelled) setBoot({ state: 'failed', message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (boot.state === 'loading') {
    return <main className="center">Loading…</main>;
  }
  if (boot.state === 'failed') {
    return (
      <main className="center">
        <h1>Incident chat</h1>
        <p className="problem" role="alert">
          Could not start: {boot.message}
        </p>
        <button onClick={() => window.location.assign(window.location.pathname)}>Try again</button>
      </main>
    );
  }
  if (!boot.auth.user) {
    return (
      <main className="center">
        <h1>Incident chat</h1>
        <p>Sign in to see the incident and the actions for your role.</p>
        <button className="primary" onClick={() => void boot.auth.signIn()}>
          Sign in
        </button>
        <p className="fine">Issuer: {boot.config.oidcIssuer}</p>
      </main>
    );
  }
  return <Session config={boot.config} auth={boot.auth} />;
}
