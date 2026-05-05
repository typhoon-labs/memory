import { Link } from '@tanstack/react-router';
import { formatRelativeTime, Skeleton } from '@typhoon/ui';
import { MessageSquareIcon } from 'lucide-react';

import type { ThreadListItem } from '../chat/use-thread';

interface ConversationActivityProps {
  threads: ThreadListItem[];
  isLoading: boolean;
}

/** Recent conversations list. */
export function ConversationActivity({ threads, isLoading }: ConversationActivityProps) {
  if (isLoading) {
    return (
      <div className="flex h-[200px] flex-col justify-center space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  const recent = threads.slice(0, 7);

  if (recent.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No conversations yet
      </div>
    );
  }

  return (
    <ul className="h-[200px] space-y-0.5 overflow-y-auto">
      {recent.map((thread) => (
        <li key={thread.id}>
          <Link
            to="/chat/$threadId"
            params={{ threadId: thread.id }}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
          >
            <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{thread.title || 'Untitled'}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatRelativeTime(thread.updatedAt, { compact: true })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
