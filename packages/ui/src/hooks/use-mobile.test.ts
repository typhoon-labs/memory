import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useIsMobile } from './use-mobile';

afterEach(() => vi.restoreAllMocks());

describe('useIsMobile', () => {
  it('returns a boolean', () => {
    const { result } = renderHook(() => useIsMobile());
    expect(typeof result.current).toBe('boolean');
  });

  it('returns false when window is wider than breakpoint', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns true when window is narrower than breakpoint', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('responds to matchMedia change event by updating the value', () => {
    // Capture the change listener that the hook adds
    let changeHandler: (() => void) | undefined;
    const originalMatchMedia = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
      const mql = originalMatchMedia(query);
      return {
        matches: mql.matches,
        media: mql.media,
        onchange: null,
        addEventListener: (event: string, handler: EventListenerOrEventListenerObject) => {
          if (event === 'change') changeHandler = handler as () => void;
        },
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      } as MediaQueryList;
    });

    // Start at desktop width
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Simulate resize to mobile width, then fire the change handler
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(500);
    act(() => {
      changeHandler?.();
    });
    expect(result.current).toBe(true);
  });
});
