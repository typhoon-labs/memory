import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from './conversation';

afterEach(cleanup);

describe('Conversation', () => {
  it('renders children inside a provider wrapper', () => {
    render(
      <Conversation>
        <div data-testid="child">Hello</div>
      </Conversation>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('applies custom className to root div', () => {
    const { container } = render(
      <Conversation className="my-custom-class">
        <span>content</span>
      </Conversation>,
    );
    const root = container.firstElementChild;
    expect(root?.className).toContain('my-custom-class');
  });
});

describe('ConversationContent', () => {
  it('renders children within a scrollable container', () => {
    render(
      <Conversation>
        <ConversationContent>
          <p data-testid="msg">Message 1</p>
        </ConversationContent>
      </Conversation>,
    );
    expect(screen.getByTestId('msg')).toBeTruthy();
  });

  it('applies custom className', () => {
    const { container } = render(
      <Conversation>
        <ConversationContent className="scroll-area">
          <span>text</span>
        </ConversationContent>
      </Conversation>,
    );
    const scrollDiv = container.querySelector('.scroll-area');
    expect(scrollDiv).toBeTruthy();
  });

  it('renders multiple children', () => {
    render(
      <Conversation>
        <ConversationContent>
          <p>Message A</p>
          <p>Message B</p>
          <p>Message C</p>
        </ConversationContent>
      </Conversation>,
    );
    expect(screen.getByText('Message A')).toBeTruthy();
    expect(screen.getByText('Message B')).toBeTruthy();
    expect(screen.getByText('Message C')).toBeTruthy();
  });
});

describe('ConversationScrollButton', () => {
  it('renders nothing when user is at the bottom (default state)', () => {
    const { container } = render(
      <Conversation>
        <ConversationScrollButton />
      </Conversation>,
    );
    // Default isAtBottom is true, so button should not appear
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('ConversationEmptyState', () => {
  it('renders title and description', () => {
    render(
      <Conversation>
        <ConversationEmptyState title="No messages yet" description="Start a conversation" />
      </Conversation>,
    );
    expect(screen.getByText('No messages yet')).toBeTruthy();
    expect(screen.getByText('Start a conversation')).toBeTruthy();
  });

  it('renders with icon', () => {
    render(
      <Conversation>
        <ConversationEmptyState icon={<span data-testid="icon">IC</span>} title="Empty" />
      </Conversation>,
    );
    expect(screen.getByTestId('icon')).toBeTruthy();
  });

  it('renders without title or description', () => {
    const { container } = render(
      <Conversation>
        <ConversationEmptyState />
      </Conversation>,
    );
    // Should render the wrapper div even with no content
    expect(container.querySelector('.flex')).toBeTruthy();
  });

  it('applies custom className', () => {
    const { container } = render(
      <Conversation>
        <ConversationEmptyState className="custom-empty" title="Test" />
      </Conversation>,
    );
    const emptyDiv = container.querySelector('.custom-empty');
    expect(emptyDiv).toBeTruthy();
  });
});
