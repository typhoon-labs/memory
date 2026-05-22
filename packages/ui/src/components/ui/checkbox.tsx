import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '../../lib/utils';

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer border-input focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground size-4 shrink-0 rounded-sm border shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Checked"
        >
          <path
            d="M8.5 2.5L3.75 7.5L1.5 5.25"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
