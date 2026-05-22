import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PromptInput, PromptInputSubmit, PromptInputTextarea } from './prompt-input';

afterEach(cleanup);

describe('PromptInput', () => {
  it('calls onSubmit when form is submitted', () => {
    const onSubmit = vi.fn();
    render(
      <PromptInput onSubmit={onSubmit}>
        <button type="submit">Send</button>
      </PromptInput>,
    );

    fireEvent.click(screen.getByText('Send'));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('prevents default form submission', () => {
    const onSubmit = vi.fn();
    render(
      <PromptInput onSubmit={onSubmit}>
        <button type="submit">Send</button>
      </PromptInput>,
    );

    const form = document.querySelector('form');
    expect(form).toBeTruthy();
    const event = new Event('submit', { bubbles: true, cancelable: true });
    const prevented = !form?.dispatchEvent(event);
    expect(prevented).toBe(true);
  });

  it('applies className to form', () => {
    render(
      <PromptInput onSubmit={vi.fn()} className="my-form">
        <span>child</span>
      </PromptInput>,
    );

    const form = document.querySelector('form');
    expect(form?.classList.contains('my-form')).toBe(true);
  });
});

describe('PromptInputTextarea', () => {
  it('submits on Enter key', () => {
    const onSubmit = vi.fn();
    render(
      <PromptInput onSubmit={onSubmit}>
        <PromptInputTextarea placeholder="Type..." />
      </PromptInput>,
    );

    const textarea = screen.getByPlaceholderText('Type...');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('does not submit on Shift+Enter', () => {
    const onSubmit = vi.fn();
    render(
      <PromptInput onSubmit={onSubmit}>
        <PromptInputTextarea placeholder="Type..." />
      </PromptInput>,
    );

    const textarea = screen.getByPlaceholderText('Type...');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls custom onKeyDown handler', () => {
    const onKeyDown = vi.fn();
    render(
      <PromptInput onSubmit={vi.fn()}>
        <PromptInputTextarea placeholder="Type..." onKeyDown={onKeyDown} />
      </PromptInput>,
    );

    const textarea = screen.getByPlaceholderText('Type...');
    fireEvent.keyDown(textarea, { key: 'a' });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });

  it('passes value and onChange', () => {
    const onChange = vi.fn();
    render(
      <PromptInput onSubmit={vi.fn()}>
        <PromptInputTextarea value="hello" onChange={onChange} placeholder="Type..." />
      </PromptInput>,
    );

    const textarea = screen.getByPlaceholderText('Type...') as HTMLTextAreaElement;
    expect(textarea.value).toBe('hello');
  });
});

describe('PromptInputSubmit', () => {
  it('renders send icon by default', () => {
    const { container } = render(
      <PromptInput onSubmit={vi.fn()}>
        <PromptInputSubmit />
      </PromptInput>,
    );

    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders stop icon when streaming', () => {
    const { container } = render(
      <PromptInput onSubmit={vi.fn()}>
        <PromptInputSubmit status="streaming" />
      </PromptInput>,
    );

    // Streaming shows a square div instead of SVG
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.rounded-sm')).toBeTruthy();
  });

  it('renders custom children when provided', () => {
    render(
      <PromptInput onSubmit={vi.fn()}>
        <PromptInputSubmit>Custom</PromptInputSubmit>
      </PromptInput>,
    );

    expect(screen.getByText('Custom')).toBeTruthy();
  });

  it('is disabled when disabled prop is true', () => {
    render(
      <PromptInput onSubmit={vi.fn()}>
        <PromptInputSubmit disabled />
      </PromptInput>,
    );

    const button = document.querySelector('button');
    expect(button?.disabled).toBe(true);
  });
});
