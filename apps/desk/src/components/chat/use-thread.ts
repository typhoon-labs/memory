import { useQuery } from '@tanstack/react-query';

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
    queryFn: async () => {
      const res = await fetch('/api/v1/threads?perPage=50', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch threads');
      return res.json();
    },
  });
}

export function useThread(threadId: string | undefined) {
  return useQuery<ThreadDetailResponse>({
    queryKey: ['thread', threadId],
    queryFn: async () => {
      const res = await fetch(`/api/v1/threads/${threadId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch thread');
      return res.json();
    },
    enabled: !!threadId,
  });
}
