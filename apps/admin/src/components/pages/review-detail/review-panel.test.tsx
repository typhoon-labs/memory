import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./annotation-panel', () => ({
  AnnotationPanel: () => <div data-testid="annotation-panel">Annotation Panel</div>,
}));
vi.mock('./score-panel', () => ({
  ScorePanel: () => <div data-testid="score-panel">Score Panel</div>,
}));

import { ReviewPanel } from './review-panel';

const baseMessage = {
  id: 'msg-1',
  role: 'assistant' as const,
  content: [{ type: 'text' as const, text: 'Hello' }],
  createdAt: '2025-01-01T00:00:00Z',
} as never;

describe('ReviewPanel', () => {
  it('renders tabs for scores and annotation', () => {
    render(<ReviewPanel threadId="th-1" message={baseMessage} scores={[]} />);
    expect(screen.getByText('Scores')).toBeTruthy();
    expect(screen.getByText('Annotation')).toBeTruthy();
  });

  it('shows score count in tab label', () => {
    const scores = [
      { scorer_id: 'accuracy', score: 0.8, message_id: 'msg-1', created_at: '2025-01-01' },
      { scorer_id: 'fluency', score: 0.7, message_id: 'msg-1', created_at: '2025-01-01' },
    ] as never;
    render(<ReviewPanel threadId="th-1" message={baseMessage} scores={scores} />);
    expect(screen.getByText('Scores (2)')).toBeTruthy();
  });

  it('shows annotation count in tab label', () => {
    const scores = [{ scorer_id: 'human-review', score: 0.5, message_id: 'msg-1', created_at: '2025-01-01' }] as never;
    render(<ReviewPanel threadId="th-1" message={baseMessage} scores={scores} />);
    expect(screen.getByText('Annotation (1)')).toBeTruthy();
  });

  it('renders ScorePanel in scores tab', () => {
    render(<ReviewPanel threadId="th-1" message={baseMessage} scores={[]} />);
    expect(screen.getByTestId('score-panel')).toBeTruthy();
  });
});
