import { describe, expect, it } from 'vitest';
import { resolveToolStatus } from './tool-labels';

describe('resolveToolStatus', () => {
  it('returns static label for searchKnowledge', () => {
    expect(resolveToolStatus('searchKnowledge')).toBe('Researching your question');
  });

  it('returns static label for legacy agent-knowledgeAgent', () => {
    expect(resolveToolStatus('agent-knowledgeAgent')).toBe('Researching your question');
  });

  it('returns static label for searchKnowledgeBase', () => {
    expect(resolveToolStatus('searchKnowledgeBase')).toBe('Searching documents');
  });

  it('returns static label for searchKnowledgeBaseHybrid', () => {
    expect(resolveToolStatus('searchKnowledgeBaseHybrid')).toBe('Searching documents');
  });

  it('returns static label for searchKnowledgeBaseGraph', () => {
    expect(resolveToolStatus('searchKnowledgeBaseGraph')).toBe('Finding related documents');
  });

  it('returns static label for updateWorkingMemory', () => {
    expect(resolveToolStatus('updateWorkingMemory')).toBe('Updating memory');
  });

  it('humanises camelCase tool names', () => {
    expect(resolveToolStatus('someCustomTool')).toBe('Using Some Custom Tool');
  });

  it('humanises hyphenated tool names', () => {
    const result = resolveToolStatus('my-custom-tool');
    expect(result.startsWith('Using ')).toBe(true);
  });

  it('capitalises first letter for unknown tools', () => {
    const result = resolveToolStatus('lowercase');
    expect(result).toBe('Using Lowercase');
  });

  it('handles empty string input', () => {
    const result = resolveToolStatus('');
    expect(result).toBe('Using ');
  });

  it('handles tool names with numbers', () => {
    const result = resolveToolStatus('searchKB2');
    expect(result).toContain('Using');
  });
});
