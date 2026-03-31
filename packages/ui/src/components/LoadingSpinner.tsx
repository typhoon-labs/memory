import { cn } from '../lib/utils.js';

export type LoadingSpinnerSize = 'sm' | 'md' | 'lg';

export interface LoadingSpinnerProps {
  /** The size of the spinner. Defaults to "md". */
  size?: LoadingSpinnerSize;
  /** Additional CSS classes to merge. */
  className?: string;
}

const sizeClasses: Record<LoadingSpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

/**
 * An animated loading spinner indicator using Tailwind's animate-spin.
 */
export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps): React.JSX.Element {
  return (
    <output aria-label="Loading" className="inline-flex">
      <svg
        className={cn('animate-spin text-current', sizeClasses[size], className)}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </output>
  );
}
