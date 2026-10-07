import { CircleAlertIcon } from 'lucide-react';
import { RETRIES } from '@/lib/api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/** In place of what a failing service would have filled. The banner says what is wrong. */
export function Unavailable({ what }: { what: string }) {
  return (
    <Alert variant="destructive" className="px-4 py-3 text-base">
      <CircleAlertIcon aria-hidden />
      <AlertTitle>{what} cannot be shown</AlertTitle>
      <AlertDescription className="text-[0.9375rem]">Search is unavailable. {RETRIES}</AlertDescription>
    </Alert>
  );
}
