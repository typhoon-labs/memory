import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TokenBarChart, formatTokens } from './token-bar-chart';

describe('TokenBarChart', () => {
  it('renders without crashing with data', () => {
    const data = [
      { date: '2025-01-01', promptTokens: 5000, completionTokens: 3000, callCount: 20 },
      { date: '2025-01-02', promptTokens: 6000, completionTokens: 4000, callCount: 25 },
    ];
    const { container } = render(<TokenBarChart data={data} range="7d" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('shows empty state when no data', () => {
    render(<TokenBarChart data={[]} range="7d" />);
    expect(screen.getByText('No token usage data yet')).toBeTruthy();
  });

  it('renders bar chart with large token values (millions formatting)', () => {
    const data = [
      { date: '2025-01-01', promptTokens: 1_200_000, completionTokens: 800_000, callCount: 100 },
      { date: '2025-01-02', promptTokens: 2_500_000, completionTokens: 1_100_000, callCount: 150 },
    ];
    const { container } = render(<TokenBarChart data={data} range="30d" />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('renders with different range prop', () => {
    const data = [
      { date: '2025-01-01T00:00:00Z', promptTokens: 500, completionTokens: 300, callCount: 5 },
      { date: '2025-01-01T01:00:00Z', promptTokens: 700, completionTokens: 400, callCount: 8 },
    ];
    const { container } = render(<TokenBarChart data={data} range="1d" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders with thousands-range token values (k formatting)', () => {
    const data = [
      { date: '2025-01-01', promptTokens: 5_000, completionTokens: 3_000, callCount: 20 },
      { date: '2025-01-02', promptTokens: 15_000, completionTokens: 8_000, callCount: 50 },
    ];
    const { container } = render(<TokenBarChart data={data} range="7d" />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders with 30d time range', () => {
    const data = [
      { date: '2025-01-01', promptTokens: 10_000, completionTokens: 5_000, callCount: 30 },
      { date: '2025-01-15', promptTokens: 12_000, completionTokens: 6_000, callCount: 35 },
      { date: '2025-01-30', promptTokens: 8_000, completionTokens: 4_000, callCount: 25 },
    ];
    const { container } = render(<TokenBarChart data={data} range="30d" />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('renders with large token values', () => {
    const data = [
      { date: '2025-01-01', promptTokens: 1_500_000, completionTokens: 900_000, callCount: 200 },
      { date: '2025-01-02', promptTokens: 3_000_000, completionTokens: 1_800_000, callCount: 350 },
    ];
    const { container } = render(<TokenBarChart data={data} range="7d" />);
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });
});

describe('formatTokens', () => {
  it('returns raw number as string for values under 1000', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(500)).toBe('500');
    expect(formatTokens(999)).toBe('999');
  });

  it('returns "k" format for values >= 1000 and < 1000000', () => {
    expect(formatTokens(1000)).toBe('1k');
    expect(formatTokens(5000)).toBe('5k');
    expect(formatTokens(15_500)).toBe('16k');
    expect(formatTokens(999_999)).toBe('1000k');
  });

  it('returns "M" format for values >= 1000000', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M');
    expect(formatTokens(2_500_000)).toBe('2.5M');
    expect(formatTokens(10_000_000)).toBe('10.0M');
  });

  it('rounds "k" values to nearest integer', () => {
    expect(formatTokens(1499)).toBe('1k');
    expect(formatTokens(1500)).toBe('2k');
  });

  it('shows one decimal for "M" values', () => {
    expect(formatTokens(1_234_567)).toBe('1.2M');
    expect(formatTokens(9_999_999)).toBe('10.0M');
  });
});
