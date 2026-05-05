import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StatCard } from './StatCard';

afterEach(cleanup);

describe('StatCard', () => {
  it('renders value and label', () => {
    render(<StatCard value={42} label="Users" />);
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('Users')).toBeTruthy();
  });

  it('renders description when provided', () => {
    render(<StatCard value="100" label="Requests" description="Last 24h" />);
    expect(screen.getByText('Last 24h')).toBeTruthy();
  });

  it('renders trend indicator', () => {
    const { container } = render(<StatCard value={50} label="Score" trend="up" trendValue="+12%" />);
    expect(container.textContent).toContain('+12%');
  });
});
