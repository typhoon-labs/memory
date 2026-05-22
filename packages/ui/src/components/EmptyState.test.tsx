import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EmptyState } from './EmptyState';

afterEach(cleanup);

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No items" description="Nothing to show" />);
    expect(screen.getByText('No items')).toBeTruthy();
    expect(screen.getByText('Nothing to show')).toBeTruthy();
  });
});
