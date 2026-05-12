import { Link } from '@tanstack/react-router';
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  SectionLabel,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  StatusBadge,
} from '@typhoon/ui';
import { ChevronDownIcon, ClipboardCheckIcon } from 'lucide-react';
import { useState } from 'react';
import type { Span } from './shared';
import { formatDurationMs, spanTypeColor, spanTypeLabel } from './shared';

interface SpanDetailSheetProps {
  span: Span | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SpanDetailSheet({ span, open, onOpenChange }: SpanDetailSheetProps) {
  if (!span) return null;

  const statusVariant = span.error ? 'error' : span.endedAt ? 'success' : 'warning';
  const statusLabel = span.error ? 'error' : span.endedAt ? 'completed' : 'running';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent resizable className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <div>
            <SheetTitle>{span.name}</SheetTitle>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <span className={`size-2 rounded-full ${spanTypeColor(span.spanType)}`} />
                {spanTypeLabel(span.spanType)}
              </Badge>
              <StatusBadge variant={statusVariant}>{statusLabel}</StatusBadge>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-4">
          {/* Timing */}
          <div>
            <SectionLabel>Timing</SectionLabel>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Duration</dt>
              <dd className="font-mono">{formatDurationMs(span.durationMs)}</dd>
              <dt className="text-muted-foreground">Started</dt>
              <dd className="font-mono text-xs">{new Date(span.startedAt).toLocaleString()}</dd>
              {span.endedAt && (
                <>
                  <dt className="text-muted-foreground">Ended</dt>
                  <dd className="font-mono text-xs">{new Date(span.endedAt).toLocaleString()}</dd>
                </>
              )}
            </dl>
          </div>

          {/* Tokens */}
          {(span.promptTokens != null || span.completionTokens != null) && (
            <div>
              <SectionLabel>Tokens</SectionLabel>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {span.promptTokens != null && (
                  <>
                    <dt className="text-muted-foreground">Prompt</dt>
                    <dd className="tabular-nums">{span.promptTokens.toLocaleString()}</dd>
                  </>
                )}
                {span.completionTokens != null && (
                  <>
                    <dt className="text-muted-foreground">Completion</dt>
                    <dd className="tabular-nums">{span.completionTokens.toLocaleString()}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {/* Entity */}
          {(span.entityType || span.entityName || span.serviceName) && (
            <div>
              <SectionLabel>Entity</SectionLabel>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {span.entityType && (
                  <>
                    <dt className="text-muted-foreground">Type</dt>
                    <dd>{span.entityType}</dd>
                  </>
                )}
                {span.entityName && (
                  <>
                    <dt className="text-muted-foreground">Name</dt>
                    <dd>{span.entityName}</dd>
                  </>
                )}
                {span.serviceName && (
                  <>
                    <dt className="text-muted-foreground">Service</dt>
                    <dd>{span.serviceName}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {/* Thread link */}
          {span.threadId && (
            <div>
              <SectionLabel>Conversation</SectionLabel>
              <div className="mt-2">
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/reviews/${span.threadId}`}>
                    <ClipboardCheckIcon className="mr-1.5 size-3.5" />
                    View Review
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {/* Error */}
          {span.error && <ErrorSection error={span.error} />}

          {/* Input */}
          {span.input != null && <JsonSection label="Input" data={span.input} />}

          {/* Output */}
          {span.output != null && <JsonSection label="Output" data={span.output} />}

          {/* Attributes */}
          {span.attributes != null && Object.keys(span.attributes).length > 0 && (
            <JsonSection label="Attributes" data={span.attributes} />
          )}

          {/* IDs */}
          <div>
            <SectionLabel>Identifiers</SectionLabel>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Span ID</dt>
              <dd className="truncate font-mono text-xs">{span.spanId}</dd>
              {span.parentSpanId && (
                <>
                  <dt className="text-muted-foreground">Parent</dt>
                  <dd className="truncate font-mono text-xs">{span.parentSpanId}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ErrorSection({ error }: { error: { message: string; name?: string; stack?: string } }) {
  return (
    <div>
      <SectionLabel>Error</SectionLabel>
      <div className="mt-2 rounded-md border border-red-500/30 bg-red-500/5 p-3">
        {error.name && <p className="text-xs font-medium text-red-400">{error.name}</p>}
        <p className="mt-0.5 text-sm">{error.message}</p>
        {error.stack && <StackTrace stack={error.stack} />}
      </div>
    </div>
  );
}

function StackTrace({ stack }: { stack: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronDownIcon className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          Stack trace
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-2xs">
          {stack}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function JsonSection({ label, data }: { label: string; data: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const isLong = json.length > 200;

  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      {isLong ? (
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDownIcon className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-2xs">
              {json}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-2xs">
          {json}
        </pre>
      )}
    </div>
  );
}
