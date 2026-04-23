import type { UIMessage } from '@ai-sdk/react';
import { CopyIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Message, MessageAction, MessageActions, MessageContent } from '../ai-elements/message';
import { useChatConfig } from './chat-config';
import { CitationProvider } from './citation-context';
import {
  collectProgressEvents,
  extractCitations,
  extractSubAgentTexts,
  formatTimestamp,
  getInitials,
  isVisibleToolPart,
  transformCitationPatterns,
  transformCopyText,
} from './message-utils';
import { SourceCitations } from './source-citations';
import { StreamdownText } from './streamdown-text';
import { TaskProgress, type ToolPart } from './task-progress';

// =============================================================================
// Component
// =============================================================================

export type ChatMessage = UIMessage & { createdAt?: Date | string };

export function TyphoonMessage({ message, isStreaming }: { message: ChatMessage; isStreaming: boolean }) {
  const config = useChatConfig();
  const isAssistant = message.role === 'assistant';
  const displayName = isAssistant ? 'Typhoon' : (config.userName ?? 'You');
  const allCitations = isAssistant ? extractCitations(message) : [];

  // Compute which citation indices are actually referenced inline in the text
  const usedCitationIndices = useMemo(() => {
    if (allCitations.length === 0) return new Set<number>();
    const indices = new Set<number>();
    const subAgentTexts = extractSubAgentTexts(message);
    const hasSubAgentText = subAgentTexts.size > 0;
    let seenTool = false;
    for (const part of message.parts) {
      if (part.type === 'text' && part.text) {
        if (seenTool && hasSubAgentText) continue;
        const { usedIndices } = transformCitationPatterns(part.text, allCitations);
        for (const idx of usedIndices) indices.add(idx);
      } else if (part.type.startsWith('tool-')) {
        seenTool = true;
      }
    }
    for (const [, agentText] of subAgentTexts) {
      const { usedIndices } = transformCitationPatterns(agentText, allCitations);
      for (const idx of usedIndices) indices.add(idx);
    }
    return indices;
  }, [allCitations, message]);

  const citations = useMemo(
    () => allCitations.filter((c) => usedCitationIndices.has(c.index)),
    [allCitations, usedCitationIndices],
  );

  // Build copy-friendly text: matches rendered content with [N] citations + source bibliography
  const copyText = useMemo(() => {
    const subAgentTexts = extractSubAgentTexts(message);
    const hasSubAgentText = subAgentTexts.size > 0;
    const parts: string[] = [];
    let seenTool = false;
    for (const part of message.parts) {
      if (part.type === 'text' && part.text) {
        if (seenTool && hasSubAgentText) continue;
        parts.push(part.text);
      } else if (part.type.startsWith('tool-')) {
        seenTool = true;
      }
    }
    for (const [, agentText] of subAgentTexts) {
      parts.push(agentText);
    }
    let result = transformCopyText(parts.join('\n\n'));
    // Append source bibliography so [N] refs are meaningful when pasted
    if (citations.length > 0) {
      const bib = citations.map((c) => {
        const num = (c.displayIndex ?? String(c.index)).split('.')[0];
        const meta = [c.syncSourceName, c.source].filter(Boolean).join(' · ');
        return `[${num}] ${c.title}${meta ? ` (${meta})` : ''}`;
      });
      result += `\n\n${bib.join('\n')}`;
    }
    return result;
  }, [message, citations]);

  const citationsMap = useMemo(() => {
    const map = new Map<number, (typeof allCitations)[number]>();
    for (const c of allCitations) map.set(c.index, c);
    return map;
  }, [allCitations]);

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

        {/* Content: iterate parts in order. The ProgressTracker (TaskProgress)
            renders once at the position of the first visible tool part and
            absorbs every other tool part in the message — keeps narration
            text bubbles interleaved with one consolidated activity card. */}
        <MessageContent>
          <CitationProvider citations={citationsMap} onDocumentOpen={config.onDocumentOpen}>
            {(() => {
              const progressByCallId = collectProgressEvents(message);
              const subAgentTexts = isAssistant ? extractSubAgentTexts(message) : new Map();
              const hasSubAgentText = subAgentTexts.size > 0;
              const toolParts: ToolPart[] = message.parts
                .filter((p) => isVisibleToolPart(p as ToolPart))
                .map((p) => {
                  const tp = p as ToolPart;
                  return {
                    type: tp.type,
                    toolName: tp.toolName,
                    toolCallId: tp.toolCallId,
                    state: tp.state,
                  };
                });

              let trackerRendered = false;
              let seenTool = false;

              return message.parts.map((part, i) => {
                if (part.type === 'text') {
                  if (!part.text) return null;
                  // Skip supervisor's post-tool text when sub-agent text is rendered
                  // (prevents duplicate content — the sub-agent text has inline citations)
                  if (seenTool && hasSubAgentText) return null;
                  const isLastPart = isStreaming && isAssistant && i === message.parts.length - 1;
                  let text = part.text;
                  if (isAssistant && allCitations.length > 0) {
                    text = transformCitationPatterns(text, allCitations).text;
                  }
                  return (
                    <StreamdownText key={`${message.id}-text-${String(i)}`} text={text} isStreaming={isLastPart} />
                  );
                }
                if (part.type.startsWith('tool-')) {
                  seenTool = true;
                  if (!isVisibleToolPart(part as ToolPart)) return null;
                  if (!trackerRendered && toolParts.length > 0) {
                    trackerRendered = true;
                    // Render sub-agent texts (with inline citations) after the activity tracker
                    const agentTextElements = [...subAgentTexts.entries()].map(([idx, agentText]) => {
                      const transformed =
                        allCitations.length > 0 ? transformCitationPatterns(agentText, allCitations).text : agentText;
                      return (
                        <StreamdownText
                          key={`${message.id}-agent-text-${String(idx)}`}
                          text={transformed}
                          isStreaming={false}
                        />
                      );
                    });
                    return [
                      <TaskProgress
                        key={`${message.id}-activity`}
                        toolParts={toolParts}
                        messageId={message.id ?? `msg-${String(i)}`}
                        progressByCallId={progressByCallId}
                        isStreaming={isStreaming}
                      />,
                      ...agentTextElements,
                    ];
                  }
                  return null;
                }
                return null;
              });
            })()}
          </CitationProvider>

          {/* Source citations footer — always shown when we have citation data */}
          {citations.length > 0 && <SourceCitations citations={citations} onDocumentOpen={config.onDocumentOpen} />}
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
          <CopyTextButton copyText={copyText} />
        </MessageActions>

        {/* Inline comment form */}
        {commentFormOpen && arrowLeft > 0 && (
          <div className="relative mt-2 rounded-md border border-border bg-card p-3.5">
            <div
              className="absolute -top-[5px] size-2 rotate-45 border-l border-t border-border bg-card"
              style={{ left: `${arrowLeft - 4}px` }}
            />
            <p className="text-2xs mb-1.5 font-medium uppercase tracking-widest text-muted-foreground">
              What could be improved?
            </p>
            <textarea
              ref={commentRef}
              rows={2}
              placeholder="Share your feedback..."
              className="w-full resize-none rounded-md border border-input bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={handleSubmitNegative}
                className="inline-flex h-6 items-center rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground outline-none transition-all hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Submit
              </button>
            </div>
          </div>
        )}

        {/* Existing comment display */}
        {!commentFormOpen && feedbackComment && arrowLeft > 0 && (
          <div className="relative mt-2 rounded-md border border-border bg-card px-3.5 py-2.5">
            <div
              className="absolute -top-[5px] size-2 rotate-45 border-l border-t border-border bg-card"
              style={{ left: `${arrowLeft - 4}px` }}
            />
            <p className="cursor-text select-text text-xs text-foreground/90">{feedbackComment}</p>
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

function CopyTextButton({ copyText }: { copyText: string }) {
  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(copyText);
  }, [copyText]);

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

  // Thumbs up: toggle positive off only when it's visually active (saved positive, form closed).
  // If the comment form is open we treat thumbs up as inactive regardless of saved rating,
  // so clicking it always sets positive and dismisses the form rather than accidentally clearing it.
  const handleThumbsUp = useCallback(() => {
    if (!messageId) return;
    config.onFeedback?.(messageId, currentRating === 'positive' && !commentFormOpen ? null : 'positive');
    if (commentFormOpen) onCommentFormOpen(false);
  }, [config, messageId, currentRating, commentFormOpen, onCommentFormOpen]);

  // Thumbs down: if already negative, clicking again removes it. Otherwise toggle the comment form.
  const handleThumbsDown = useCallback(() => {
    if (!messageId) return;
    if (currentRating === 'negative') {
      config.onFeedback?.(messageId, null);
      return;
    }
    onCommentFormOpen(!commentFormOpen);
  }, [config, messageId, currentRating, commentFormOpen, onCommentFormOpen]);

  if (!config.onFeedback || !messageId) return null;

  // Thumbs up is inactive while the comment form is open so the two buttons are never both highlighted.
  const thumbsUpActive = currentRating === 'positive' && !commentFormOpen;
  const thumbsDownActive = currentRating === 'negative' || commentFormOpen;

  return (
    <>
      <MessageAction
        label="Thumbs up"
        active={thumbsUpActive}
        activeClassName="text-emerald-400"
        onClick={handleThumbsUp}
        className={thumbsUpActive ? 'text-emerald-400 hover:text-emerald-300' : 'hover:text-emerald-400'}
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
