import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/**
 * Subscribes to the server's queue event stream via SSE and invalidates
 * relevant TanStack Query keys when events arrive. Runs once at the
 * authenticated layout level so a single connection covers the whole app.
 */
export function useQueueEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const es = new EventSource('/api/v1/queues/events', { withCredentials: true });

    // Debounce per queue so a burst of events triggers a single refetch
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const scheduleInvalidate = (queue: string) => {
      const existing = timers.get(queue);
      if (existing) clearTimeout(existing);
      timers.set(
        queue,
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['queues'] });
          queryClient.invalidateQueries({ queryKey: ['queues', queue] });
          // Sync queue events drive document state — refetch the documents
          // and S3 browse queries so the documents UI updates live without
          // polling. List-level invalidation is intentional: BullMQ event
          // payloads only carry jobId, not job.data, so we can't scope to a
          // specific syncTargetId without an extra fetch.
          if (queue === 'sync') {
            queryClient.invalidateQueries({ queryKey: ['documents'] });
            queryClient.invalidateQueries({ queryKey: ['browse'] });
            // sync-jobs history powers the Overview tab's "Last Sync" card
            // and the Sync Log tab — both go stale immediately after a
            // manual resync without this. Prefix invalidation matches all
            // per-source variants (['sync-targets', sourceId, 'jobs']).
            queryClient.invalidateQueries({ queryKey: ['sync-targets'] });
          }
          timers.delete(queue);
        }, 200),
      );
    };

    es.addEventListener('queue-event', (e) => {
      try {
        const { queue } = JSON.parse((e as MessageEvent).data) as { queue: string };
        scheduleInvalidate(queue);
      } catch {
        // Ignore malformed payloads
      }
    });

    // On reconnect after a drop, invalidate all queue-related data to catch
    // events missed while disconnected. The 'open' event also fires on
    // initial connect, but invalidating freshly-fetched queries is a no-op.
    es.addEventListener('open', () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['browse'] });
      queryClient.invalidateQueries({ queryKey: ['sync-targets'] });
    });

    es.onerror = () => {
      // EventSource fires 'error' on any connection issue. The browser will
      // auto-reconnect (using the server's retry: interval). Debug-level
      // only — SSE drops during deploys/restarts are expected and noisy.
      console.debug('[useQueueEvents] SSE connection error — browser will auto-reconnect');
    };

    return () => {
      es.close();
      for (const t of timers.values()) clearTimeout(t);
    };
  }, [queryClient]);
}
