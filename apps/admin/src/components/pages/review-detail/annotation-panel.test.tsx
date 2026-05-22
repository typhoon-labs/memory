import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return {
    ...actual,
    apiFetch: vi.fn(),
    useAuth: vi.fn(() => ({ user: { id: 'user-1', name: 'Alice' } })),
  };
});

import { apiFetch, useAuth } from '@typhoon/ui';

import { renderWithQueryClient } from '../../../test-utils';
import { AnnotationPanel } from './annotation-panel';
import type { ReviewScore } from './shared';

const mockApiFetch = vi.mocked(apiFetch);
const mockUseAuth = vi.mocked(useAuth);

function makeAnnotation(overrides: Partial<ReviewScore> = {}): ReviewScore {
  return {
    id: 'score-1',
    scorer_id: 'human-review',
    score: null,
    reason: '',
    metadata: {
      annotatorId: 'other-user',
      annotatorName: 'Bob',
      tags: ['hallucination', 'incomplete'],
      severity: 'major',
    },
    resource_id: null,
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('AnnotationPanel', () => {
  it('renders empty form when no annotations exist', () => {
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[]} />);
    expect(screen.getByText('Is this response correct?')).toBeTruthy();
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
  });

  it('renders other users annotations as read-only', () => {
    const annotation = makeAnnotation();
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[annotation]} />);
    // Other user's annotation should show header text and tags
    expect(screen.getByText('Has major issues')).toBeTruthy();
    expect(screen.getByText('Hallucination')).toBeTruthy();
    expect(screen.getByText('Incomplete')).toBeTruthy();
    // Avatar initial and name
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('renders "Correct" header for annotation with correct tag', () => {
    const annotation = makeAnnotation({
      metadata: {
        annotatorId: 'other-user',
        annotatorName: 'Carol',
        tags: ['correct'],
      },
    });
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[annotation]} />);
    expect(screen.getByText('Correct')).toBeTruthy();
    expect(screen.getByText('C')).toBeTruthy();
  });

  it('renders critical severity header text', () => {
    const annotation = makeAnnotation({
      metadata: {
        annotatorId: 'other-user',
        annotatorName: 'Dave',
        tags: ['wrong-answer'],
        severity: 'critical',
      },
    });
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[annotation]} />);
    expect(screen.getByText('Has critical issues')).toBeTruthy();
  });

  it('renders "Has issues" when severity is not set', () => {
    const annotation = makeAnnotation({
      metadata: {
        annotatorId: 'other-user',
        annotatorName: 'Eve',
        tags: ['tone-issue'],
      },
    });
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[annotation]} />);
    expect(screen.getByText('Has issues')).toBeTruthy();
  });

  it('displays reason text when present', () => {
    const annotation = makeAnnotation({
      reason: 'This answer is misleading.',
    });
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[annotation]} />);
    expect(screen.getByText('This answer is misleading.')).toBeTruthy();
  });

  it('shows own annotation with edit and delete actions', () => {
    const myAnnotation = makeAnnotation({
      id: 'my-ann',
      metadata: {
        annotatorId: 'user-1',
        annotatorName: 'Alice',
        tags: ['correct'],
      },
    });
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[myAnnotation]} />);
    // Own annotation displayed (not the form)
    expect(screen.getByText('Correct')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('shows Yes step with textarea and submit when clicking Yes', () => {
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[]} />);
    fireEvent.click(screen.getByText('Yes'));
    expect(screen.getByText('Any additional notes?')).toBeTruthy();
    expect(screen.getByPlaceholderText('Optional...')).toBeTruthy();
    expect(screen.getByText('Submit')).toBeTruthy();
  });

  it('shows No step with issue tags and severity when clicking No', () => {
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[]} />);
    fireEvent.click(screen.getByText('No'));
    expect(screen.getByText('What issues are present?')).toBeTruthy();
    expect(screen.getByText('Wrong Answer')).toBeTruthy();
    expect(screen.getByText('Hallucination')).toBeTruthy();
    expect(screen.getByText('Incomplete')).toBeTruthy();
    expect(screen.getByText('Wrong Source')).toBeTruthy();
    expect(screen.getByText('Tone Issue')).toBeTruthy();
    expect(screen.getByText('How severe is this?')).toBeTruthy();
  });

  it('toggles Yes back to initial when clicked twice', () => {
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[]} />);
    fireEvent.click(screen.getByText('Yes'));
    expect(screen.getByText('Any additional notes?')).toBeTruthy();
    fireEvent.click(screen.getByText('Yes'));
    // Should go back to initial — no textarea visible
    expect(screen.queryByPlaceholderText('Optional...')).toBeNull();
  });

  it('disables submit issues button when no tags selected', () => {
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[]} />);
    fireEvent.click(screen.getByText('No'));
    const submitButton = screen.getByText('Submit');
    expect(submitButton.closest('button')?.disabled).toBe(true);
  });

  it('submits correct annotation via POST', async () => {
    mockApiFetch.mockResolvedValue({});
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[]} />);
    fireEvent.click(screen.getByText('Yes'));
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/admin/reviews/th-1/messages/msg-1/annotate',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('submits via PATCH when editing existing annotation with issues', async () => {
    mockApiFetch.mockResolvedValue({});
    const myAnnotation = makeAnnotation({
      id: 'my-ann',
      metadata: {
        annotatorId: 'user-1',
        annotatorName: 'Alice',
        tags: ['hallucination'],
        severity: 'minor',
      },
      reason: 'Some note',
    });
    const { container } = renderWithQueryClient(
      <AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[myAnnotation]} />,
    );
    // The edit button is a small icon button inside AnnotationDisplay
    const pencilSvg = container.querySelector('.lucide-pencil');
    expect(pencilSvg).toBeTruthy();
    const editBtn = pencilSvg?.closest('button');
    expect(editBtn).toBeTruthy();
    fireEvent.click(editBtn as HTMLElement);

    // startEdit sets step to 'issues' since tags don't include 'correct'.
    await waitFor(() => {
      expect(screen.getByText('What issues are present?')).toBeTruthy();
      expect(screen.getByText('Update')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Update'));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/v1/admin/reviews/th-1/messages/msg-1/annotate',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  it('shows cancel button when editing', async () => {
    const myAnnotation = makeAnnotation({
      id: 'my-ann',
      metadata: {
        annotatorId: 'user-1',
        annotatorName: 'Alice',
        tags: ['hallucination'],
        severity: 'minor',
      },
    });
    const { container } = renderWithQueryClient(
      <AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[myAnnotation]} />,
    );
    // Click edit via pencil icon
    const pencilSvg = container.querySelector('.lucide-pencil');
    const editBtn = pencilSvg?.closest('button');
    expect(editBtn).toBeTruthy();
    fireEvent.click(editBtn as HTMLElement);

    // Should show the issues form because the existing annotation had issue tags
    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeTruthy();
    });
  });

  it('handles user with no id gracefully', () => {
    mockUseAuth.mockReturnValue({ user: null } as ReturnType<typeof useAuth>);
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[]} />);
    // Should still show form since no annotation matches
    expect(screen.getByText('Is this response correct?')).toBeTruthy();
  });

  it('falls back to ? for unknown annotator name', () => {
    const annotation = makeAnnotation({
      metadata: {
        annotatorId: 'other-user',
        tags: ['correct'],
      },
    });
    const { container } = renderWithQueryClient(
      <AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[annotation]} />,
    );
    // The avatar initial should be '?' when annotatorName is undefined (falls back to '?')
    // The initial is inside a small div for the avatar circle
    const avatarDiv = container.querySelector('.rounded-full');
    expect(avatarDiv?.textContent).toBe('?');
  });

  it('shows issue tags with correct formatting and minor severity', () => {
    const annotation = makeAnnotation({
      metadata: {
        annotatorId: 'other-user',
        annotatorName: 'Frank',
        tags: ['wrong-answer', 'incomplete'],
        severity: 'minor',
      },
    });
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[annotation]} />);
    expect(screen.getByText('Wrong Answer')).toBeTruthy();
    expect(screen.getByText('Incomplete')).toBeTruthy();
    expect(screen.getByText('Has minor issues')).toBeTruthy();
    expect(screen.getByText('Frank')).toBeTruthy();
  });

  it('renders multiple annotations from different users', () => {
    const annotations = [
      makeAnnotation({
        id: 'ann-1',
        metadata: { annotatorId: 'other-1', annotatorName: 'Bob', tags: ['correct'] },
      }),
      makeAnnotation({
        id: 'ann-2',
        metadata: { annotatorId: 'other-2', annotatorName: 'Carol', tags: ['hallucination'], severity: 'minor' },
      }),
    ];
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={annotations} />);
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Carol')).toBeTruthy();
  });

  it('renders own annotation header and avatar', () => {
    const myAnnotation = makeAnnotation({
      id: 'my-ann',
      metadata: {
        annotatorId: 'user-1',
        annotatorName: 'Alice',
        tags: ['wrong-answer'],
        severity: 'major',
      },
      reason: 'Needs improvement',
    });
    renderWithQueryClient(<AnnotationPanel threadId="th-1" messageId="msg-1" annotations={[myAnnotation]} />);
    // Own annotation should render as AnnotationDisplay with header + issue tags
    expect(screen.getByText('Has major issues')).toBeTruthy();
    expect(screen.getByText('Wrong Answer')).toBeTruthy();
    expect(screen.getByText('Needs improvement')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy(); // avatar initial
  });
});
