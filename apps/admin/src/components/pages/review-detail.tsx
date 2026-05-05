import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import type { ChatMessage } from '@typhoon/chat';
import { DocumentViewerPanel } from '@typhoon/chat';
import {
  apiFetch,
  Button,
  EmptyState,
  formatAbsoluteTime,
  LoadingSpinner,
  PageHeader,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@typhoon/ui';
import { ActivityIcon, ChevronRightIcon, MessageSquareIcon } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { MessageTimeline } from './review-detail/message-timeline';
import type { ReviewDetailResponse } from './review-detail/shared';

interface ViewerDoc {
  documentId: string;
  startIndex?: number;
  chunkText?: string;
  chunks?: Array<{ startIndex?: number; chunkText?: string }>;
}

function Header({ data, messageCount }: { data: ReviewDetailResponse; messageCount: number }) {
  return (
    <div className="shrink-0 p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
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
          description={`${messageCount} messages · Created ${formatAbsoluteTime(data.createdAt)}`}
          actions={
            <Button variant="outline" size="sm" asChild>
              <a href={`/traces?threadId=${data.id}`}>
                <ActivityIcon className="mr-1.5 size-3.5" />
                View Traces
              </a>
            </Button>
          }
        />
      </div>
    </div>
  );
}

export function ReviewDetailPage() {
  const { threadId } = useParams({ strict: false }) as { threadId: string };
  const [viewerDoc, setViewerDoc] = useState<ViewerDoc | null>(null);
  const viewerTriggerRef = useRef(0);

  const { data, isLoading, error } = useQuery<ReviewDetailResponse>({
    queryKey: ['admin-reviews', threadId],
    queryFn: () => apiFetch(`/api/v1/admin/reviews/${threadId}`),
    enabled: !!threadId,
  });

  const messages = useMemo(() => (data?.messages ?? []) as unknown as ChatMessage[], [data?.messages]);
  const feedbackByMessage = data?.feedbackByMessage ?? {};

  const handleDocumentOpen = useCallback(
    (
      documentId: string,
      options?: {
        startIndex?: number;
        chunkText?: string;
        chunks?: Array<{ startIndex?: number; chunkText?: string }>;
      },
    ) => {
      viewerTriggerRef.current += 1;
      setViewerDoc({
        documentId,
        startIndex: options?.startIndex,
        chunkText: options?.chunkText,
        chunks: options?.chunks,
      });
    },
    [],
  );

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        {data && <Header data={data} messageCount={messages.length} />}
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={<MessageSquareIcon className="size-8" />}
          title="Thread not found"
          description="This conversation may have been deleted."
        />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <Header data={data} messageCount={0} />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<MessageSquareIcon className="size-8" />}
            title="No messages"
            description="This thread has no messages yet."
          />
        </div>
      </div>
    );
  }

  // Single layout — ResizablePanelGroup always rendered so MessageTimeline
  // never unmounts when the document viewer opens/closes.
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize={viewerDoc ? 60 : 100} minSize={30}>
        <div className="h-full overflow-y-auto">
          <Header data={data} messageCount={messages.length} />
          <div className="px-4 pb-8 sm:px-6 md:px-8">
            <div className="mx-auto max-w-5xl">
              <MessageTimeline
                threadId={data.id}
                messages={messages}
                scoresByMessage={data.scoresByMessage}
                feedbackByMessage={feedbackByMessage}
                onDocumentOpen={handleDocumentOpen}
              />
            </div>
          </div>
        </div>
      </ResizablePanel>
      {viewerDoc && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={40} minSize={25}>
            <DocumentViewerPanel
              key={viewerTriggerRef.current}
              documentId={viewerDoc.documentId}
              searchTerms={[]}
              startIndex={viewerDoc.startIndex}
              chunkText={viewerDoc.chunkText}
              citationChunks={viewerDoc.chunks}
              onClose={() => setViewerDoc(null)}
            />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
