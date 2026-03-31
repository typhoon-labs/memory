interface ToolLabel {
  active: string;
  done: string;
}

const TOOL_LABELS: Record<string, ToolLabel> = {
  knowledgeAgent: { active: 'Consulting knowledge base', done: 'Consulted knowledge base' },
  searchKnowledgeBase: { active: 'Searching documents', done: 'Searched documents' },
};

export function resolveToolLabel(toolName: string): ToolLabel {
  const label = TOOL_LABELS[toolName];
  if (label) return label;
  // Humanize unknown tool names
  const humanized = toolName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
  return { active: `Running ${humanized}`, done: `Completed ${humanized}` };
}
