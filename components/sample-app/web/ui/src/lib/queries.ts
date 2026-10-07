import { keepPreviousData, QueryClient, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getJson, reason, REFRESH_MS, RETRIES, type SearchResult, type Site, type Status } from './api';
import { report } from './health';

// The pages poll, so a failed request is not retried on its own: the next poll
// is the retry, and the failure shows at once. Polling goes on in a hidden tab,
// so a tab is already current when the presenter switches to it.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchIntervalInBackground: true } },
});

/** Title, description and suggested searches, from the seed file. */
export const useSite = () => useQuery({ queryKey: ['site'], queryFn: () => getJson<Site>('/api/site'), staleTime: Infinity });

/** Sets the tab's title, as "Search | Sample App". */
export function usePageTitle(page: string) {
  const title = useSite().data?.title;
  useEffect(() => {
    if (title) document.title = `${page} | ${title}`;
  }, [page, title]);
}

/**
 * Each service's version and whether its process answers, and today's
 * registrations. A service can be up while its requests fail: that is what
 * the search requests below find out.
 */
export const useStatus = () =>
  useQuery({
    queryKey: ['status'],
    queryFn: async () => {
      const status = await getJson<Status>('/api/status');
      report('Registration', typeof status.registrations_today === 'number', `The registration service did not answer. ${RETRIES}`);
      return status;
    },
    refetchInterval: REFRESH_MS,
  });

export const useSearch = (q: string, limit?: number) =>
  useQuery({
    queryKey: ['search', q, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ q });
      if (limit !== undefined) params.set('limit', String(limit));
      try {
        const result = await getJson<SearchResult>(`/api/search?${params}`);
        report('Search', true);
        return result;
      } catch (error) {
        report('Search', false, `${reason('The search service', error)} ${RETRIES}`);
        throw error;
      }
    },
    refetchInterval: REFRESH_MS,
    // While a new query is on its way, the previous results stay.
    placeholderData: keepPreviousData,
  });

/**
 * The first records of the catalog. Home shows them, and every page asks for
 * them, so the banner says that search is down whichever page is open.
 */
export const useFeatured = () => useSearch('', 12);
