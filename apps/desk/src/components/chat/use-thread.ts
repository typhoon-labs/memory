import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@typhoon/ui';

export interface ThreadListItem {
  id: string;
  title: string;
  resourceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadListResponse {
  threads: ThreadListItem[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

interface ThreadDetailResponse extends ThreadListItem {
  messages: { id: string; role: string; parts: unknown[]; createdAt: string }[];
}

export function useThreads() {
  return useQuery<ThreadListResponse>({
    queryKey: ['threads'],
    queryFn: () => apiFetch<ThreadListResponse>('/api/v1/threads?perPage=50'),
    refetchInterval: (query) => {
      const threads = query.state.data?.threads;
      if (!threads) return false;
      const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
      const hasRecentUntitled = threads.some((t) => !t.title && new Date(t.createdAt).getTime() > twoMinutesAgo);
      return hasRecentUntitled ? 5_000 : false;
    },
  });
}

export function useThread(threadId: string | undefined) {
  return useQuery<ThreadDetailResponse>({
    queryKey: ['thread', threadId],
    queryFn: () => apiFetch<ThreadDetailResponse>(`/api/v1/threads/${threadId}`),
    enabled: !!threadId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
      const isRecent = new Date(data.createdAt).getTime() > twoMinutesAgo;
      const hasNoMessages = !data.messages || data.messages.length === 0;
      return isRecent && hasNoMessages ? 5_000 : false;
    },
  });
}
