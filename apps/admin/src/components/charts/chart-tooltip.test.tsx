import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createChartTooltip } from './chart-tooltip';

// TooltipContentProps has required fields (coordinate, accessibilityLayer, etc.)
// that the component ignores — cast partial props via `as never` in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: TooltipContentProps requires fields the component ignores
const props = (p: Record<string, unknown>) => p as any;

describe('createChartTooltip', () => {
  it('renders tooltip content when active with payload', () => {
    const TooltipContent = createChartTooltip();
    render(
      <TooltipContent
        {...props({ active: true, payload: [{ name: 'p50', value: 42, color: '#f00' }], label: '2025-01-01' })}
      />,
    );
    expect(screen.getByText('2025-01-01')).toBeTruthy();
    expect(screen.getByText('p50')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('returns null when not active', () => {
    const TooltipContent = createChartTooltip();
    const { container } = render(
      <TooltipContent
        {...props({ active: false, payload: [{ name: 'p50', value: 42, color: '#f00' }], label: '2025-01-01' })}
      />,
    );
    expect(container.firstChild).toBeFalsy();
  });

  it('returns null when payload is empty', () => {
    const TooltipContent = createChartTooltip();
    const { container } = render(<TooltipContent {...props({ active: true, payload: [], label: '2025-01-01' })} />);
    expect(container.firstChild).toBeFalsy();
  });

  it('applies custom labelFormatter', () => {
    const TooltipContent = createChartTooltip({ labelFormatter: (label) => `Date: ${label}` });
    render(
      <TooltipContent
        {...props({ active: true, payload: [{ name: 'score', value: 0.95, color: '#00f' }], label: '2025-01-01' })}
      />,
    );
    expect(screen.getByText('Date: 2025-01-01')).toBeTruthy();
  });

  it('applies custom valueFormatter', () => {
    const TooltipContent = createChartTooltip({ valueFormatter: (v) => `${v}ms` });
    render(
      <TooltipContent
        {...props({ active: true, payload: [{ name: 'latency', value: 150, color: '#00f' }], label: '2025-01-01' })}
      />,
    );
    expect(screen.getByText('150ms')).toBeTruthy();
  });
});
