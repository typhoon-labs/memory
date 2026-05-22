import { Badge, Popover, PopoverContent, PopoverTrigger } from '@typhoon/ui';
import { useState } from 'react';

import type { MetadataSchema } from './field-schema-editor';

interface FieldGroupInfo {
  name: string;
  description: string | null;
  fields: MetadataSchema;
}

export function FieldGroupBadgePopover({ group }: { group: FieldGroupInfo }) {
  const [open, setOpen] = useState(false);
  const fieldEntries = Object.entries(group.fields);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex outline-none"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <Badge variant="secondary" className="cursor-default text-xs">
            {group.name}
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
          <span className="font-medium">{group.name}</span>
          {group.description && <p className="text-muted-foreground text-xs">{group.description}</p>}

          <div className="border-t pt-2">
            <span className="text-muted-foreground text-xs">
              {fieldEntries.length} {fieldEntries.length === 1 ? 'field' : 'fields'}
            </span>
            {fieldEntries.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {fieldEntries.map(([name, field]) => (
                  <Badge key={name} variant="outline" className="text-2xs">
                    {name}
                    {field.required && '*'}
                    <span className="text-muted-foreground ml-1">{field.type}</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
