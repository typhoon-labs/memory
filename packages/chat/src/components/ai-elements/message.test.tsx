import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MessageResponse } from './message';

afterEach(cleanup);

describe('MessageResponse', () => {
  it('renders children in a prose container', () => {
    render(<MessageResponse>Hello assistant</MessageResponse>);
    expect(screen.getByText('Hello assistant')).toBeTruthy();
  });

  it('applies custom className', () => {
    const { container } = render(<MessageResponse className="custom-class">Content</MessageResponse>);
    expect(container.firstChild?.textContent).toBe('Content');
  });
});
