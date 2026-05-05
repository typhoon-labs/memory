import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Form, FormField, FormItem, FormLabel, FormMessage, useForm, useFormField } from './Form';

afterEach(cleanup);

describe('Form components', () => {
  it('renders Form with children', () => {
    function TestForm() {
      const form = useForm({ defaultValues: { name: '' } });
      return (
        <Form form={form} onSubmit={() => {}}>
          <div>Form content</div>
        </Form>
      );
    }
    render(<TestForm />);
    expect(screen.getByText('Form content')).toBeTruthy();
  });

  it('renders FormField with FormItem and FormLabel', () => {
    function TestForm() {
      const form = useForm({ defaultValues: { name: '' } });
      return (
        <Form form={form} onSubmit={() => {}}>
          <FormField
            control={form.control}
            name="name"
            render={() => (
              <FormItem>
                <FormLabel>Name</FormLabel>
              </FormItem>
            )}
          />
        </Form>
      );
    }
    render(<TestForm />);
    expect(screen.getByText('Name')).toBeTruthy();
  });

  it('renders FormMessage when field has error', () => {
    function TestForm() {
      const form = useForm({ defaultValues: { name: '' } });
      return (
        <Form form={form} onSubmit={() => {}}>
          <FormField
            control={form.control}
            name="name"
            render={() => (
              <FormItem>
                <FormMessage>Required field</FormMessage>
              </FormItem>
            )}
          />
        </Form>
      );
    }
    render(<TestForm />);
    expect(screen.getByText('Required field')).toBeTruthy();
  });

  it('exports useFormField hook', () => {
    expect(typeof useFormField).toBe('function');
  });
});
