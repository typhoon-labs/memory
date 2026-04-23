import { CitationProvider, StreamdownText } from '@typhoon/chat';
import { cn } from '@typhoon/ui';
import { ChevronDownIcon, FileTextIcon } from 'lucide-react';
import { useState } from 'react';
import type { ReviewScore, UIMessage, UIMessagePart } from './shared';

interface MessageTimelineProps {
  messages: UIMessage[];
  scoresByMessage: Record<string, ReviewScore[]>;
  selectedMessageId: string | null;
  onSelectMessage: (messageId: string) => void;
}

const emptyCitations = new Map();

function getTextContent(parts: UIMessagePart[]): string {
  return parts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text ?? '')
    .join('\n');
}

// ---------------------------------------------------------------------------
// Chunk sources (displayed inline in messages)
// ---------------------------------------------------------------------------

interface ChunkSource {
  chunkId: string;
  title?: string;
  text?: string;
  source?: string;
  displayIndex?: string | number;
}

function getChunkSources(parts: UIMessagePart[]): ChunkSource[] {
  const sources: ChunkSource[] = [];
  for (const part of parts) {
    if (!part.type.startsWith('tool-') || part.state !== 'output-available') continue;
    const output = part.output as Record<string, unknown> | undefined;
    if (!output || !Array.isArray(output._chunkSources)) continue;
    for (const cs of output._chunkSources as ChunkSource[]) {
      if (cs.chunkId) sources.push(cs);
    }
  }
  return sources;
}

function ChunkSourcesSection({ sources }: { sources: ChunkSource[] }) {
  const [expanded, setExpanded] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setExpanded(!expanded)}
      >
        <FileTextIcon className="size-3" />
        <span>
          {sources.length} source{sources.length !== 1 ? 's' : ''}
        </span>
        <ChevronDownIcon className={`size-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1">
          {sources.map((src, i) => (
            <div key={src.chunkId || i} className="rounded border border-border bg-muted/30 px-2 py-1.5 text-xs">
              <div className="flex items-center gap-1.5">
                {src.displayIndex != null && (
                  <span className="text-xs font-medium text-muted-foreground">{src.displayIndex}.</span>
                )}
                <span className="font-medium">{src.title ?? 'Untitled'}</span>
              </div>
              {src.text && <p className="mt-0.5 line-clamp-2 text-muted-foreground">{src.text}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score dots — tiny inline indicator for conversation context
// ---------------------------------------------------------------------------

function ScoreDots({ scores }: { scores: ReviewScore[] }) {
  const automated = scores.filter((s) => s.scorer_id !== 'human-review' && s.score !== null);
  if (automated.length === 0) return null;

  const allPassing = automated.every((s) => {
    const threshold = {
      faithfulness: 0.7,
      hallucination: 0.3,
      answerRelevancy: 0.6,
      contextRelevance: 0.5,
      contextPrecision: 0.5,
    }[s.scorer_id];
    if (!threshold) return (s.score ?? 0) >= 0.5;
    if (s.scorer_id === 'hallucination') return (s.score ?? 1) <= threshold;
    return (s.score ?? 0) >= threshold;
  });

  return (
    <span
      className={cn(
        'ml-auto inline-flex size-2 shrink-0 rounded-full',
        allPassing ? 'bg-emerald-400/60' : 'bg-red-400/60',
      )}
      title={allPassing ? 'All scores passing' : 'Some scores failing'}
    />
  );
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

function UserMessage({ message }: { message: UIMessage }) {
  const text = getTextContent(message.parts);
  return (
    <div className="py-5 first:pt-0">
      <div className="mb-1.5 flex items-center gap-1.5">
        <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-medium text-muted-foreground ring-1 ring-border">
          U
        </div>
        <span className="text-2xs font-medium uppercase tracking-widest text-muted-foreground/50">User</span>
      </div>
      <div className="text-sm leading-relaxed text-card-foreground">
        <StreamdownText text={text} isStreaming={false} />
      </div>
    </div>
  );
}

function AssistantMessage({
  message,
  scores,
  isSelected,
  onSelect,
}: {
  message: UIMessage;
  scores: ReviewScore[];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const text = getTextContent(message.parts);
  const chunkSources = getChunkSources(message.parts);

  return (
    <button
      type="button"
      className={cn(
        '-mx-3 w-[calc(100%+1.5rem)] cursor-pointer rounded-lg px-3 py-5 text-left transition-colors first:pt-5',
        isSelected ? 'bg-primary/[0.04] ring-1 ring-primary/15' : 'hover:bg-muted/30',
      )}
      onClick={onSelect}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[8px] font-medium text-primary ring-1 ring-primary/20">
          U
        </div>
        <span className="text-2xs font-medium uppercase tracking-widest text-muted-foreground/50">Assistant</span>
        <ScoreDots scores={scores} />
      </div>
      <CitationProvider citations={emptyCitations}>
        <div className="text-sm leading-relaxed text-card-foreground">
          <StreamdownText text={text} isStreaming={false} />
        </div>
      </CitationProvider>
      <ChunkSourcesSection sources={chunkSources} />
    </button>
  );
}

export function MessageTimeline({
  messages,
  scoresByMessage,
  selectedMessageId,
  onSelectMessage,
}: MessageTimelineProps) {
  return (
    <div className="divide-y divide-border">
      {messages.map((msg) => {
        if (msg.role === 'user') {
          return <UserMessage key={msg.id} message={msg} />;
        }
        if (msg.role === 'assistant') {
          const scores = scoresByMessage[msg.id] ?? [];
          return (
            <AssistantMessage
              key={msg.id}
              message={msg}
              scores={scores}
              isSelected={selectedMessageId === msg.id}
              onSelect={() => onSelectMessage(msg.id)}
            />
          );
        }
        return null;
      })}
    </div>
  );
}
