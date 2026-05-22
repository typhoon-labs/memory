import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from './typhoon-message';
import { TyphoonThread } from './typhoon-thread';

// ---------------------------------------------------------------------------
// Mocks — keep heavy children shallow so we test TyphoonThread logic, not
// Streamdown rendering or the full TyphoonMessage tree.
// ---------------------------------------------------------------------------

vi.mock('./typhoon-message', () => ({
  TyphoonMessage: ({ message, isStreaming }: { message: ChatMessage; isStreaming: boolean }) => (
    <div data-testid={`msg-${message.id}`} data-role={message.role} data-streaming={isStreaming}>
      {message.parts
        .filter((p) => p.type === 'text')
        .map((p) => (
          <span key={(p as { text: string }).text}>{(p as { text: string }).text}</span>
        ))}
    </div>
  ),
}));

vi.mock('./typhoon-composer', () => ({
  TyphoonComposer: () => <div data-testid="composer" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMsg(id: string, role: 'user' | 'assistant', text: string): ChatMessage {
  return { id, role, parts: [{ type: 'text' as const, text }] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(cleanup);

describe('TyphoonThread', () => {
  const noop = () => {};

  it('renders the empty state when there are no messages', () => {
    render(<TyphoonThread messages={[]} status="ready" sendMessage={noop} />);
    expect(screen.getByText('Ask Typhoon anything')).toBeTruthy();
  });

  it('renders user and assistant messages', () => {
    const messages: ChatMessage[] = [makeMsg('1', 'user', 'Hello'), makeMsg('2', 'assistant', 'Hi there!')];

    render(<TyphoonThread messages={messages} status="ready" sendMessage={noop} />);

    expect(screen.getByTestId('msg-1')).toBeTruthy();
    expect(screen.getByTestId('msg-2')).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
    expect(screen.getByText('Hi there!')).toBeTruthy();
  });

  it('filters out system-reminder retry markers', () => {
    const messages: ChatMessage[] = [
      makeMsg('1', 'user', 'Question'),
      makeMsg('2', 'assistant', '<system-reminder>continue</system-reminder>'),
      makeMsg('3', 'assistant', 'Actual answer'),
    ];

    render(<TyphoonThread messages={messages} status="ready" sendMessage={noop} />);

    expect(screen.getByTestId('msg-1')).toBeTruthy();
    expect(screen.queryByTestId('msg-2')).toBeNull();
    expect(screen.getByTestId('msg-3')).toBeTruthy();
  });

  it('filters out non-user/non-assistant roles', () => {
    const messages: ChatMessage[] = [
      makeMsg('1', 'user', 'Hi'),
      { id: 'sys', role: 'system' as 'user', parts: [{ type: 'text' as const, text: 'System msg' }] },
      makeMsg('3', 'assistant', 'Response'),
    ];

    render(<TyphoonThread messages={messages} status="ready" sendMessage={noop} />);

    expect(screen.getByTestId('msg-1')).toBeTruthy();
    // System message should be filtered out — it has role 'system'
    expect(screen.queryByText('System msg')).toBeNull();
    expect(screen.getByTestId('msg-3')).toBeTruthy();
  });

  it('shows loader when status is submitted', () => {
    const messages: ChatMessage[] = [makeMsg('1', 'user', 'What is PTO?')];

    const { container } = render(<TyphoonThread messages={messages} status="submitted" sendMessage={noop} />);

    // Loader renders animated dots — look for the wrapper with animate-pulse children
    const pulseDots = container.querySelectorAll('.animate-pulse');
    expect(pulseDots.length).toBeGreaterThan(0);
  });

  it('shows loader when streaming but last assistant message has no text', () => {
    const messages: ChatMessage[] = [
      makeMsg('1', 'user', 'Hello'),
      { id: '2', role: 'assistant', parts: [{ type: 'text' as const, text: '' }] },
    ];

    const { container } = render(<TyphoonThread messages={messages} status="streaming" sendMessage={noop} />);

    const pulseDots = container.querySelectorAll('.animate-pulse');
    expect(pulseDots.length).toBeGreaterThan(0);
  });

  it('does not show loader when streaming and last assistant message has text', () => {
    const messages: ChatMessage[] = [makeMsg('1', 'user', 'Hello'), makeMsg('2', 'assistant', 'Streaming text...')];

    const { container } = render(<TyphoonThread messages={messages} status="streaming" sendMessage={noop} />);

    const pulseDots = container.querySelectorAll('.animate-pulse');
    expect(pulseDots.length).toBe(0);
  });

  it('shows an error message when error prop is set and not streaming', () => {
    const messages: ChatMessage[] = [makeMsg('1', 'user', 'Hello')];
    const error = new Error('Connection failed');

    render(<TyphoonThread messages={messages} status="ready" sendMessage={noop} error={error} />);

    expect(screen.getByText(/Connection failed/)).toBeTruthy();
    expect(screen.getByText(/Please try again/)).toBeTruthy();
  });

  it('does not show error when streaming', () => {
    const messages: ChatMessage[] = [makeMsg('1', 'user', 'Hello'), makeMsg('2', 'assistant', 'Answering...')];
    const error = new Error('Something broke');

    render(<TyphoonThread messages={messages} status="streaming" sendMessage={noop} error={error} />);

    expect(screen.queryByText(/Something broke/)).toBeNull();
  });

  it('marks the last assistant message as streaming when status is streaming', () => {
    const messages: ChatMessage[] = [
      makeMsg('1', 'user', 'Hello'),
      makeMsg('2', 'assistant', 'First response'),
      makeMsg('3', 'user', 'Follow up'),
      makeMsg('4', 'assistant', 'Second response'),
    ];

    render(<TyphoonThread messages={messages} status="streaming" sendMessage={noop} />);

    // Only the last assistant message should be marked as streaming
    expect(screen.getByTestId('msg-2').getAttribute('data-streaming')).toBe('false');
    expect(screen.getByTestId('msg-4').getAttribute('data-streaming')).toBe('true');
  });

  it('passes config to ChatConfigProvider', () => {
    // This is an integration test verifying the config prop flows through.
    // Since TyphoonMessage is mocked, we just verify no crash with config.
    const messages: ChatMessage[] = [makeMsg('1', 'assistant', 'Hello')];
    const config = { userName: 'Alice' };

    render(<TyphoonThread messages={messages} status="ready" sendMessage={noop} config={config} />);

    expect(screen.getByTestId('msg-1')).toBeTruthy();
  });

  it('shows generic fallback when error has no message', () => {
    const messages: ChatMessage[] = [makeMsg('1', 'user', 'Hello')];
    const error = new Error();

    render(<TyphoonThread messages={messages} status="ready" sendMessage={noop} error={error} />);

    expect(screen.getByText(/Something went wrong/)).toBeTruthy();
  });
});
