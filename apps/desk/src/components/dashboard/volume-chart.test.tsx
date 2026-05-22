import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { VolumeChart } from './volume-chart';

describe('VolumeChart', () => {
  it('renders empty state when data is empty', () => {
    render(<VolumeChart data={[]} />);
    expect(screen.getByText('No conversation data yet')).toBeTruthy();
  });

  it('renders chart with data', () => {
    const data = [
      { day: 'Mon', count: 5 },
      { day: 'Tue', count: 10 },
      { day: 'Wed', count: 3 },
    ];
    const { container } = render(<VolumeChart data={data} />);
    // ResponsiveContainer renders a recharts container
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });
});
