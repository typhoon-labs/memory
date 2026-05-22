import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LoadingSpinner } from './LoadingSpinner';

afterEach(cleanup);

describe('LoadingSpinner', () => {
  it('renders without crashing', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.firstChild).toBeTruthy();
  });
});
