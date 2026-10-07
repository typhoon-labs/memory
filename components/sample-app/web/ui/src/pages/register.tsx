import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheckIcon } from 'lucide-react';
import type { FormEvent } from 'react';
import { ApiError, clock, getJson, reason, type Registration } from '@/lib/api';
import { report } from '@/lib/health';
import { usePageTitle } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** The service is fine; the form is not. */
const refused = (error: unknown) => error instanceof ApiError && error.status !== undefined && error.status >= 400 && error.status < 500;

export function Register() {
  const queryClient = useQueryClient();
  usePageTitle('Register');

  const registration = useMutation({
    mutationFn: (form: { name: string; email: string }) =>
      getJson<Registration>('/api/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      report('Registration', true);
      // Today's count on Home.
      void queryClient.invalidateQueries({ queryKey: ['status'] });
    },
    onError: (error) => {
      if (refused(error)) return;
      report('Registration', false, `${reason('The registration service', error)} Nothing was saved. Register again when this message clears.`);
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    registration.mutate({ name: String(form.get('name')), email: String(form.get('email')) });
  };
  const registered = registration.data;

  return (
    <div className="max-w-md">
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">Register</h1>
      <Card className="mt-6 text-base">
        <CardContent>
          {registered ? (
            <section aria-live="polite">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-success">
                <CircleCheckIcon aria-hidden className="size-5" />
                Registered
              </h2>
              <p className="mt-4 text-sm text-muted-foreground">Confirmation number</p>
              <p className="text-3xl font-semibold tracking-wide tabular-nums">{registered.confirmation}</p>
              <p className="mt-3 text-muted-foreground">
                {registered.name}, {registered.email}, at {clock(new Date(registered.registered_at))}.
              </p>
              <Button variant="outline" className="mt-5 h-10 px-4 text-base" onClick={() => registration.reset()}>
                Register someone else
              </Button>
            </section>
          ) : (
            <form onSubmit={submit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required maxLength={100} autoComplete="name" autoFocus className="h-10 text-base md:text-base" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required maxLength={200} autoComplete="email" className="h-10 text-base md:text-base" />
              </div>
              {refused(registration.error) && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {registration.error!.message}
                </p>
              )}
              <Button type="submit" disabled={registration.isPending} className="h-10 justify-self-start px-5 text-base">
                {registration.isPending ? 'Registering…' : 'Register'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
