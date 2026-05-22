import { screen, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WidgetCard } from './widget-card';

describe('WidgetCard', () => {
  it('renders the title', () => {
    render(<WidgetCard title="My Widget">content</WidgetCard>);
    expect(screen.getByText('My Widget')).toBeTruthy();
  });

  it('renders children', () => {
    render(
      <WidgetCard title="Test">
        <span data-testid="child">Hello</span>
      </WidgetCard>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('renders optional action slot', () => {
    render(
      <WidgetCard title="Actions" action={<button type="button">Click</button>}>
        body
      </WidgetCard>,
    );
    expect(screen.getByText('Click')).toBeTruthy();
  });

  it('does not render action when not provided', () => {
    render(<WidgetCard title="No Action">content</WidgetCard>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
