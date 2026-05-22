import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@typhoon/ui';
import { AlertCircleIcon, ChevronRightIcon, ChevronsDownUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { Span, SpanNode } from './shared';
import { filterTree, formatDurationMs, spanTypeCategory, spanTypeColor, spanTypeLabel } from './shared';

interface SpanTreeProps {
  roots: SpanNode[];
  traceStartMs: number;
  traceDurationMs: number;
  nameFilter: string;
  typeFilter: string | null;
  onSelectSpan: (span: Span) => void;
}

interface GlobalExpand {
  generation: number;
  expanded: boolean;
}

/** Recursive span tree with CSS waterfall timing bars. */
export function SpanTree({
  roots,
  traceStartMs,
  traceDurationMs,
  nameFilter,
  typeFilter,
  onSelectSpan,
}: SpanTreeProps) {
  const [globalExpand, setGlobalExpand] = useState<GlobalExpand | null>(null);
  const [allExpanded, setAllExpanded] = useState(false);

  function handleToggleAll() {
    const next = !allExpanded;
    setAllExpanded(next);
    setGlobalExpand((prev) => ({ generation: (prev?.generation ?? 0) + 1, expanded: next }));
  }

  // Apply name + type filters
  const filteredRoots = useMemo(() => {
    if (!nameFilter && !typeFilter) return roots;
    const lowerName = nameFilter.toLowerCase();
    return filterTree(roots, (span) => {
      if (nameFilter && !span.name.toLowerCase().includes(lowerName)) return false;
      if (typeFilter && spanTypeCategory(span.spanType) !== typeFilter) return false;
      return true;
    });
  }, [roots, nameFilter, typeFilter]);

  const hasFilters = !!nameFilter || !!typeFilter;

  return (
    <div className="border-border bg-card rounded-lg border">
      {/* Header row */}
      <div className="border-border text-2xs text-muted-foreground flex items-center border-b px-3 py-1.5 font-semibold tracking-widest uppercase">
        <div className="flex w-[40%] shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleToggleAll}
            className="hover:bg-muted flex size-5 items-center justify-center rounded"
            title={allExpanded ? 'Collapse all' : 'Expand all'}
          >
            {allExpanded ? (
              <ChevronsDownUpIcon className="text-muted-foreground size-3.5" />
            ) : (
              <ChevronsUpDownIcon className="text-muted-foreground size-3.5" />
            )}
          </button>
          <span>Span</span>
        </div>
        <div className="flex-1">Timeline</div>
      </div>

      {/* Span rows */}
      <div className="divide-border/50 divide-y">
        {filteredRoots.length > 0 ? (
          filteredRoots.map((node) => (
            <SpanRow
              key={node.span.spanId}
              node={node}
              traceStartMs={traceStartMs}
              traceDurationMs={traceDurationMs}
              onSelectSpan={onSelectSpan}
              globalExpand={globalExpand}
            />
          ))
        ) : hasFilters ? (
          <div className="text-muted-foreground px-3 py-4 text-center text-sm">No matching spans</div>
        ) : null}
      </div>
    </div>
  );
}

interface SpanRowProps {
  node: SpanNode;
  traceStartMs: number;
  traceDurationMs: number;
  onSelectSpan: (span: Span) => void;
  globalExpand: GlobalExpand | null;
}

function SpanRow({ node, traceStartMs, traceDurationMs, onSelectSpan, globalExpand }: SpanRowProps) {
  const { span, children, depth } = node;
  const hasChildren = children.length > 0;
  const [open, setOpen] = useState(depth < 2);

  // Sync with global expand/collapse — generation triggers even when value unchanged
  const generation = globalExpand?.generation;
  const expandedValue = globalExpand?.expanded;
  useEffect(() => {
    if (generation !== null && generation !== undefined && expandedValue !== null && expandedValue !== undefined)
      setOpen(expandedValue);
  }, [generation, expandedValue]);

  // Compute bar position
  const spanStartMs = new Date(span.startedAt).getTime();
  const spanDurationMs = span.durationMs ?? 0;
  const leftPct = traceDurationMs > 0 ? ((spanStartMs - traceStartMs) / traceDurationMs) * 100 : 0;
  const widthPct = traceDurationMs > 0 ? (spanDurationMs / traceDurationMs) * 100 : 0;

  const indent = depth * 16;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="hover:bg-accent/50 flex items-center transition-colors">
        {/* Left: span info */}
        <div className="flex w-[40%] shrink-0 items-center gap-1 px-3 py-1" style={{ paddingLeft: `${12 + indent}px` }}>
          {hasChildren ? (
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="hover:bg-accent flex size-4 shrink-0 items-center justify-center rounded"
              >
                <ChevronRightIcon
                  className={`text-muted-foreground size-3 transition-transform ${open ? 'rotate-90' : ''}`}
                />
              </button>
            </CollapsibleTrigger>
          ) : (
            <span className="size-4 shrink-0" />
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

          <span className="text-2xs text-muted-foreground ml-auto shrink-0 font-mono whitespace-nowrap">
            {formatDurationMs(span.durationMs)}
          </span>
        </div>

        {/* Right: waterfall bar */}
        <div className="flex-1 px-3 py-1">
          <div className="relative h-4">
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
              globalExpand={globalExpand}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
