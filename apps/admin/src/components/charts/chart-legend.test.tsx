import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChartLegend } from './chart-legend';

describe('ChartLegend', () => {
  it('renders legend items', () => {
    const payload = [
      { value: 'Faithfulness', color: '#f00', type: 'line' as const },
      { value: 'Relevancy', color: '#0f0', type: 'line' as const },
    ];
    render(<ChartLegend payload={payload} />);
    expect(screen.getByText('Faithfulness')).toBeTruthy();
    expect(screen.getByText('Relevancy')).toBeTruthy();
  });

  it('returns null for empty payload', () => {
    const { container } = render(<ChartLegend payload={[]} />);
    expect(container.firstChild).toBeFalsy();
  });

  it('returns null for undefined payload', () => {
    const { container } = render(<ChartLegend />);
    expect(container.firstChild).toBeFalsy();
  });
});
