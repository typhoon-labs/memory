import type { ChatMessage } from '@typhoon/chat';
import { ChatConfigProvider, TyphoonMessage } from '@typhoon/chat';
import { useMemo } from 'react';

import { ReviewPanel } from './review-panel';
import type { FeedbackEntry, ReviewScore } from './shared';

interface MessageTimelineProps {
  threadId: string;
  messages: ChatMessage[];
  scoresByMessage: Record<string, ReviewScore[]>;
  feedbackByMessage: Record<string, FeedbackEntry[]>;
  onDocumentOpen?: (
    documentId: string,
    options?: { startIndex?: number; chunkText?: string; chunks?: Array<{ startIndex?: number; chunkText?: string }> },
  ) => void;
}

// No-op — prevents admins from modifying end-user feedback while keeping the UI rendered
const noop = () => {};

export function MessageTimeline({
  threadId,
  messages,
  scoresByMessage,
  feedbackByMessage,
  onDocumentOpen,
}: MessageTimelineProps) {
  // Build feedbackState Map for ChatConfig — TyphoonMessage uses this to render
  // thumbs icons in its action bar and the comment card below, identical to desk
  const feedbackState = useMemo(() => {
    const map = new Map<string, { rating: 'positive' | 'negative'; comment?: string }>();
    for (const [messageId, entries] of Object.entries(feedbackByMessage)) {
      // Use the first feedback entry per message (most common case)
      const entry = entries[0];
      if (entry) {
        map.set(messageId, { rating: entry.rating, comment: entry.comment ?? undefined });
      }
    }
    return map;
  }, [feedbackByMessage]);

  return (
    <ChatConfigProvider config={{ onDocumentOpen, onFeedback: noop, feedbackState, feedbackReadOnly: true }}>
      <div className="[&_[data-role]]:mb-0 [&_hr]:hidden">
        {messages.map((msg) => {
          const isAssistant = msg.role === 'assistant';
          const scores = isAssistant ? (scoresByMessage[msg.id] ?? []) : [];

          if (isAssistant) {
            return (
              <div key={msg.id} className="border-border border-b py-6">
                <div className="flex flex-col gap-6 lg:flex-row">
                  {/* Left: message — max-w matches desk TyphoonThread */}
                  <div className="max-w-[720px] min-w-0 flex-1">
                    <TyphoonMessage message={msg} isStreaming={false} />
                  </div>
                  {/* Right: scores + annotation */}
                  <div className="lg:border-border w-full lg:w-[300px] lg:shrink-0 lg:border-l lg:pl-6">
                    <div className="lg:sticky lg:top-4">
                      <ReviewPanel threadId={threadId} message={msg} scores={scores} />
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={msg.id} className="border-border border-b py-6">
              <div className="flex flex-col gap-6 lg:flex-row">
                <div className="max-w-[720px] min-w-0 flex-1">
                  <TyphoonMessage message={msg} isStreaming={false} />
                </div>
                <div className="hidden lg:block lg:w-[300px] lg:shrink-0" />
              </div>
            </div>
          );
        })}
      </div>
    </ChatConfigProvider>
  );
}
