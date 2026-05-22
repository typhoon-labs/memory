// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { detailTitle, usePageTitle } from './use-page-title';

describe('usePageTitle', () => {
  it('sets document.title with Typhoon Desk suffix', () => {
    renderHook(() => usePageTitle('Dashboard'));
    expect(document.title).toBe('Dashboard - Typhoon Desk');
  });

  it('includes dynamic content in title', () => {
    renderHook(() => usePageTitle('Search: refund'));
    expect(document.title).toBe('Search: refund - Typhoon Desk');
  });
});

describe('detailTitle', () => {
  it('formats section and name with colon', () => {
    expect(detailTitle('Chat', 'Refund request')).toBe('Chat: Refund request');
  });

  it('returns just section when name is undefined', () => {
    expect(detailTitle('Chat', undefined)).toBe('Chat');
  });
});
