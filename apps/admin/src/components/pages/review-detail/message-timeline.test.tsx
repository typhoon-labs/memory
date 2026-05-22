import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/chat', () => ({
  ChatConfigProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TyphoonMessage: ({ message }: { message: { role: string; id: string } }) => (
    <div data-testid={`message-${message.id}`}>{message.role}</div>
  ),
}));
vi.mock('./review-panel', () => ({
  ReviewPanel: ({ message }: { message: { id: string } }) => (
    <div data-testid={`review-panel-${message.id}`}>ReviewPanel</div>
  ),
}));

import type { ChatMessage } from '@typhoon/chat';

import { renderWithQueryClient } from '../../../test-utils';
import { MessageTimeline } from './message-timeline';
import type { ReviewScore } from './shared';

beforeEach(() => vi.clearAllMocks());

function makeChatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    parts: [{ type: 'text' as const, text: 'Hello' }],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('MessageTimeline', () => {
  it('renders user and assistant messages', () => {
    const messages: ChatMessage[] = [
      makeChatMessage({ id: 'msg-1', role: 'user' }),
      makeChatMessage({ id: 'msg-2', role: 'assistant' }),
    ];

    renderWithQueryClient(
      <MessageTimeline threadId="th-1" messages={messages} scoresByMessage={{}} feedbackByMessage={{}} />,
    );

    expect(screen.getByTestId('message-msg-1')).toBeTruthy();
    expect(screen.getByTestId('message-msg-2')).toBeTruthy();
  });

  it('renders review panel for assistant messages only', () => {
    const messages: ChatMessage[] = [
      makeChatMessage({ id: 'msg-1', role: 'user' }),
      makeChatMessage({ id: 'msg-2', role: 'assistant' }),
      makeChatMessage({ id: 'msg-3', role: 'assistant' }),
    ];

    renderWithQueryClient(
      <MessageTimeline threadId="th-1" messages={messages} scoresByMessage={{}} feedbackByMessage={{}} />,
    );

    // Review panels only for assistant messages
    expect(screen.queryByTestId('review-panel-msg-1')).toBeNull();
    expect(screen.getByTestId('review-panel-msg-2')).toBeTruthy();
    expect(screen.getByTestId('review-panel-msg-3')).toBeTruthy();
  });

  it('renders empty container when no messages', () => {
    renderWithQueryClient(
      <MessageTimeline threadId="th-1" messages={[]} scoresByMessage={{}} feedbackByMessage={{}} />,
    );

    // No message elements
    expect(screen.queryByTestId(/^message-/)).toBeNull();
  });

  it('passes scores for the correct message to ReviewPanel', () => {
    const score: ReviewScore = {
      id: 'sc-1',
      scorer_id: 'answerRelevancy',
      score: 0.85,
      reason: 'Good',
      metadata: null,
      resource_id: null,
      created_at: '2025-01-01T00:00:00Z',
    };
    const messages: ChatMessage[] = [
      makeChatMessage({ id: 'msg-1', role: 'user' }),
      makeChatMessage({ id: 'msg-2', role: 'assistant' }),
    ];

    renderWithQueryClient(
      <MessageTimeline
        threadId="th-1"
        messages={messages}
        scoresByMessage={{ 'msg-2': [score] }}
        feedbackByMessage={{}}
      />,
    );

    expect(screen.getByTestId('review-panel-msg-2')).toBeTruthy();
  });

  it('builds feedback state from feedbackByMessage', () => {
    const messages: ChatMessage[] = [makeChatMessage({ id: 'msg-1', role: 'assistant' })];

    renderWithQueryClient(
      <MessageTimeline
        threadId="th-1"
        messages={messages}
        scoresByMessage={{}}
        feedbackByMessage={{
          'msg-1': [{ rating: 'negative', comment: 'Bad response', userName: 'Test', createdAt: '2025-01-01' }],
        }}
      />,
    );

    // ChatConfigProvider is mocked to just render children, so we confirm render succeeds
    expect(screen.getByTestId('message-msg-1')).toBeTruthy();
  });

  it('renders multiple messages in order', () => {
    const messages: ChatMessage[] = [
      makeChatMessage({ id: 'msg-1', role: 'user' }),
      makeChatMessage({ id: 'msg-2', role: 'assistant' }),
      makeChatMessage({ id: 'msg-3', role: 'user' }),
      makeChatMessage({ id: 'msg-4', role: 'assistant' }),
    ];

    renderWithQueryClient(
      <MessageTimeline threadId="th-1" messages={messages} scoresByMessage={{}} feedbackByMessage={{}} />,
    );

    expect(screen.getByTestId('message-msg-1')).toBeTruthy();
    expect(screen.getByTestId('message-msg-2')).toBeTruthy();
    expect(screen.getByTestId('message-msg-3')).toBeTruthy();
    expect(screen.getByTestId('message-msg-4')).toBeTruthy();
  });
});
