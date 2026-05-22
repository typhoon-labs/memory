import type { ProgressEvent } from '@typhoon/ui';
import { describe, expect, it } from 'vitest';

import { resolveStepStatus } from './task-progress';

describe('resolveStepStatus', () => {
  it('returns "completed" for output-available with no events', () => {
    expect(resolveStepStatus('output-available')).toBe('completed');
  });

  it('returns "completed" for output-available with only successful events', () => {
    const events: ProgressEvent[] = [
      { message: 'Searching...', status: 'in-progress' },
      { message: 'Found 3 results', status: 'done' },
    ];
    expect(resolveStepStatus('output-available', events)).toBe('completed');
  });

  it('returns "failed" for output-available when progress events contain a failure', () => {
    const events: ProgressEvent[] = [
      { message: 'Searching...', status: 'in-progress' },
      { message: 'Connection timed out', status: 'failed' },
    ];
    expect(resolveStepStatus('output-available', events)).toBe('failed');
  });

  it('returns "failed" for output-error regardless of events', () => {
    expect(resolveStepStatus('output-error')).toBe('failed');
    expect(resolveStepStatus('output-error', [{ message: 'ok', status: 'done' }])).toBe('failed');
  });

  it('returns "in-progress" for input-available', () => {
    expect(resolveStepStatus('input-available')).toBe('in-progress');
  });

  it('returns "in-progress" for unknown states', () => {
    expect(resolveStepStatus('some-other-state')).toBe('in-progress');
  });

  it('returns "completed" when events is undefined', () => {
    expect(resolveStepStatus('output-available', undefined)).toBe('completed');
  });

  it('returns "completed" when events is empty', () => {
    expect(resolveStepStatus('output-available', [])).toBe('completed');
  });

  // isActive parameter tests

  it('returns "failed" for non-terminal state when not active', () => {
    expect(resolveStepStatus('input-available', undefined, false)).toBe('failed');
  });

  it('returns "failed" for unknown states when not active', () => {
    expect(resolveStepStatus('some-other-state', undefined, false)).toBe('failed');
  });

  it('returns "in-progress" for non-terminal state when explicitly active', () => {
    expect(resolveStepStatus('input-available', undefined, true)).toBe('in-progress');
  });

  it('terminal states are unaffected by isActive flag', () => {
    expect(resolveStepStatus('output-available', undefined, false)).toBe('completed');
    expect(resolveStepStatus('output-error', undefined, false)).toBe('failed');
    expect(resolveStepStatus('output-available', undefined, true)).toBe('completed');
    expect(resolveStepStatus('output-error', undefined, true)).toBe('failed');
  });
});
