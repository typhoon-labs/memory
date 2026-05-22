import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScoreTrendChart } from './score-trend-chart';

describe('ScoreTrendChart', () => {
  it('renders without crashing with data', () => {
    const data = [
      { date: '2025-01-01', scorerId: 'faithfulness', avgScore: 0.85, count: 10, failCount: 1 },
      { date: '2025-01-02', scorerId: 'faithfulness', avgScore: 0.9, count: 12, failCount: 0 },
    ];
    const { container } = render(<ScoreTrendChart data={data} range="7d" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('shows empty state when no data', () => {
    render(<ScoreTrendChart data={[]} range="7d" />);
    expect(screen.getByText('No score data yet')).toBeTruthy();
  });

  it('renders with multiple scorer series (legend items)', () => {
    const data = [
      { date: '2025-01-01', scorerId: 'faithfulness', avgScore: 0.85, count: 10, failCount: 1 },
      { date: '2025-01-01', scorerId: 'hallucination', avgScore: 0.72, count: 10, failCount: 2 },
      { date: '2025-01-02', scorerId: 'faithfulness', avgScore: 0.9, count: 12, failCount: 0 },
      { date: '2025-01-02', scorerId: 'hallucination', avgScore: 0.78, count: 12, failCount: 1 },
    ];
    const { container } = render(<ScoreTrendChart data={data} range="7d" />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('renders with buckets for pre-populated dates', () => {
    const data = [{ date: '2025-01-02', scorerId: 'faithfulness', avgScore: 0.85, count: 10, failCount: 0 }];
    const buckets = ['2025-01-01', '2025-01-02', '2025-01-03'];
    const { container } = render(<ScoreTrendChart data={data} range="7d" buckets={buckets} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders with custom scorer IDs (falls back to raw ID label)', () => {
    const data = [
      { date: '2025-01-01', scorerId: 'my-custom-scorer', avgScore: 0.65, count: 5, failCount: 0 },
      { date: '2025-01-02', scorerId: 'my-custom-scorer', avgScore: 0.7, count: 8, failCount: 1 },
    ];
    const { container } = render(<ScoreTrendChart data={data} range="30d" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders empty chart with buckets but no data points', () => {
    const buckets = ['2025-01-01', '2025-01-02'];
    const { container } = render(<ScoreTrendChart data={[]} range="7d" buckets={buckets} />);
    // Buckets create rows, so chart should render (not empty state)
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });
});
