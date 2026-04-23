import { useQuery } from '@tanstack/react-query';
import { apiFetch, EmptyState, LoadingSpinner, PageHeader, StatusBadge } from '@typhoon/ui';
import { MessageSquareQuoteIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';

interface FeedbackEntry {
  id: string;
  threadId: string;
  messageId: string;
  rating: string;
  comment: string | null;
  createdAt: string;
}

export function FeedbackPage() {
  const { data: entries, isLoading } = useQuery<FeedbackEntry[]>({
    queryKey: ['feedback'],
    queryFn: () => apiFetch('/api/v1/feedback'),
  });

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Feedback" description="User feedback on chatbot responses" />

        {isLoading && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!isLoading && entries && entries.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-lg border border-border">
            <table className="min-w-[600px] w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Rating</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Comment</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Thread</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((fb) => (
                  <tr key={fb.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {fb.rating === 'positive' ? (
                          <ThumbsUpIcon className="size-4 text-emerald-400" />
                        ) : (
                          <ThumbsDownIcon className="size-4 text-red-400" />
                        )}
                        <StatusBadge variant={fb.rating === 'positive' ? 'success' : 'error'}>{fb.rating}</StatusBadge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {fb.comment ?? <span className="italic">No comment</span>}
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{fb.threadId.slice(0, 8)}</code>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                      {new Date(fb.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && entries?.length === 0 && (
          <div className="mt-6">
            <EmptyState
              icon={<MessageSquareQuoteIcon className="size-8" />}
              title="No feedback yet"
              description="Feedback will appear here when users rate chatbot responses."
            />
          </div>
        )}
      </div>
    </div>
  );
}
