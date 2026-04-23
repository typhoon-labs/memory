import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@typhoon/ui';
import { AlertCircleIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import type { Span, SpanNode } from './shared';
import { formatDurationMs, spanTypeColor, spanTypeLabel } from './shared';

interface SpanTreeProps {
  roots: SpanNode[];
  traceStartMs: number;
  traceDurationMs: number;
  onSelectSpan: (span: Span) => void;
}

/** Recursive span tree with CSS waterfall timing bars. */
export function SpanTree({ roots, traceStartMs, traceDurationMs, onSelectSpan }: SpanTreeProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header row */}
      <div className="flex items-center border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <div className="w-[40%] shrink-0">Span</div>
        <div className="flex-1">Timeline</div>
      </div>
      {/* Span rows */}
      <div className="divide-y divide-border/50">
        {roots.map((node) => (
          <SpanRow
            key={node.span.spanId}
            node={node}
            traceStartMs={traceStartMs}
            traceDurationMs={traceDurationMs}
            onSelectSpan={onSelectSpan}
          />
        ))}
      </div>
    </div>
  );
}

interface SpanRowProps {
  node: SpanNode;
  traceStartMs: number;
  traceDurationMs: number;
  onSelectSpan: (span: Span) => void;
}

function SpanRow({ node, traceStartMs, traceDurationMs, onSelectSpan }: SpanRowProps) {
  const { span, children, depth } = node;
  const hasChildren = children.length > 0;
  // Default: expand top 2 levels
  const [open, setOpen] = useState(depth < 2);

  // Compute bar position
  const spanStartMs = new Date(span.startedAt).getTime();
  const spanDurationMs = span.durationMs ?? 0;
  const leftPct = traceDurationMs > 0 ? ((spanStartMs - traceStartMs) / traceDurationMs) * 100 : 0;
  const widthPct = traceDurationMs > 0 ? (spanDurationMs / traceDurationMs) * 100 : 0;

  const indent = depth * 20;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center hover:bg-accent/50 transition-colors">
        {/* Left: span info */}
        <div
          className="w-[40%] shrink-0 flex items-center gap-1 px-3 py-1.5"
          style={{ paddingLeft: `${12 + indent}px` }}
        >
          {hasChildren ? (
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-accent"
              >
                <ChevronRightIcon
                  className={`size-3.5 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
                />
              </button>
            </CollapsibleTrigger>
          ) : (
            <span className="size-5 shrink-0" />
          )}

          {/* Span type dot */}
          <span className={`size-2 shrink-0 rounded-full ${spanTypeColor(span.spanType)}`} />

          {/* Span name — clickable to open detail */}
          <button
            type="button"
            onClick={() => onSelectSpan(span)}
            className="min-w-0 truncate text-left text-sm hover:underline"
            title={span.name}
          >
            {span.name}
          </button>

          {span.error && <AlertCircleIcon className="size-3.5 shrink-0 text-red-400" />}

          <span className="ml-auto shrink-0 whitespace-nowrap font-mono text-2xs text-muted-foreground">
            {formatDurationMs(span.durationMs)}
          </span>
        </div>

        {/* Right: waterfall bar */}
        <div className="flex-1 px-3 py-1.5">
          <div className="relative h-5">
            <div
              className={`absolute top-0.5 bottom-0.5 rounded-sm ${spanTypeColor(span.spanType)} opacity-80`}
              style={{
                left: `${Math.max(0, leftPct)}%`,
                width: `${Math.max(0.5, widthPct)}%`,
              }}
              title={`${spanTypeLabel(span.spanType)} · ${formatDurationMs(span.durationMs)}`}
            />
          </div>
        </div>
      </div>

      {/* Children */}
      {hasChildren && (
        <CollapsibleContent>
          {children.map((child) => (
            <SpanRow
              key={child.span.spanId}
              node={child}
              traceStartMs={traceStartMs}
              traceDurationMs={traceDurationMs}
              onSelectSpan={onSelectSpan}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
