import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { FieldGroupBadgePopover } from './field-group-badge-popover';

describe('FieldGroupBadgePopover', () => {
  it('renders badge with group name', () => {
    render(
      <FieldGroupBadgePopover group={{ name: 'Region', description: null, fields: { country: { type: 'string' } } }} />,
    );
    expect(screen.getByText('Region')).toBeTruthy();
  });

  it('renders with empty fields', () => {
    render(<FieldGroupBadgePopover group={{ name: 'Empty Group', description: 'test', fields: {} }} />);
    expect(screen.getByText('Empty Group')).toBeTruthy();
  });

  it('shows popover content with field details on hover', async () => {
    const user = userEvent.setup();
    render(
      <FieldGroupBadgePopover
        group={{
          name: 'Location',
          description: 'Geographic info',
          fields: {
            country: { type: 'string', required: true },
            state: { type: 'string' },
          },
        }}
      />,
    );
    const trigger = screen.getByText('Location');
    await user.hover(trigger);
    await waitFor(() => {
      expect(screen.getByText('Geographic info')).toBeTruthy();
      expect(screen.getByText('2 fields')).toBeTruthy();
      expect(screen.getByText('country*')).toBeTruthy();
      expect(screen.getByText('state')).toBeTruthy();
    });
  });

  it('shows singular field count for single field', async () => {
    const user = userEvent.setup();
    render(
      <FieldGroupBadgePopover
        group={{
          name: 'Single',
          description: null,
          fields: { name: { type: 'string' } },
        }}
      />,
    );
    await user.hover(screen.getByText('Single'));
    await waitFor(() => {
      expect(screen.getByText('1 field')).toBeTruthy();
    });
  });

  it('shows 0 fields and no badges for empty group in popover', async () => {
    const user = userEvent.setup();
    render(<FieldGroupBadgePopover group={{ name: 'Empty', description: null, fields: {} }} />);
    await user.hover(screen.getByText('Empty'));
    await waitFor(() => {
      expect(screen.getByText('0 fields')).toBeTruthy();
    });
  });

  it('shows field type annotations in popover badges', async () => {
    const user = userEvent.setup();
    render(
      <FieldGroupBadgePopover
        group={{
          name: 'Typed',
          description: null,
          fields: {
            age: { type: 'number' },
            active: { type: 'boolean', required: true },
          },
        }}
      />,
    );
    await user.hover(screen.getByText('Typed'));
    await waitFor(() => {
      expect(screen.getByText('number')).toBeTruthy();
      expect(screen.getByText('boolean')).toBeTruthy();
      expect(screen.getByText('active*')).toBeTruthy();
    });
  });
});
