export { cn } from '@typhoon/ui';

/**
 * Strip common inline markdown syntax (bold, italic, code, strikethrough)
 * from a string, returning plain text.
 */
export function stripMarkdown(text: string): string {
  return text
    .replaceAll(/\*\*(.+?)\*\*/g, '$1')
    .replaceAll(/__(.+?)__/g, '$1')
    .replaceAll(/\*(.+?)\*/g, '$1')
    .replaceAll(/_(.+?)_/g, '$1')
    .replaceAll(/~~(.+?)~~/g, '$1')
    .replaceAll(/`(.+?)`/g, '$1');
}
