import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type * as React from 'react';

import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-border text-muted-foreground text-2xs border bg-transparent font-medium',
        secondary: 'border-border text-muted-foreground text-2xs border bg-transparent font-medium',
        destructive:
          'bg-destructive [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 text-white',
        outline: 'border-input text-accent-foreground text-2xs border bg-transparent font-medium',
        ghost: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 [a&]:hover:underline',
        success: 'text-2xs border border-emerald-500/20 bg-emerald-500/10 font-medium text-emerald-400',
        info: 'text-2xs border border-blue-500/20 bg-blue-500/10 font-medium text-blue-400',
        warning: 'text-2xs border border-amber-500/20 bg-amber-500/10 font-medium text-amber-400',
        error: 'text-2xs border border-red-500/20 bg-red-500/10 font-medium text-red-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';

  return (
    <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
