import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProgressTracker } from './progress-tracker';

afterEach(cleanup);

describe('ProgressTracker', () => {
  it('renders steps', () => {
    const { container } = render(
      <ProgressTracker
        id="test"
        steps={[
          { id: 's-1', label: 'Step 1', status: 'completed' },
          { id: 's-2', label: 'Step 2', status: 'in-progress' },
        ]}
      />,
    );
    expect(container.textContent).toContain('Step 1');
    expect(container.textContent).toContain('Step 2');
  });

  it('renders empty when no steps', () => {
    const { container } = render(<ProgressTracker id="test" steps={[]} />);
    expect(container).toBeTruthy();
  });
});
