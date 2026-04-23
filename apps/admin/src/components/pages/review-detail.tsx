import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { apiFetch, Button, EmptyState, formatAbsoluteTime, LoadingSpinner, PageHeader } from '@typhoon/ui';
import { ActivityIcon, ChevronRightIcon, MessageSquareIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MessageTimeline } from './review-detail/message-timeline';
import { ReviewPanel } from './review-detail/review-panel';
import type { ReviewDetailResponse } from './review-detail/shared';

export function ReviewDetailPage() {
  const { threadId } = useParams({ strict: false }) as { threadId: string };
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<ReviewDetailResponse>({
    queryKey: ['admin-reviews', threadId],
    queryFn: () => apiFetch(`/api/v1/admin/reviews/${threadId}`),
    enabled: !!threadId,
  });

  // Auto-select first assistant message when data loads
  const firstAssistantId = useMemo(() => {
    if (!data) return null;
    const msg = data.messages.find((m) => m.role === 'assistant');
    return msg?.id ?? null;
  }, [data]);

  const activeMessageId = selectedMessageId ?? firstAssistantId;
  const activeMessage = data?.messages.find((m) => m.id === activeMessageId) ?? null;
  const activeScores = activeMessageId ? (data?.scoresByMessage[activeMessageId] ?? []) : [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-5xl">
          {data && (
            <PageHeader
              title={
                <span className="flex items-center gap-1.5">
                  <a href="/reviews" className="text-muted-foreground transition-colors hover:text-foreground">
                    Reviews
                  </a>
                  <ChevronRightIcon className="size-3.5 text-muted-foreground/50" />
                  {data.title || `Thread ${data.id.slice(0, 12)}`}
                </span>
              }
              description={`${data.messages.length} messages · Created ${formatAbsoluteTime(data.createdAt)}`}
              actions={
                <Button variant="outline" size="sm" asChild>
                  <a href={`/traces?threadId=${data.id}`}>
                    <ActivityIcon className="mr-1.5 size-3.5" />
                    View Traces
                  </a>
                </Button>
              }
            />
          )}
        </div>
      </div>

      {/* Body */}
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner />
        </div>
      )}

      {error && (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<MessageSquareIcon className="size-8" />}
            title="Thread not found"
            description="This conversation may have been deleted."
          />
        </div>
      )}

      {data && data.messages.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<MessageSquareIcon className="size-8" />}
            title="No messages"
            description="This thread has no messages yet."
          />
        </div>
      )}

      {data && data.messages.length > 0 && (
        <div className="flex min-h-0 flex-1">
          {/* Conversation */}
          <div className="min-w-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-6 md:px-8">
            <div className="mx-auto max-w-2xl">
              <MessageTimeline
                messages={data.messages}
                scoresByMessage={data.scoresByMessage}
                selectedMessageId={activeMessageId}
                onSelectMessage={setSelectedMessageId}
              />
            </div>
          </div>

          {/* Review sidebar */}
          <div className="hidden w-[340px] shrink-0 border-l border-border lg:block">
            <ReviewPanel threadId={data.id} message={activeMessage} scores={activeScores} />
          </div>
        </div>
      )}
    </div>
  );
}
