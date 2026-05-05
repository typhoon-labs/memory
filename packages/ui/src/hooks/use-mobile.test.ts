import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useIsMobile } from './use-mobile';

describe('useIsMobile', () => {
  it('returns a boolean', () => {
    const { result } = renderHook(() => useIsMobile());
    expect(typeof result.current).toBe('boolean');
  });
});
