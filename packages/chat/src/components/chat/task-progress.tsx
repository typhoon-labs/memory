import { CheckIcon, LoaderCircleIcon } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import { resolveToolLabel } from './tool-labels.js';

// =============================================================================
// Types
// =============================================================================

export interface ToolPart {
  type: string;
  toolName?: string;
  state?: string;
}

// =============================================================================
// Component
// =============================================================================

export function TaskProgress({ toolParts }: { toolParts: ToolPart[] }) {
  if (toolParts.length === 0) return null;

  return (
    <div className="my-2 space-y-1">
      {toolParts.map((part, i) => {
        const toolName = part.toolName ?? part.type.replace(/^tool-/, '');
        const state = part.state ?? 'input-available';
        const isDone = state === 'output-available' || state === 'output-error';
        const label = resolveToolLabel(toolName);

        return (
          <div key={`step-${String(i)}`} className="flex items-center gap-2 text-xs text-muted-foreground">
            {isDone ? (
              <CheckIcon className="size-3.5 shrink-0 text-emerald-500" />
            ) : (
              <LoaderCircleIcon className={cn('size-3.5 shrink-0 animate-spin')} />
            )}
            <span>{isDone ? label.done : `${label.active}...`}</span>
          </div>
        );
      })}
    </div>
  );
}
