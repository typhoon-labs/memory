// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { detailTitle, usePageTitle } from './use-page-title';

describe('usePageTitle', () => {
  it('sets document.title with Typhoon Admin suffix', () => {
    renderHook(() => usePageTitle('Dashboard'));
    expect(document.title).toBe('Dashboard - Typhoon Admin');
  });

  it('includes dynamic content in title', () => {
    renderHook(() => usePageTitle('Traces: a1b2c3d4'));
    expect(document.title).toBe('Traces: a1b2c3d4 - Typhoon Admin');
  });
});

describe('detailTitle', () => {
  it('formats section and name with colon', () => {
    expect(detailTitle('Scorers', 'Faithfulness')).toBe('Scorers: Faithfulness');
  });

  it('returns just section when name is undefined', () => {
    expect(detailTitle('Scorers', undefined)).toBe('Scorers');
  });
});
