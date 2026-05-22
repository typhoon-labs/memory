import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LatencyChart, formatMs } from './latency-chart';

describe('LatencyChart', () => {
  it('renders without crashing with data', () => {
    const data = [
      { date: '2025-01-01', p50: 120, p95: 350, p99: 500, count: 50 },
      { date: '2025-01-02', p50: 115, p95: 340, p99: 480, count: 55 },
    ];
    const { container } = render(<LatencyChart data={data} range="7d" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('shows empty state when no data', () => {
    render(<LatencyChart data={[]} range="7d" />);
    expect(screen.getByText('No latency data yet')).toBeTruthy();
  });

  it('renders with actual p50/p95/p99 data points across multiple dates', () => {
    const data = [
      { date: '2025-01-01', p50: 80, p95: 250, p99: 900, count: 30 },
      { date: '2025-01-02', p50: 95, p95: 300, p99: 1200, count: 40 },
      { date: '2025-01-03', p50: 110, p95: 400, p99: 1500, count: 25 },
    ];
    const { container } = render(<LatencyChart data={data} range="7d" />);
    // Should render a Recharts ResponsiveContainer with Line elements
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('renders with different range values', () => {
    const data = [{ date: '2025-01-01', p50: 50, p95: 200, p99: 400, count: 10 }];
    const { container: c1 } = render(<LatencyChart data={data} range="1d" />);
    expect(c1.firstChild).toBeTruthy();
  });

  it('handles null percentile values', () => {
    const data = [
      { date: '2025-01-01', p50: null, p95: null, p99: null, count: 0 },
      { date: '2025-01-02', p50: 100, p95: 200, p99: 300, count: 5 },
    ];
    const { container } = render(<LatencyChart data={data} range="30d" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders with values above 1000ms (seconds formatting)', () => {
    const data = [{ date: '2025-01-01', p50: 1500, p95: 3000, p99: 5000, count: 10 }];
    const { container } = render(<LatencyChart data={data} range="7d" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders with 30d time range', () => {
    const data = [
      { date: '2025-01-01', p50: 100, p95: 250, p99: 400, count: 20 },
      { date: '2025-01-15', p50: 110, p95: 260, p99: 420, count: 25 },
      { date: '2025-01-30', p50: 90, p95: 230, p99: 380, count: 30 },
    ];
    const { container } = render(<LatencyChart data={data} range="30d" />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('renders with large latency values', () => {
    const data = [
      { date: '2025-01-01', p50: 1500, p95: 5000, p99: 12000, count: 10 },
      { date: '2025-01-02', p50: 2200, p95: 8000, p99: 15000, count: 15 },
    ];
    const { container } = render(<LatencyChart data={data} range="7d" />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });
});

describe('formatMs', () => {
  it('returns "0ms" for zero', () => {
    expect(formatMs(0)).toBe('0ms');
  });

  it('returns milliseconds for values under 1000', () => {
    expect(formatMs(500)).toBe('500ms');
    expect(formatMs(999)).toBe('999ms');
  });

  it('rounds sub-1000 values to integers', () => {
    expect(formatMs(123.7)).toBe('124ms');
    expect(formatMs(0.4)).toBe('0ms');
  });

  it('returns seconds with one decimal for values >= 1000', () => {
    expect(formatMs(1000)).toBe('1.0s');
    expect(formatMs(1500)).toBe('1.5s');
    expect(formatMs(5000)).toBe('5.0s');
  });

  it('handles large values in seconds', () => {
    expect(formatMs(12345)).toBe('12.3s');
    expect(formatMs(1000000)).toBe('1000.0s');
  });
});
