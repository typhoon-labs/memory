import { useDocumentTitle } from '@typhoon/ui';

const APP_TITLE = 'Typhoon Admin';

/** Sets the browser tab title with the app suffix. */
export function usePageTitle(title: string | undefined) {
  useDocumentTitle(title, APP_TITLE);
}

/** Format a hierarchical title like "Scorers: Faithfulness". */
export function detailTitle(section: string, name: string | undefined) {
  return name ? `${section}: ${name}` : section;
}
