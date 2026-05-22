import { ShieldAlertIcon } from 'lucide-react';

import { useSignOut } from '../auth-provider';
import { Button } from './ui/button';

interface AccessDeniedProps {
  email?: string;
}

/** Clean "Access Denied" page shown when an authenticated user lacks the required role. */
export function AccessDenied({ email }: AccessDeniedProps) {
  const signOut = useSignOut();

  return (
    <div className="bg-background flex h-screen items-center justify-center">
      <div className="mx-auto flex max-w-sm flex-col items-center gap-6 text-center">
        <div className="bg-destructive/10 flex size-16 items-center justify-center rounded-full">
          <ShieldAlertIcon className="text-destructive size-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Access Denied</h1>
          <p className="text-muted-foreground text-sm">
            You don't have permission to access this application. Contact your administrator if you believe this is an
            error.
          </p>
        </div>
        {email && <p className="text-muted-foreground text-xs">Signed in as {email}</p>}
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
