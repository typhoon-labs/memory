import { useCallback, useEffect, useState } from 'react';

/**
 * Hook for text inputs backed by a URL search parameter.
 *
 * Keeps a local `inputValue` for responsive typing while committing
 * the trimmed value to the URL on Enter key or blur.
 * Re-syncs the local value when the URL changes externally (e.g. browser back/forward).
 */
export function useUrlSearchInput(opts: {
  /** Current value from the URL search param (undefined = not set). */
  urlValue: string | undefined;
  /** Called to persist the value to the URL. Pass undefined to clear. */
  onCommit: (value: string | undefined) => void;
}): {
  inputValue: string;
  setInputValue: (v: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleBlur: () => void;
} {
  const { urlValue, onCommit } = opts;
  const [inputValue, setInputValue] = useState(urlValue ?? '');

  // Re-sync when URL value changes externally
  useEffect(() => {
    setInputValue(urlValue ?? '');
  }, [urlValue]);

  const commit = useCallback(() => {
    const trimmed = inputValue.trim();
    const next = trimmed || undefined;
    if (next !== (urlValue ?? undefined)) {
      onCommit(next);
    }
  }, [inputValue, urlValue, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
    },
    [commit],
  );

  const handleBlur = useCallback(() => {
    commit();
  }, [commit]);

  return { inputValue, setInputValue, handleKeyDown, handleBlur };
}
