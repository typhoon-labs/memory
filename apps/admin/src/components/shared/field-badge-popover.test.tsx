import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { FieldBadgePopover } from './field-badge-popover';

describe('FieldBadgePopover', () => {
  it('renders badge with field name', () => {
    render(<FieldBadgePopover name="country" field={{ type: 'string' }} />);
    expect(screen.getByText('country')).toBeTruthy();
  });

  it('shows asterisk for required fields', () => {
    render(<FieldBadgePopover name="region" field={{ type: 'string', required: true }} />);
    expect(screen.getByText('region*')).toBeTruthy();
  });

  it('does not show asterisk for optional fields', () => {
    render(<FieldBadgePopover name="region" field={{ type: 'string', required: false }} />);
    expect(screen.getByText('region')).toBeTruthy();
  });

  it('shows popover content on hover', async () => {
    const user = userEvent.setup();
    render(
      <FieldBadgePopover
        name="region"
        field={{
          type: 'string',
          required: true,
          description: 'Geographic region',
          allowedValues: ['US', 'EU'],
          default: 'US',
        }}
      />,
    );
    const trigger = screen.getByText('region*');
    await user.hover(trigger);
    await waitFor(() => {
      expect(screen.getByText('Description')).toBeTruthy();
      expect(screen.getByText('Geographic region')).toBeTruthy();
      expect(screen.getByText('Required')).toBeTruthy();
      expect(screen.getByText('Yes')).toBeTruthy();
      expect(screen.getByText('Allowed Values')).toBeTruthy();
      expect(screen.getByText('US, EU')).toBeTruthy();
      expect(screen.getByText('Default')).toBeTruthy();
    });
  });

  it('displays field type badge in popover', async () => {
    const user = userEvent.setup();
    render(<FieldBadgePopover name="count" field={{ type: 'number', required: false }} />);
    await user.hover(screen.getByText('count'));
    await waitFor(() => {
      expect(screen.getByText('number')).toBeTruthy();
      expect(screen.getByText('Required')).toBeTruthy();
      // "No" appears for both Required and Searchable
      expect(screen.getAllByText('No').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('omits description and allowed values when not provided', async () => {
    const user = userEvent.setup();
    render(<FieldBadgePopover name="flag" field={{ type: 'boolean' }} />);
    await user.hover(screen.getByText('flag'));
    await waitFor(() => {
      expect(screen.getByText('boolean')).toBeTruthy();
    });
    expect(screen.queryByText('Description')).toBeNull();
    expect(screen.queryByText('Allowed Values')).toBeNull();
    expect(screen.queryByText('Default')).toBeNull();
  });

  it('shows searchable yes with moderate weight by default', async () => {
    const user = userEvent.setup();
    render(<FieldBadgePopover name="region" field={{ type: 'string', searchable: true }} />);
    await user.hover(screen.getByText('region'));
    await waitFor(() => {
      expect(screen.getByText('Searchable')).toBeTruthy();
      expect(screen.getByText('Yes, moderate weight')).toBeTruthy();
    });
  });

  it('shows explicit search priority', async () => {
    const user = userEvent.setup();
    render(
      <FieldBadgePopover name="region" field={{ type: 'string', searchable: true, searchPriority: 'critical' }} />,
    );
    await user.hover(screen.getByText('region'));
    await waitFor(() => {
      expect(screen.getByText('Yes, critical weight')).toBeTruthy();
    });
  });

  it('shows searchable no when field is not searchable', async () => {
    const user = userEvent.setup();
    render(<FieldBadgePopover name="region" field={{ type: 'string', required: true }} />);
    await user.hover(screen.getByText('region*'));
    await waitFor(() => {
      expect(screen.getByText('Searchable')).toBeTruthy();
      // Required shows "Yes", Searchable shows "No"
      expect(screen.getByText('No')).toBeTruthy();
    });
  });

  it('accepts custom children as trigger (renders children instead of badge)', () => {
    render(
      <FieldBadgePopover name="region" field={{ type: 'string' }}>
        <span data-testid="custom-trigger">Custom Trigger</span>
      </FieldBadgePopover>,
    );
    expect(screen.getByTestId('custom-trigger')).toBeTruthy();
    expect(screen.getByText('Custom Trigger')).toBeTruthy();
    // The default badge text should NOT be rendered
    expect(screen.queryByText('region')).toBeNull();
  });
});
