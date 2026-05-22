import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatConfig } from './chat-config';
import { ChatConfigProvider, useChatConfig } from './chat-config';

afterEach(cleanup);

function ConfigConsumer() {
  const config = useChatConfig();
  return (
    <div>
      <span data-testid="userName">{config.userName ?? 'none'}</span>
      <span data-testid="feedbackReadOnly">{String(config.feedbackReadOnly ?? false)}</span>
      <span data-testid="showDebugInfo">{String(config.showDebugInfo ?? false)}</span>
    </div>
  );
}

describe('ChatConfigProvider', () => {
  it('provides config values to children', () => {
    const config: ChatConfig = {
      userName: 'Alice',
      feedbackReadOnly: true,
      showDebugInfo: true,
    };

    render(
      <ChatConfigProvider config={config}>
        <ConfigConsumer />
      </ChatConfigProvider>,
    );

    expect(screen.getByTestId('userName').textContent).toBe('Alice');
    expect(screen.getByTestId('feedbackReadOnly').textContent).toBe('true');
    expect(screen.getByTestId('showDebugInfo').textContent).toBe('true');
  });

  it('provides empty default context', () => {
    render(<ConfigConsumer />);

    expect(screen.getByTestId('userName').textContent).toBe('none');
    expect(screen.getByTestId('feedbackReadOnly').textContent).toBe('false');
    expect(screen.getByTestId('showDebugInfo').textContent).toBe('false');
  });

  it('provides callback functions', () => {
    const onFeedback = vi.fn();
    const onDocumentOpen = vi.fn();

    function CallbackConsumer() {
      const config = useChatConfig();
      return (
        <div>
          <span data-testid="hasFeedback">{String(!!config.onFeedback)}</span>
          <span data-testid="hasDocOpen">{String(!!config.onDocumentOpen)}</span>
        </div>
      );
    }

    render(
      <ChatConfigProvider config={{ onFeedback, onDocumentOpen }}>
        <CallbackConsumer />
      </ChatConfigProvider>,
    );

    expect(screen.getByTestId('hasFeedback').textContent).toBe('true');
    expect(screen.getByTestId('hasDocOpen').textContent).toBe('true');
  });
});
