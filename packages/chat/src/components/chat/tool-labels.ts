/**
 * Static labels for the inline tool-call pill.
 *
 * Resolution order:
 *   1. Static {@link TOOL_LABELS} map (fallback for known tools).
 *   2. Humanised tool id (fallback for unknown tools).
 *
 * Live narration is no longer routed through here — the agent's prose between
 * tool calls renders naturally as inline text bubbles, and per-tool live
 * sub-progress is delivered separately via Mastra's `data-tool-progress`
 * custom data parts (see `ProgressTracker`).
 */

const TOOL_LABELS: Record<string, string> = {
  // Supervisor → knowledge search (two-phase tool)
  searchKnowledge: 'Researching your question',
  // Legacy: persisted messages from before the custom tool migration
  'agent-knowledgeAgent': 'Researching your question',

  // Knowledge agent tools (Phase 1 internals — shown in activity tracker)
  searchKnowledgeBase: 'Searching documents',
  searchKnowledgeBaseHybrid: 'Searching documents',
  searchKnowledgeBaseGraph: 'Finding related documents',

  // Mastra built-in memory tool
  updateWorkingMemory: 'Updating memory',

  // Thread title generation
  setThreadTitle: 'Naming conversation',
};

export function resolveToolStatus(toolName: string): string {
  const label = TOOL_LABELS[toolName];
  if (label) return label;

  const humanised = toolName
    .replaceAll('-', ' ')
    .replaceAll(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
  return `Using ${humanised}`;
}
