import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./volume-chart', () => ({
  VolumeChart: ({ data }: { data: Array<{ day: string; count: number }> }) => (
    <div data-testid="volume-chart">
      {data.map((d) => (
        <span key={d.day}>
          {d.day}:{d.count}
        </span>
      ))}
    </div>
  ),
}));

import { render } from '@testing-library/react';

import { ConversationVolume } from './conversation-volume';

describe('ConversationVolume', () => {
  it('renders VolumeChart with 7-day data', () => {
    render(<ConversationVolume threads={[]} />);
    const chart = screen.getByTestId('volume-chart');
    expect(chart).toBeTruthy();
    // Should always produce 7 days of data regardless of thread count
    const spans = chart.querySelectorAll('span');
    expect(spans).toHaveLength(7);
  });

  it('counts threads per day correctly', () => {
    const now = new Date();
    const todayStr = now.toLocaleDateString(undefined, { weekday: 'short' });
    const threads = [
      { id: '1', title: 'A', resourceId: 'r1', createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: '2', title: 'B', resourceId: 'r2', createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ];
    render(<ConversationVolume threads={threads} />);
    const chart = screen.getByTestId('volume-chart');
    // The current day should show count:2
    expect(chart.textContent).toContain(`${todayStr}:2`);
  });

  it('shows zero counts for days without threads', () => {
    render(<ConversationVolume threads={[]} />);
    const chart = screen.getByTestId('volume-chart');
    const spans = chart.querySelectorAll('span');
    // All days should have count:0
    for (const span of spans) {
      expect(span.textContent).toMatch(/:0$/);
    }
  });
});
