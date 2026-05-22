import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useUrlSearchInput } from './use-url-search-input';

describe('useUrlSearchInput', () => {
  it('initializes inputValue from urlValue', () => {
    const { result } = renderHook(() => useUrlSearchInput({ urlValue: 'hello', onCommit: vi.fn() }));
    expect(result.current.inputValue).toBe('hello');
  });

  it('initializes to empty string when urlValue is undefined', () => {
    const { result } = renderHook(() => useUrlSearchInput({ urlValue: undefined, onCommit: vi.fn() }));
    expect(result.current.inputValue).toBe('');
  });

  it('calls onCommit with trimmed value on Enter', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useUrlSearchInput({ urlValue: undefined, onCommit }));

    act(() => result.current.setInputValue('  test query  '));
    act(() =>
      result.current.handleKeyDown({
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent),
    );

    expect(onCommit).toHaveBeenCalledWith('test query');
  });

  it('calls onCommit with undefined when input is empty on blur', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useUrlSearchInput({ urlValue: 'old', onCommit }));

    act(() => result.current.setInputValue(''));
    act(() => result.current.handleBlur());

    expect(onCommit).toHaveBeenCalledWith(undefined);
  });

  it('does not call onCommit if value unchanged', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useUrlSearchInput({ urlValue: 'same', onCommit }));

    act(() => result.current.handleBlur());

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('re-syncs inputValue when urlValue changes externally', () => {
    const onCommit = vi.fn();
    const { result, rerender } = renderHook(({ urlValue }) => useUrlSearchInput({ urlValue, onCommit }), {
      initialProps: { urlValue: 'initial' as string | undefined },
    });

    expect(result.current.inputValue).toBe('initial');

    rerender({ urlValue: 'updated' });
    expect(result.current.inputValue).toBe('updated');
  });

  it('does not commit on non-Enter keys', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useUrlSearchInput({ urlValue: undefined, onCommit }));

    act(() => result.current.setInputValue('test'));
    act(() =>
      result.current.handleKeyDown({
        key: 'a',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent),
    );

    expect(onCommit).not.toHaveBeenCalled();
  });
});
