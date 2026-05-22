import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sparkline } from './sparkline';

describe('Sparkline', () => {
  it('renders without crashing with data', () => {
    const { container } = render(<Sparkline data={[{ value: 1 }, { value: 2 }, { value: 3 }]} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('returns null for empty data', () => {
    const { container } = render(<Sparkline data={[]} />);
    expect(container.firstChild).toBeFalsy();
  });
});
