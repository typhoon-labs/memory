import { useEffect } from 'react';

/**
 * Sets `document.title` reactively based on the current page.
 *
 * @param title - Page-specific segment. Pass `undefined` while loading to preserve the previous title.
 * @param suffix - App-level suffix appended after " - " (e.g. "Typhoon Desk").
 */
export function useDocumentTitle(title: string | undefined, suffix: string): void {
  useEffect(() => {
    if (title === undefined) return;
    document.title = title ? `${title} - ${suffix}` : suffix;
  }, [title, suffix]);
}
