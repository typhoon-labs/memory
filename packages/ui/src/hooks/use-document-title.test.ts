import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDocumentTitle } from './use-document-title';

describe('useDocumentTitle', () => {
  it('sets document.title with title and suffix', () => {
    renderHook(() => useDocumentTitle('Dashboard', 'Typhoon Admin'));
    expect(document.title).toBe('Dashboard - Typhoon Admin');
  });

  it('sets document.title to just the suffix when title is empty string', () => {
    renderHook(() => useDocumentTitle('', 'Typhoon Admin'));
    expect(document.title).toBe('Typhoon Admin');
  });

  it('does not update document.title when title is undefined', () => {
    document.title = 'Previous Title';
    renderHook(() => useDocumentTitle(undefined, 'Typhoon Admin'));
    expect(document.title).toBe('Previous Title');
  });

  it('updates document.title when title changes', () => {
    const { rerender } = renderHook(({ title }) => useDocumentTitle(title, 'Typhoon Desk'), {
      initialProps: { title: 'Search' as string | undefined },
    });
    expect(document.title).toBe('Search - Typhoon Desk');

    rerender({ title: 'Search: refund' });
    expect(document.title).toBe('Search: refund - Typhoon Desk');
  });

  it('updates when title transitions from undefined to string', () => {
    document.title = 'Loading';
    const { rerender } = renderHook(({ title }) => useDocumentTitle(title, 'Typhoon Admin'), {
      initialProps: { title: undefined as string | undefined },
    });
    expect(document.title).toBe('Loading');

    rerender({ title: 'My Dataset' });
    expect(document.title).toBe('My Dataset - Typhoon Admin');
  });
});
