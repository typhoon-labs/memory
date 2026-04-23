import { ExternalLinkIcon } from 'lucide-react';
import type React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';

/**
 * Wraps a clickable element with a confirmation dialog before opening
 * an external URL. Used in document viewers to prevent agents from
 * accidentally navigating away.
 */
export function ExternalLinkDialog({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Open external link?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <span>This will open in a new tab:</span>
              <code className="mt-2 block break-all rounded bg-muted px-2 py-1.5 text-xs text-foreground">{href}</code>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}>
            <ExternalLinkIcon className="mr-1.5 size-3.5" />
            Open Link
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
