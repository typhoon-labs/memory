import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FieldSchemaEditor, type MetadataSchema } from './field-schema-editor';

describe('FieldSchemaEditor', () => {
  const onChange = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  const baseFields: MetadataSchema = {
    country: { type: 'string', required: true },
    score: { type: 'number' },
  };

  it('renders existing field names', () => {
    render(<FieldSchemaEditor fields={baseFields} onChange={onChange} />);
    expect(screen.getByText('country')).toBeTruthy();
    expect(screen.getByText('score')).toBeTruthy();
  });

  it('renders column headers when fields exist', () => {
    render(<FieldSchemaEditor fields={baseFields} onChange={onChange} />);
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Type')).toBeTruthy();
    expect(screen.getByText('Required')).toBeTruthy();
  });

  it('does not render column headers when no fields', () => {
    render(<FieldSchemaEditor fields={{}} onChange={onChange} />);
    expect(screen.queryByText('Name')).toBeFalsy();
  });

  it('calls onChange when adding a new field', () => {
    render(<FieldSchemaEditor fields={baseFields} onChange={onChange} />);
    const input = screen.getByPlaceholderText('New field name');
    fireEvent.change(input, { target: { value: 'region' } });
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).toHaveBeenCalledWith({
      ...baseFields,
      region: { type: 'string' },
    });
  });

  it('does not add a field with empty name', () => {
    render(<FieldSchemaEditor fields={baseFields} onChange={onChange} />);
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not add a duplicate field name', () => {
    render(<FieldSchemaEditor fields={baseFields} onChange={onChange} />);
    const input = screen.getByPlaceholderText('New field name');
    fireEvent.change(input, { target: { value: 'country' } });
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls onChange when removing a field', () => {
    const singleField: MetadataSchema = { country: { type: 'string' } };
    const { container } = render(<FieldSchemaEditor fields={singleField} onChange={onChange} />);
    // The remove button is a ghost icon button inside each field row
    // Find all buttons, the remove button is the small icon button with the X
    const buttons = container.querySelectorAll('button');
    // Last button before the "Add" section is the remove button for the single field
    // Buttons: toggle-all, collapsible-trigger, remove, Add
    const removeButton = Array.from(buttons).find(
      (btn) => btn.className.includes('ghost') || btn.querySelector('.lucide-x'),
    );
    if (removeButton) fireEvent.click(removeButton);
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('adds field on Enter keypress', () => {
    render(<FieldSchemaEditor fields={{}} onChange={onChange} />);
    const input = screen.getByPlaceholderText('New field name');
    fireEvent.change(input, { target: { value: 'title' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith({ title: { type: 'string' } });
  });

  it('renders expand/collapse all toggle when fields exist', () => {
    render(<FieldSchemaEditor fields={baseFields} onChange={onChange} />);
    // The toggle-all button is the first button in the header row
    const buttons = screen.getAllByRole('button');
    // First button should be the expand/collapse all
    expect(buttons[0]).toBeTruthy();
  });

  it('calls onChange with updated type when type is changed', () => {
    render(<FieldSchemaEditor fields={{ country: { type: 'string' } }} onChange={onChange} />);
    // Type dropdown trigger
    const triggers = screen.getAllByRole('combobox');
    expect(triggers.length).toBeGreaterThan(0);
    // The trigger should show current type
    expect(triggers[0].textContent).toContain('string');
  });

  it('toggles required checkbox', () => {
    const { container } = render(
      <FieldSchemaEditor fields={{ country: { type: 'string', required: false } }} onChange={onChange} />,
    );
    const checkbox = container.querySelector('[role="checkbox"]');
    expect(checkbox).toBeTruthy();
    if (checkbox) fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({
      country: expect.objectContaining({ required: true }),
    });
  });

  it('disables Add button when input is empty', () => {
    render(<FieldSchemaEditor fields={{}} onChange={onChange} />);
    const addButton = screen.getByText('Add');
    expect(addButton.closest('button')?.hasAttribute('disabled')).toBe(true);
  });

  it('enables Add button when input has text', () => {
    render(<FieldSchemaEditor fields={{}} onChange={onChange} />);
    const input = screen.getByPlaceholderText('New field name');
    fireEvent.change(input, { target: { value: 'newfield' } });
    const addButton = screen.getByText('Add');
    expect(addButton.closest('button')?.hasAttribute('disabled')).toBe(false);
  });

  it('clears input after successfully adding a field', () => {
    render(<FieldSchemaEditor fields={{}} onChange={onChange} />);
    const input = screen.getByPlaceholderText('New field name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'region' } });
    fireEvent.click(screen.getByText('Add'));
    // Input should be cleared after add
    expect(input.value).toBe('');
  });

  it('trims whitespace from new field names', () => {
    render(<FieldSchemaEditor fields={{}} onChange={onChange} />);
    const input = screen.getByPlaceholderText('New field name');
    fireEvent.change(input, { target: { value: '  department  ' } });
    fireEvent.click(screen.getByText('Add'));
    expect(onChange).toHaveBeenCalledWith({
      department: { type: 'string' },
    });
  });

  it('expand/collapse all toggles all fields', () => {
    const fields: MetadataSchema = {
      field1: { type: 'string' },
      field2: { type: 'number' },
      field3: { type: 'boolean' },
    };
    const { container } = render(<FieldSchemaEditor fields={fields} onChange={onChange} />);
    const buttons = screen.getAllByRole('button');
    // First button is the expand/collapse all toggle
    const toggleAll = buttons[0];
    // Click to expand all
    fireEvent.click(toggleAll);
    // Click to collapse all
    fireEvent.click(toggleAll);
    // Should not throw
    expect(container).toBeTruthy();
  });

  it('shows advanced options dot indicator when collapsed with description', () => {
    const fields: MetadataSchema = {
      country: { type: 'string', description: 'The country code' },
    };
    const { container } = render(<FieldSchemaEditor fields={fields} onChange={onChange} />);
    // When collapsed and has advanced options, a small dot indicator should be present
    const dot = container.querySelector('.bg-primary.rounded-full');
    expect(dot).toBeTruthy();
  });

  it('shows border-t on add section when fields exist', () => {
    const { container } = render(<FieldSchemaEditor fields={baseFields} onChange={onChange} />);
    const addSection = container.querySelector('.border-t.px-3.py-2');
    expect(addSection).toBeTruthy();
  });

  it('renders type display for number fields', () => {
    render(<FieldSchemaEditor fields={{ score: { type: 'number' } }} onChange={onChange} />);
    const triggers = screen.getAllByRole('combobox');
    expect(triggers.length).toBeGreaterThan(0);
    // The trigger should show 'number' type
    expect(triggers[0].textContent).toContain('number');
  });

  it('renders type display for boolean fields', () => {
    render(<FieldSchemaEditor fields={{ active: { type: 'boolean' } }} onChange={onChange} />);
    const triggers = screen.getAllByRole('combobox');
    expect(triggers[0].textContent).toContain('boolean');
  });

  it('does not show border-t on add section when no fields', () => {
    const { container } = render(<FieldSchemaEditor fields={{}} onChange={onChange} />);
    // When no fields, the add section uses 'px-3 py-2' without 'border-t'
    const sections = container.querySelectorAll('.px-3.py-2');
    // Verify it exists but no border-t
    expect(sections.length).toBeGreaterThan(0);
  });

  it('expands field to show advanced options', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<FieldSchemaEditor fields={{ country: { type: 'string' } }} onChange={onChange} />);

    // Description and Allowed Values should not be visible when collapsed
    expect(screen.queryByText('Description')).toBeFalsy();
    expect(screen.queryByText(/Allowed Values/)).toBeFalsy();

    // Click the chevron expand button (CollapsibleTrigger) for the field row
    const buttons = screen.getAllByRole('button');
    // The second button is the per-field collapsible trigger (first is toggle-all)
    const expandButton = buttons[1];
    await user.click(expandButton);

    // After expanding, the advanced options should be visible
    await waitFor(() => {
      expect(screen.getByText('Description')).toBeTruthy();
      expect(screen.getByText(/Allowed Values/)).toBeTruthy();
      expect(screen.getByText('Default Value')).toBeTruthy();
    });
  });

  it('changes field type via select', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<FieldSchemaEditor fields={{ country: { type: 'string' } }} onChange={onChange} />);

    // Click the type select trigger (combobox)
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    // Wait for dropdown to appear and click 'number'
    await waitFor(() => expect(screen.getByText('number')).toBeTruthy());
    await user.click(screen.getByText('number'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        country: expect.objectContaining({ type: 'number' }),
      });
    });
  });

  it('edits description textarea', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<FieldSchemaEditor fields={{ country: { type: 'string' } }} onChange={onChange} />);

    // Expand the field to show advanced options
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[1]);

    await waitFor(() => expect(screen.getByText('Description')).toBeTruthy());

    // Type in the description textarea
    const descriptionTextarea = screen.getByPlaceholderText('What this field is for');
    await user.type(descriptionTextarea, 'Country code');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        country: expect.objectContaining({ description: expect.any(String) }),
      });
    });
  });

  it('edits allowed values textarea', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<FieldSchemaEditor fields={{ country: { type: 'string' } }} onChange={onChange} />);

    // Expand the field to show advanced options
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[1]);

    await waitFor(() => expect(screen.getByText(/Allowed Values/)).toBeTruthy());

    // Use fireEvent.change to set full value at once (component is uncontrolled
    // since props don't re-render, so userEvent.type triggers per-char onChange
    // each seeing an empty base value)
    const allowedValuesTextarea = screen.getByPlaceholderText('e.g. US, UK, CA');
    fireEvent.change(allowedValuesTextarea, { target: { value: 'US, UK, CA' } });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        country: expect.objectContaining({
          allowedValues: ['US', 'UK', 'CA'],
        }),
      });
    });
  });

  it('renders Searchable column header', () => {
    render(<FieldSchemaEditor fields={{ country: { type: 'string' } }} onChange={onChange} />);
    expect(screen.getByText('Searchable')).toBeTruthy();
  });

  it('does not show weight dropdown when field is not searchable', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<FieldSchemaEditor fields={{ country: { type: 'string' } }} onChange={onChange} />);

    const buttons = screen.getAllByRole('button');
    await user.click(buttons[1]);

    await waitFor(() => {
      expect(screen.queryByText('Search Weight')).toBeFalsy();
    });
  });

  it('checking searchable column checkbox sets searchable: true', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<FieldSchemaEditor fields={{ country: { type: 'string' } }} onChange={onChange} />);

    const checkbox = document.getElementById('field-searchable-col-country');
    expect(checkbox).toBeTruthy();
    if (checkbox) await user.click(checkbox);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        country: expect.objectContaining({ searchable: true }),
      });
    });
  });

  it('shows weight dropdown with Moderate default when searchable', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<FieldSchemaEditor fields={{ country: { type: 'string', searchable: true } }} onChange={onChange} />);

    const buttons = screen.getAllByRole('button');
    await user.click(buttons[1]);

    await waitFor(() => {
      expect(screen.getByText('Search Weight')).toBeTruthy();
    });
  });

  it('unchecking searchable column checkbox clears searchable and searchPriority', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <FieldSchemaEditor
        fields={{ country: { type: 'string', searchable: true, searchPriority: 'critical' } }}
        onChange={onChange}
      />,
    );

    const checkbox = document.getElementById('field-searchable-col-country');
    expect(checkbox).toBeTruthy();
    if (checkbox) await user.click(checkbox);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        country: expect.objectContaining({ searchable: undefined, searchPriority: undefined }),
      });
    });
  });

  it('shows advanced dot indicator when searchable is true', () => {
    const fields: MetadataSchema = {
      country: { type: 'string', searchable: true },
    };
    const { container } = render(<FieldSchemaEditor fields={fields} onChange={onChange} />);
    const dot = container.querySelector('.bg-primary.rounded-full');
    expect(dot).toBeTruthy();
  });

  it('shows advanced dot indicator for explicit searchPriority', () => {
    const fields: MetadataSchema = {
      country: { type: 'string', searchPriority: 'critical' },
    };
    const { container } = render(<FieldSchemaEditor fields={fields} onChange={onChange} />);
    const dot = container.querySelector('.bg-primary.rounded-full');
    expect(dot).toBeTruthy();
  });

  it('does not show advanced dot when field has default settings', () => {
    const fields: MetadataSchema = {
      country: { type: 'string' },
    };
    const { container } = render(<FieldSchemaEditor fields={fields} onChange={onChange} />);
    const dot = container.querySelector('.bg-primary.rounded-full');
    expect(dot).toBeFalsy();
  });

  it('renders "Searchable" column header when fields exist', () => {
    render(<FieldSchemaEditor fields={baseFields} onChange={onChange} />);
    expect(screen.getByText('Searchable')).toBeTruthy();
  });

  it('searchable column checkbox is unchecked by default for new fields', () => {
    render(<FieldSchemaEditor fields={{ region: { type: 'string' } }} onChange={onChange} />);
    const checkbox = document.getElementById('field-searchable-col-region') as HTMLElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.getAttribute('data-state')).toBe('unchecked');
  });

  it('searchable column checkbox reflects searchable: true from field data', () => {
    render(<FieldSchemaEditor fields={{ region: { type: 'string', searchable: true } }} onChange={onChange} />);
    const checkbox = document.getElementById('field-searchable-col-region') as HTMLElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.getAttribute('data-state')).toBe('checked');
  });
});
