import { Badge, Popover, PopoverContent, PopoverTrigger } from '@typhoon/ui';
import { useState } from 'react';
import type { MetadataFieldDefinition } from './field-schema-editor';

export function FieldBadgePopover({ name, field }: { name: string; field: MetadataFieldDefinition }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex outline-none"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <Badge variant="outline" className="cursor-default text-xs">
            {name}
            {field.required && '*'}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-64 text-sm"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onOpenAutoFocus={(e: Event) => e.preventDefault()}
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">{name}</span>
            <Badge variant="outline" className="text-xs">
              {field.type}
            </Badge>
          </div>

          <dl className="space-y-1.5 border-t pt-2 text-xs">
            {field.description && (
              <div>
                <dt className="text-muted-foreground">Description</dt>
                <dd className="mt-0.5">{field.description}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Required</dt>
              <dd className="mt-0.5">{field.required ? 'Yes' : 'No'}</dd>
            </div>
            {field.allowedValues && field.allowedValues.length > 0 && (
              <div>
                <dt className="text-muted-foreground">Allowed Values</dt>
                <dd className="mt-0.5">{field.allowedValues.join(', ')}</dd>
              </div>
            )}
            {field.default != null && (
              <div>
                <dt className="text-muted-foreground">Default</dt>
                <dd className="mt-0.5">{String(field.default)}</dd>
              </div>
            )}
          </dl>
        </div>
      </PopoverContent>
    </Popover>
  );
}
