import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

afterEach(cleanup);

describe('StatusBadge', () => {
  it('renders without crashing', () => {
    const { container } = render(<StatusBadge variant="success">Active</StatusBadge>);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders different variants', () => {
    for (const variant of ['success', 'error', 'pending', 'warning', 'info'] as const) {
      const { container } = render(<StatusBadge variant={variant}>{variant}</StatusBadge>);
      expect(container.firstChild).toBeTruthy();
      cleanup();
    }
  });
});
