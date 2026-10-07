import { SearchIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

/** The search box, at the size of a page's main control. */
export function SearchField({ className, ...props }: ComponentProps<'input'>) {
  return (
    <div className={cn('relative', className)}>
      <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        name="q"
        autoComplete="off"
        placeholder="Color, shape or size"
        // The browser's own clear button is drawn in its accent color; the box is cleared with the keyboard.
        className="h-12 bg-card pl-11 text-lg md:text-lg [&::-webkit-search-cancel-button]:appearance-none"
        {...props}
      />
    </div>
  );
}
