import type { UIMessage } from '@ai-sdk/react';
import { CopyIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Message, MessageAction, MessageActions, MessageContent } from '../ai-elements/message.js';
import { useChatConfig } from './chat-config.js';
import { type SourceCitation, SourceCitations } from './source-citations.js';
import { StreamdownText } from './streamdown-text.js';
import { TaskProgress, type ToolPart } from './task-progress.js';

// =============================================================================
// Helpers
// =============================================================================

function getInitials(name: string): string {
  return name.charAt(0).toUpperCase();
}

function formatTimestamp(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Extract source citations from tool-result parts for searchKnowledgeBase. */
function extractCitations(message: UIMessage): SourceCitation[] {
  const citations: SourceCitation[] = [];
  for (const part of message.parts) {
    if (!part.type.startsWith('tool-')) continue;
    const toolName = part.type.slice('tool-'.length);
    if (toolName !== 'searchKnowledgeBase') continue;
    const tp = part as unknown as { state?: string; output?: unknown };
    if (tp.state !== 'output-available') continue;
    const result = tp.output;
    if (!Array.isArray(result)) continue;
    for (const doc of result) {
      if (typeof doc === 'object' && doc !== null && 'documentTitle' in doc) {
        citations.push({
          documentTitle: (doc as { documentTitle: string }).documentTitle,
          section: (doc as { section?: string }).section,
          score: (doc as { score?: number }).score,
        });
      }
    }
  }
  return citations;
}

// =============================================================================
// Component
// =============================================================================

export type ChatMessage = UIMessage & { createdAt?: Date | string };

export function TyphoonMessage({ message, isStreaming }: { message: ChatMessage; isStreaming: boolean }) {
  const config = useChatConfig();
  const isAssistant = message.role === 'assistant';
  const displayName = isAssistant ? 'Typhoon' : (config.userName ?? 'You');
  const citations = isAssistant ? extractCitations(message) : [];

  const hasFeedback = isAssistant && message.id ? config.feedbackState?.has(message.id) : false;
  const feedbackComment = isAssistant && message.id ? config.feedbackState?.get(message.id)?.comment : undefined;

  const [commentFormOpen, setCommentFormOpen] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const thumbsDownRef = useRef<HTMLSpanElement>(null);
  const [arrowLeft, setArrowLeft] = useState(0);

  const showCard = commentFormOpen || !!feedbackComment;

  // Measure arrow position when the card needs to be shown
  useEffect(() => {
    if (showCard && thumbsDownRef.current && messageRef.current) {
      const anchor = thumbsDownRef.current;
      const container = messageRef.current;
      const anchorRect = anchor.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setArrowLeft(anchorRect.left - containerRect.left + anchorRect.width / 2);
    }
  }, [showCard]);

  // Auto-focus textarea when form opens
  useEffect(() => {
    if (commentFormOpen) {
      requestAnimationFrame(() => commentRef.current?.focus());
    }
  }, [commentFormOpen]);

  const handleSubmitNegative = useCallback(() => {
    if (!message.id) return;
    const comment = commentRef.current?.value.trim() || undefined;
    config.onFeedback?.(message.id, 'negative', comment);
    setCommentFormOpen(false);
  }, [config, message.id]);

  return (
    <Message from={message.role}>
      <div ref={messageRef} id={message.id ? `msg-${message.id}` : undefined}>
        {/* Header: avatar + name */}
        <div className="mb-1.5 flex items-center gap-1.5">
          <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-medium text-muted-foreground ring-1 ring-border">
            {getInitials(displayName)}
          </div>
          <span className="text-2xs font-medium uppercase tracking-widest text-muted-foreground/50">{displayName}</span>
          <span className="flex-1" />
          {message.createdAt && (
            <span className="text-2xs text-muted-foreground/30">{formatTimestamp(message.createdAt)}</span>
          )}
        </div>

        {/* Content: iterate parts in order */}
        <MessageContent>
          {(() => {
            // Collect all tool parts for the activity tracker
            const toolParts: ToolPart[] = message.parts
              .filter((p) => p.type.startsWith('tool-'))
              .map((p) => {
                const tp = p as { type: string; toolName?: string; state?: string };
                return {
                  type: tp.type,
                  toolName: tp.toolName,
                  state: tp.state,
                };
              });

            let trackerRendered = false;

            return message.parts.map((part, i) => {
              if (part.type === 'text') {
                if (!part.text) return null;
                return (
                  <StreamdownText
                    key={`${message.id}-text-${String(i)}`}
                    text={part.text}
                    isStreaming={isStreaming && isAssistant && i === message.parts.length - 1}
                  />
                );
              }
              if (part.type.startsWith('tool-')) {
                // Render a single TaskProgress at the first tool part position
                if (!trackerRendered && toolParts.length > 0) {
                  trackerRendered = true;
                  return <TaskProgress key={`${message.id}-activity`} toolParts={toolParts} />;
                }
                return null;
              }
              return null;
            });
          })()}

          {/* Source citations from RAG results */}
          {citations.length > 0 && <SourceCitations citations={citations} />}
        </MessageContent>

        {/* Action bar */}
        <MessageActions className={hasFeedback || commentFormOpen ? 'opacity-100' : undefined}>
          {isAssistant && (
            <FeedbackButtons
              messageId={message.id}
              commentFormOpen={commentFormOpen}
              onCommentFormOpen={setCommentFormOpen}
              thumbsDownRef={thumbsDownRef}
            />
          )}
          <CopyTextButton message={message} />
        </MessageActions>

        {/* Inline comment form */}
        {commentFormOpen && arrowLeft > 0 && (
          <div className="relative mt-2 rounded-md border border-border bg-[oklch(0.14_0_0)] p-3.5">
            <div
              className="absolute -top-[5px] size-2 rotate-45 border-l border-t border-border bg-[oklch(0.14_0_0)]"
              style={{ left: `${arrowLeft - 4}px` }}
            />
            <p className="text-2xs mb-1.5 font-medium uppercase tracking-widest text-muted-foreground/50">
              What could be improved?
            </p>
            <textarea
              ref={commentRef}
              rows={2}
              placeholder="Share your feedback..."
              className="w-full resize-none rounded bg-background/50 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${el.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleSubmitNegative();
                }
              }}
            />
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                onClick={handleSubmitNegative}
                className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Submit
              </button>
            </div>
          </div>
        )}

        {/* Existing comment display */}
        {!commentFormOpen && feedbackComment && arrowLeft > 0 && (
          <div className="relative mt-2 rounded-md border border-border bg-[oklch(0.14_0_0)] px-3.5 py-2.5">
            <div
              className="absolute -top-[5px] size-2 rotate-45 border-l border-t border-border bg-[oklch(0.14_0_0)]"
              style={{ left: `${arrowLeft - 4}px` }}
            />
            <p className="cursor-text select-text text-xs text-foreground/70">{feedbackComment}</p>
          </div>
        )}

        <hr className="mt-2 border-t border-border" />
      </div>
    </Message>
  );
}

// =============================================================================
// Action buttons
// =============================================================================

function CopyTextButton({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(text);
  }, [text]);

  return (
    <MessageAction label="Copy message" onClick={handleCopy}>
      <CopyIcon className="size-3.5" />
    </MessageAction>
  );
}

function FeedbackButtons({
  messageId,
  commentFormOpen,
  onCommentFormOpen,
  thumbsDownRef,
}: {
  messageId?: string;
  commentFormOpen: boolean;
  onCommentFormOpen: (open: boolean) => void;
  thumbsDownRef: RefObject<HTMLSpanElement | null>;
}) {
  const config = useChatConfig();
  const currentRating = messageId ? config.feedbackState?.get(messageId)?.rating : undefined;

  const handleThumbsUp = useCallback(() => {
    if (!messageId) return;
    config.onFeedback?.(messageId, currentRating === 'positive' ? null : 'positive');
  }, [config, messageId, currentRating]);

  const handleThumbsDown = useCallback(() => {
    if (!messageId) return;
    if (currentRating === 'negative') {
      config.onFeedback?.(messageId, null);
      return;
    }
    onCommentFormOpen(true);
  }, [config, messageId, currentRating, onCommentFormOpen]);

  if (!config.onFeedback || !messageId) return null;

  const thumbsDownActive = currentRating === 'negative' || commentFormOpen;

  return (
    <>
      <MessageAction
        label="Thumbs up"
        active={currentRating === 'positive'}
        activeClassName="text-emerald-400"
        onClick={handleThumbsUp}
        className={currentRating === 'positive' ? 'text-emerald-400 hover:text-emerald-300' : 'hover:text-emerald-400'}
      >
        <ThumbsUpIcon className="size-3.5" />
      </MessageAction>
      <span ref={thumbsDownRef} className="inline-flex">
        <MessageAction
          label="Thumbs down"
          active={thumbsDownActive}
          activeClassName="text-red-400"
          onClick={handleThumbsDown}
          className={thumbsDownActive ? 'text-red-400 hover:text-red-300' : 'hover:text-red-400'}
        >
          <ThumbsDownIcon className="size-3.5" />
        </MessageAction>
      </span>
    </>
  );
}
