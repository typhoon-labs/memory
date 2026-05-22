import { createContext, useContext, useId, useMemo } from 'react';
import type { ControllerProps, FieldPath, FieldValues } from 'react-hook-form';
import { Controller, FormProvider, useFormContext } from 'react-hook-form';

import { cn } from '../lib/utils';
import { Label } from './ui/label';

export { zodResolver } from '@hookform/resolvers/zod';
// Re-export react-hook-form essentials for consumers
export { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form';

// =============================================================================
// Form (root)
// =============================================================================

interface FormProps<TFieldValues extends FieldValues = FieldValues> extends Omit<
  React.FormHTMLAttributes<HTMLFormElement>,
  'onSubmit'
> {
  form: import('react-hook-form').UseFormReturn<TFieldValues>;
  onSubmit: (data: TFieldValues) => void;
}

/**
 * Form wrapper that provides react-hook-form context to children.
 */
function Form<TFieldValues extends FieldValues = FieldValues>({
  form,
  onSubmit,
  children,
  ...props
}: FormProps<TFieldValues>) {
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} {...props}>
        {children}
      </form>
    </FormProvider>
  );
}

// =============================================================================
// FormField
// =============================================================================

type FormFieldContextValue = {
  name: string;
};

const FormFieldContext = createContext<FormFieldContextValue>({ name: '' });

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  const ctxValue = useMemo(() => ({ name: props.name }), [props.name]);
  return (
    <FormFieldContext.Provider value={ctxValue}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

// =============================================================================
// useFormField hook
// =============================================================================

function useFormField() {
  const fieldContext = useContext(FormFieldContext);
  const { getFieldState, formState } = useFormContext();
  const fieldState = getFieldState(fieldContext.name, formState);
  const id = useId();

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
}

// =============================================================================
// FormItem
// =============================================================================

function FormItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-1.5', className)} {...props} />;
}

// =============================================================================
// FormLabel
// =============================================================================

function FormLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof Label>) {
  const { formItemId, error } = useFormField();
  return <Label htmlFor={formItemId} className={cn(error && 'text-destructive', className)} {...props} />;
}

// =============================================================================
// FormMessage
// =============================================================================

function FormMessage({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error.message) : children;

  if (!body) return null;

  return (
    <p id={formMessageId} className={cn('text-destructive text-xs font-medium', className)} {...props}>
      {body}
    </p>
  );
}

export { Form, FormField, FormItem, FormLabel, FormMessage, useFormField };
