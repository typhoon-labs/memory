import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TyphoonComposer } from './typhoon-composer';

afterEach(cleanup);

/** Safely get the form element wrapping the textarea. */
function getForm(): HTMLFormElement {
  const textarea = screen.getByPlaceholderText('Ask a question...');
  const form = textarea.closest('form');
  if (!form) throw new Error('Expected textarea to be inside a <form>');
  return form;
}

describe('TyphoonComposer', () => {
  it('renders the textarea with placeholder', () => {
    render(<TyphoonComposer sendMessage={vi.fn()} status="ready" />);

    expect(screen.getByPlaceholderText('Ask a question...')).toBeTruthy();
  });

  it('renders a submit button', () => {
    render(<TyphoonComposer sendMessage={vi.fn()} status="ready" />);

    const submitBtn = screen.getByRole('button');
    expect(submitBtn).toBeTruthy();
    expect(submitBtn.getAttribute('type')).toBe('submit');
  });

  it('calls sendMessage with trimmed text on form submit', () => {
    const sendMessage = vi.fn();
    render(<TyphoonComposer sendMessage={sendMessage} status="ready" />);

    const textarea = screen.getByPlaceholderText('Ask a question...');
    fireEvent.change(textarea, { target: { value: '  What is PTO?  ' } });
    fireEvent.submit(getForm());

    expect(sendMessage).toHaveBeenCalledWith({ text: 'What is PTO?' });
  });

  it('does not call sendMessage when input is empty', () => {
    const sendMessage = vi.fn();
    render(<TyphoonComposer sendMessage={sendMessage} status="ready" />);

    fireEvent.submit(getForm());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('does not call sendMessage when input is whitespace only', () => {
    const sendMessage = vi.fn();
    render(<TyphoonComposer sendMessage={sendMessage} status="ready" />);

    const textarea = screen.getByPlaceholderText('Ask a question...');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.submit(getForm());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('clears the input after sending', () => {
    const sendMessage = vi.fn();
    render(<TyphoonComposer sendMessage={sendMessage} status="ready" />);

    const textarea = screen.getByPlaceholderText('Ask a question...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.submit(getForm());

    expect(textarea.value).toBe('');
  });

  it('calls stop instead of sendMessage when streaming', () => {
    const sendMessage = vi.fn();
    const stop = vi.fn();
    render(<TyphoonComposer sendMessage={sendMessage} stop={stop} status="streaming" />);

    const textarea = screen.getByPlaceholderText('Ask a question...');
    fireEvent.change(textarea, { target: { value: 'Stop please' } });
    fireEvent.submit(getForm());

    expect(stop).toHaveBeenCalledOnce();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('calls stop when status is submitted (treated as streaming)', () => {
    const sendMessage = vi.fn();
    const stop = vi.fn();
    render(<TyphoonComposer sendMessage={sendMessage} stop={stop} status="submitted" />);

    const textarea = screen.getByPlaceholderText('Ask a question...');
    fireEvent.change(textarea, { target: { value: 'Abort' } });
    fireEvent.submit(getForm());

    expect(stop).toHaveBeenCalledOnce();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('handles Enter key as submit (via PromptInputTextarea)', () => {
    const sendMessage = vi.fn();
    render(<TyphoonComposer sendMessage={sendMessage} status="ready" />);

    const textarea = screen.getByPlaceholderText('Ask a question...');
    fireEvent.change(textarea, { target: { value: 'Enter test' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(sendMessage).toHaveBeenCalledWith({ text: 'Enter test' });
  });

  it('does not submit on Shift+Enter', () => {
    const sendMessage = vi.fn();
    render(<TyphoonComposer sendMessage={sendMessage} status="ready" />);

    const textarea = screen.getByPlaceholderText('Ask a question...');
    fireEvent.change(textarea, { target: { value: 'Multi-line' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
