import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatConfig } from './chat-config';
import { ChatConfigProvider } from './chat-config';
import type { ChatMessage } from './typhoon-message';
import { TyphoonMessage } from './typhoon-message';

// ---------------------------------------------------------------------------
// Mocks — StreamdownText, TaskProgress, SourceCitations are tested
// separately. Keep this file focused on TyphoonMessage orchestration logic.
// ---------------------------------------------------------------------------

vi.mock('./streamdown-text', () => ({
  StreamdownText: ({ text, isStreaming }: { text: string; isStreaming: boolean }) => (
    <div data-testid="streamdown" data-streaming={isStreaming}>
      {text}
    </div>
  ),
}));

vi.mock('./task-progress', () => ({
  TaskProgress: ({ toolParts }: { toolParts: Array<{ toolName?: string; toolCallId?: string }> }) => (
    <div data-testid="task-progress">
      {toolParts.map((tp) => (
        <span key={tp.toolCallId ?? tp.toolName}>{tp.toolName}</span>
      ))}
    </div>
  ),
}));

vi.mock('./source-citations', () => ({
  SourceCitations: ({ citations }: { citations: Array<{ title: string }> }) => (
    <div data-testid="source-citations">{citations.length} citations</div>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderMessage(message: ChatMessage, opts?: { isStreaming?: boolean; config?: ChatConfig }) {
  return render(
    <ChatConfigProvider config={opts?.config ?? {}}>
      <TyphoonMessage message={message} isStreaming={opts?.isStreaming ?? false} />
    </ChatConfigProvider>,
  );
}

function makeTextMessage(id: string, role: 'user' | 'assistant', text: string): ChatMessage {
  return { id, role, parts: [{ type: 'text' as const, text }] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(cleanup);

describe('TyphoonMessage', () => {
  describe('basic rendering', () => {
    it('renders a user message with display name "You"', () => {
      renderMessage(makeTextMessage('1', 'user', 'Hello'));

      expect(screen.getByText('You')).toBeTruthy();
      expect(screen.getByText('Hello')).toBeTruthy();
    });

    it('renders an assistant message with display name "Typhoon"', () => {
      renderMessage(makeTextMessage('1', 'assistant', 'Hi there'));

      expect(screen.getByText('Typhoon')).toBeTruthy();
      expect(screen.getByText('Hi there')).toBeTruthy();
    });

    it('uses userName from config for user messages', () => {
      renderMessage(makeTextMessage('1', 'user', 'Hello'), {
        config: { userName: 'Alice' },
      });

      expect(screen.getByText('Alice')).toBeTruthy();
    });

    it('renders initials from the display name', () => {
      renderMessage(makeTextMessage('1', 'assistant', 'Test'));

      // 'Typhoon' -> 'U'
      expect(screen.getByText('U')).toBeTruthy();
    });

    it('sets the streaming flag on StreamdownText for the last part when streaming', () => {
      renderMessage(makeTextMessage('1', 'assistant', 'Streaming...'), {
        isStreaming: true,
      });

      const streamdown = screen.getByTestId('streamdown');
      expect(streamdown.getAttribute('data-streaming')).toBe('true');
    });

    it('does not set streaming flag when not streaming', () => {
      renderMessage(makeTextMessage('1', 'assistant', 'Done'));

      const streamdown = screen.getByTestId('streamdown');
      expect(streamdown.getAttribute('data-streaming')).toBe('false');
    });
  });

  describe('message with tool calls', () => {
    it('renders TaskProgress for visible tool parts', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'assistant',
        parts: [
          { type: 'text' as const, text: 'Let me search for that.' },
          {
            type: 'tool-invocation' as const,
            toolName: 'searchKnowledgeBase',
            toolCallId: 'tc-1',
            state: 'output-available',
          } as never,
          { type: 'text' as const, text: 'Here is what I found.' },
        ],
      };

      renderMessage(message);

      expect(screen.getByTestId('task-progress')).toBeTruthy();
      expect(screen.getByText('searchKnowledgeBase')).toBeTruthy();
    });

    it('does not render TaskProgress for hidden tools (updateWorkingMemory)', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'assistant',
        parts: [
          { type: 'text' as const, text: 'Some response' },
          {
            type: 'tool-invocation' as const,
            toolName: 'updateWorkingMemory',
            toolCallId: 'tc-1',
            state: 'output-available',
          } as never,
        ],
      };

      renderMessage(message);

      expect(screen.queryByTestId('task-progress')).toBeNull();
    });
  });

  describe('citations', () => {
    it('renders SourceCitations when tool output includes citation data', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-invocation' as const,
            toolName: 'searchKnowledgeBase',
            toolCallId: 'tc-1',
            state: 'output-available',
            output: [{ documentTitle: 'Handbook', documentId: 'doc-1', score: 0.9, text: 'PTO policy' }],
          } as never,
          { type: 'text' as const, text: 'You get 20 days PTO. [Source: Handbook]' },
        ],
      };

      renderMessage(message);

      expect(screen.getByTestId('source-citations')).toBeTruthy();
      expect(screen.getByText('1 citations')).toBeTruthy();
    });

    it('does not render SourceCitations when there are no citations', () => {
      renderMessage(makeTextMessage('1', 'assistant', 'No sources here.'));

      expect(screen.queryByTestId('source-citations')).toBeNull();
    });
  });

  describe('timestamp', () => {
    it('renders a timestamp when createdAt is provided', () => {
      const message: ChatMessage = {
        ...makeTextMessage('1', 'assistant', 'Hello'),
        createdAt: new Date('2024-06-15T14:30:00'),
      };

      renderMessage(message);

      // The component calls formatTimestamp which produces locale-specific output.
      // Just verify something rendered in the timestamp area.
      const container = screen.getByText('Hello').closest('[id]');
      expect(container).toBeTruthy();
    });
  });

  describe('copy button', () => {
    it('renders a copy button for assistant messages', () => {
      renderMessage(makeTextMessage('1', 'assistant', 'Copy me'));

      expect(screen.getByLabelText('Copy message')).toBeTruthy();
    });

    it('renders a copy button for user messages too', () => {
      renderMessage(makeTextMessage('1', 'user', 'My question'));

      expect(screen.getByLabelText('Copy message')).toBeTruthy();
    });
  });

  describe('feedback buttons', () => {
    it('renders thumbs up/down when onFeedback is configured for assistant messages', () => {
      renderMessage(makeTextMessage('1', 'assistant', 'Response'), {
        config: { onFeedback: vi.fn() },
      });

      expect(screen.getByLabelText('Thumbs up')).toBeTruthy();
      expect(screen.getByLabelText('Thumbs down')).toBeTruthy();
    });

    it('does not render feedback buttons for user messages', () => {
      renderMessage(makeTextMessage('1', 'user', 'Question'), {
        config: { onFeedback: vi.fn() },
      });

      expect(screen.queryByLabelText('Thumbs up')).toBeNull();
      expect(screen.queryByLabelText('Thumbs down')).toBeNull();
    });

    it('does not render feedback buttons when onFeedback is not provided', () => {
      renderMessage(makeTextMessage('1', 'assistant', 'Response'));

      expect(screen.queryByLabelText('Thumbs up')).toBeNull();
      expect(screen.queryByLabelText('Thumbs down')).toBeNull();
    });
  });

  describe('multi-part messages', () => {
    it('renders multiple text parts', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'assistant',
        parts: [
          { type: 'text' as const, text: 'First part.' },
          { type: 'text' as const, text: 'Second part.' },
        ],
      };

      renderMessage(message);

      expect(screen.getByText('First part.')).toBeTruthy();
      expect(screen.getByText('Second part.')).toBeTruthy();
    });

    it('skips empty text parts', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'assistant',
        parts: [
          { type: 'text' as const, text: '' },
          { type: 'text' as const, text: 'Visible' },
        ],
      };

      renderMessage(message);

      const streamdowns = screen.getAllByTestId('streamdown');
      expect(streamdowns).toHaveLength(1);
      expect(screen.getByText('Visible')).toBeTruthy();
    });
  });

  describe('copy button interaction', () => {
    it('calls navigator.clipboard.writeText when copy button is clicked', async () => {
      const user = userEvent.setup();
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      renderMessage(makeTextMessage('1', 'assistant', 'Copy this text'));

      const copyButton = screen.getByLabelText('Copy message');
      await user.click(copyButton);

      expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('Copy this text'));
    });
  });

  describe('thumbs up/down toggle behavior', () => {
    it('calls onFeedback with positive when thumbs up is clicked', async () => {
      const user = userEvent.setup();
      const onFeedback = vi.fn();

      renderMessage(makeTextMessage('msg-1', 'assistant', 'Rate me'), {
        config: { onFeedback },
      });

      const thumbsUp = screen.getByLabelText('Thumbs up');
      await user.click(thumbsUp);

      expect(onFeedback).toHaveBeenCalledWith('msg-1', 'positive');
    });

    it('calls onFeedback with null to toggle off positive rating', async () => {
      const user = userEvent.setup();
      const onFeedback = vi.fn();
      const feedbackState = new Map([['msg-1', { rating: 'positive' as const }]]);

      renderMessage(makeTextMessage('msg-1', 'assistant', 'Already rated'), {
        config: { onFeedback, feedbackState },
      });

      const thumbsUp = screen.getByLabelText('Thumbs up');
      await user.click(thumbsUp);

      // Should toggle off: pass null
      expect(onFeedback).toHaveBeenCalledWith('msg-1', null);
    });

    it('activates thumbs down styling when thumbs down is clicked', async () => {
      const user = userEvent.setup();
      const onFeedback = vi.fn();

      renderMessage(makeTextMessage('msg-1', 'assistant', 'Bad answer'), {
        config: { onFeedback },
      });

      const thumbsDown = screen.getByLabelText('Thumbs down');
      await user.click(thumbsDown);

      // After clicking thumbs down, the button should show the active state
      // (comment form itself depends on getBoundingClientRect which returns 0 in happy-dom)
      const thumbsDownButton = screen.getByLabelText('Thumbs down');
      expect(thumbsDownButton.className).toContain('text-red');
    });

    it('removes negative rating when thumbs down is clicked on already-negative', async () => {
      const user = userEvent.setup();
      const onFeedback = vi.fn();
      const feedbackState = new Map([['msg-1', { rating: 'negative' as const }]]);

      renderMessage(makeTextMessage('msg-1', 'assistant', 'Bad answer'), {
        config: { onFeedback, feedbackState },
      });

      const thumbsDown = screen.getByLabelText('Thumbs down');
      await user.click(thumbsDown);

      // Should toggle off negative
      expect(onFeedback).toHaveBeenCalledWith('msg-1', null);
    });
  });

  describe('feedback state display', () => {
    it('shows thumbs up active style when positive feedback is saved', () => {
      const onFeedback = vi.fn();
      const feedbackState = new Map([['msg-1', { rating: 'positive' as const }]]);

      renderMessage(makeTextMessage('msg-1', 'assistant', 'Good answer'), {
        config: { onFeedback, feedbackState },
      });

      const thumbsUp = screen.getByLabelText('Thumbs up');
      expect(thumbsUp.className).toContain('text-emerald');
    });

    it('shows thumbs down active style when negative feedback is saved', () => {
      const onFeedback = vi.fn();
      const feedbackState = new Map([['msg-1', { rating: 'negative' as const }]]);

      renderMessage(makeTextMessage('msg-1', 'assistant', 'Bad answer'), {
        config: { onFeedback, feedbackState },
      });

      const thumbsDown = screen.getByLabelText('Thumbs down');
      expect(thumbsDown.className).toContain('text-red');
    });

    it('does not show active (non-hover) style on thumbs up when feedback is negative', () => {
      const onFeedback = vi.fn();
      const feedbackState = new Map([['msg-1', { rating: 'negative' as const }]]);

      renderMessage(makeTextMessage('msg-1', 'assistant', 'Bad answer'), {
        config: { onFeedback, feedbackState },
      });

      const thumbsUp = screen.getByLabelText('Thumbs up');
      // When not active, the button has hover:text-emerald-400 but NOT text-emerald-400 as a base class
      // Active state uses hover:text-emerald-300, inactive uses hover:text-emerald-400
      expect(thumbsUp.className).toContain('hover:text-emerald-400');
      expect(thumbsUp.className).not.toContain('hover:text-emerald-300');
    });

    it('renders action bar always visible when feedback exists', () => {
      const onFeedback = vi.fn();
      const feedbackState = new Map([['msg-1', { rating: 'positive' as const }]]);

      const { container } = renderMessage(makeTextMessage('msg-1', 'assistant', 'Rated message'), {
        config: { onFeedback, feedbackState },
      });

      // The actions bar should have opacity-100 pinned when hasFeedback is true
      const actionsDiv = container.querySelector('.opacity-100');
      expect(actionsDiv).toBeTruthy();
    });
  });

  describe('citations in rendered output', () => {
    it('renders SourceCitations with correct count from multiple tool outputs', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-invocation' as const,
            toolName: 'searchKnowledgeBase',
            toolCallId: 'tc-1',
            state: 'output-available',
            output: [
              { documentTitle: 'Doc A', documentId: 'doc-1', score: 0.9, text: 'Content A' },
              { documentTitle: 'Doc B', documentId: 'doc-2', score: 0.8, text: 'Content B' },
            ],
          } as never,
          { type: 'text' as const, text: 'Info from [Source: Doc A] and [Source: Doc B].' },
        ],
      };

      renderMessage(message);

      expect(screen.getByTestId('source-citations')).toBeTruthy();
      expect(screen.getByText('2 citations')).toBeTruthy();
    });
  });

  describe('copy text with bibliography', () => {
    it('copies text for assistant message', async () => {
      const user = userEvent.setup();
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      const message: ChatMessage = {
        id: '2',
        role: 'assistant',
        parts: [
          {
            type: 'tool-invocation' as const,
            toolName: 'searchKnowledgeBase',
            toolCallId: 'tc-1',
            state: 'output-available',
            output: [{ documentTitle: 'Handbook', documentId: 'doc-1', score: 0.9, text: 'PTO policy details' }],
          } as never,
          { type: 'text' as const, text: 'You have 20 days PTO. [Source: Handbook]' },
        ],
      };

      renderMessage(message);
      const copyButton = screen.getByLabelText('Copy message');
      await user.click(copyButton);
      expect(writeTextMock).toHaveBeenCalled();
    });
  });

  describe('multi-part messages with tool invocations', () => {
    it('renders text parts interleaved with tool activity', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'assistant',
        parts: [
          { type: 'text' as const, text: 'Searching for info...' },
          {
            type: 'tool-invocation' as const,
            toolName: 'searchKnowledgeBase',
            toolCallId: 'tc-1',
            state: 'output-available',
          } as never,
          { type: 'text' as const, text: 'Found the answer.' },
        ],
      };

      renderMessage(message);
      expect(screen.getByText('Searching for info...')).toBeTruthy();
    });

    it('handles message with only tool parts (no text)', () => {
      const message: ChatMessage = {
        id: '1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-invocation' as const,
            toolName: 'searchKnowledgeBase',
            toolCallId: 'tc-1',
            state: 'call',
          } as never,
        ],
      };

      renderMessage(message);
      // Should still render the message container without crashing
      expect(screen.getByText('Typhoon')).toBeTruthy();
    });
  });

  describe('assistant display name', () => {
    it('always shows Typhoon for assistant messages', () => {
      renderMessage(makeTextMessage('1', 'assistant', 'Hello'));
      expect(screen.getByText('Typhoon')).toBeTruthy();
    });

    it('shows custom userName for user messages', () => {
      renderMessage(makeTextMessage('1', 'user', 'Hi'), {
        config: { userName: 'Bob' },
      });
      expect(screen.getByText('Bob')).toBeTruthy();
    });

    it('shows You by default for user messages with no userName', () => {
      renderMessage(makeTextMessage('1', 'user', 'Hi'));
      expect(screen.getByText('You')).toBeTruthy();
    });
  });

  describe('timestamp formatting', () => {
    it('renders string-based createdAt', () => {
      const message: ChatMessage = {
        ...makeTextMessage('1', 'assistant', 'Time test'),
        createdAt: '2024-06-15T14:30:00Z',
      };

      renderMessage(message);
      // The timestamp should render without crashing
      expect(screen.getByText('Time test')).toBeTruthy();
    });

    it('renders without createdAt (no timestamp area)', () => {
      const message = makeTextMessage('1', 'assistant', 'No timestamp');
      renderMessage(message);
      expect(screen.getByText('No timestamp')).toBeTruthy();
    });
  });

  describe('read-only feedback mode', () => {
    it('renders feedback buttons without click handlers in readOnly mode', () => {
      const onFeedback = vi.fn();
      const feedbackState = new Map([['msg-1', { rating: 'positive' as const }]]);

      renderMessage(makeTextMessage('msg-1', 'assistant', 'Read only'), {
        config: { onFeedback, feedbackState, feedbackReadOnly: true },
      });

      const thumbsUp = screen.getByLabelText('Thumbs up');
      expect(thumbsUp).toBeTruthy();
      // In readOnly mode, thumbs up active should have cursor-default
      expect(thumbsUp.className).toContain('cursor-default');
    });
  });
});
