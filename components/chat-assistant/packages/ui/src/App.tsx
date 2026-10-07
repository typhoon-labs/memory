import { useEffect, useState, type ReactNode } from 'react';
import { startAuth, type Auth } from './auth';
import { Callout } from './Callout';
import { loadRuntimeConfig, type RuntimeConfig } from './config';
import { Session } from './Session';
import { Button } from '@/components/ui/button';

type Boot =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | { state: 'ready'; config: RuntimeConfig; auth: Auth };

/** What each role can do on the card. The card itself is built for the role that signs in. */
const ROLES = [
  { role: 'developer', dot: 'bg-developer', does: 'Proposes the rollback' },
  { role: 'incident-manager', dot: 'bg-incident-manager', does: 'Approves or rejects it, and posts status updates' },
  { role: 'platform-engineer', dot: 'bg-platform-engineer', does: 'Applies it, and can restart the service' },
];

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const config = await loadRuntimeConfig();
        const auth = await startAuth(config);
        if (!canceled) setBoot({ state: 'ready', config, auth });
      } catch (err) {
        if (!canceled) setBoot({ state: 'failed', message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);

  if (boot.state === 'loading') {
    return (
      <Screen>
        <p className="flex items-center gap-2 text-muted-foreground">
          <i aria-hidden className="spinner size-3.5" />
          Loading…
        </p>
      </Screen>
    );
  }
  if (boot.state === 'failed') {
    return (
      <Screen>
        <Title>Incident chat could not start</Title>
        <Callout role="alert" tone="error" title="Starting failed" text={boot.message} className="mt-4" />
        <Button className={MAIN_ACTION} onClick={() => window.location.assign(window.location.pathname)}>
          Try again
        </Button>
      </Screen>
    );
  }
  if (!boot.auth.user) {
    return (
      <Screen>
        <Title>Sign in to Incident chat</Title>
        <p className="mt-2.5 text-muted-foreground">See the open incident and take the step your role allows.</p>
        <Button className={MAIN_ACTION} onClick={() => void boot.auth.signIn()}>
          Sign in
        </Button>
        <p className="mt-3 text-[0.8125rem] text-muted-foreground [overflow-wrap:anywhere]">You sign in at {boot.config.oidcIssuer}</p>
        <ul className="mt-8 grid gap-3.5 border-t pt-5 text-sm">
          {ROLES.map(({ role, dot, does }) => (
            <li key={role} className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-x-2.5">
              <i aria-hidden className={`mt-1.5 size-2 rounded-full ${dot}`} />
              <div>
                <p className="font-medium">{role}</p>
                <p className="text-muted-foreground">{does}</p>
              </div>
            </li>
          ))}
        </ul>
      </Screen>
    );
  }
  return <Session config={boot.config} auth={boot.auth} />;
}

/** Before anyone is signed in the button is black: no role has given the page its color yet. */
const MAIN_ACTION = 'mt-6 h-11 w-full rounded-lg bg-foreground text-[0.9375rem] text-background hover:bg-foreground/85';

function Title({ children }: { children: ReactNode }) {
  return <h1 className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em]">{children}</h1>;
}

/**
 * What is shown before anyone is signed in: one column in the middle of the
 * window. The line along the top and the mark above the title carry the three
 * roles' colors; once someone signs in, the line takes their role's alone.
 */
function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh grid-rows-[auto_minmax(0,1fr)]">
      <div
        aria-hidden
        className="h-[3px] bg-[linear-gradient(90deg,var(--developer)_0_33.33%,var(--incident-manager)_33.33%_66.66%,var(--platform-engineer)_66.66%)]"
      />
      <main className="grid justify-items-center px-6 pt-8 pb-[12vh] [align-content:safe_center]">
        <div className="w-full max-w-[23rem]">
          <div aria-hidden className="mb-7 flex gap-[0.3125rem]">
            {ROLES.map(({ role, dot }) => (
              <i key={role} className={`size-3 rounded-full ${dot}`} />
            ))}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
