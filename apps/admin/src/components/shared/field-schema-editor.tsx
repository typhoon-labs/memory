import {
  Button,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@typhoon/ui';
import { ChevronDownIcon, ChevronsDownUpIcon, ChevronsUpDownIcon, PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';

export interface MetadataFieldDefinition {
  type: 'string' | 'number' | 'boolean' | 'string[]';
  required?: boolean;
  default?: unknown;
  allowedValues?: unknown[];
  description?: string;
}

export type MetadataSchema = Record<string, MetadataFieldDefinition>;

const GRID = 'grid grid-cols-[2rem_1fr_8rem_5rem_2rem] items-center gap-2 px-3';

export function FieldSchemaEditor({
  fields,
  onChange,
}: {
  fields: MetadataSchema;
  onChange: (fields: MetadataSchema) => void;
}) {
  const [newFieldName, setNewFieldName] = useState('');
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  function toggleField(name: string, open: boolean) {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (open) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  function addField() {
    const name = newFieldName.trim();
    if (!name || name in fields) return;
    onChange({ ...fields, [name]: { type: 'string' } });
    setNewFieldName('');
    setExpandedFields((prev) => new Set(prev).add(name));
  }

  function removeField(name: string) {
    const next = { ...fields };
    delete next[name];
    onChange(next);
    setExpandedFields((prev) => {
      const s = new Set(prev);
      s.delete(name);
      return s;
    });
  }

  function updateField(name: string, updates: Partial<MetadataFieldDefinition>) {
    onChange({ ...fields, [name]: { ...fields[name], ...updates } });
  }

  const entries = Object.entries(fields);
  const hasFields = entries.length > 0;
  const allExpanded = hasFields && expandedFields.size === entries.length;

  function toggleAll() {
    if (allExpanded) {
      setExpandedFields(new Set());
    } else {
      setExpandedFields(new Set(entries.map(([name]) => name)));
    }
  }

  return (
    <div className="rounded-lg border">
      {hasFields && (
        <>
          <div
            className={`${GRID} border-b py-2 text-2xs font-semibold uppercase tracking-widest text-muted-foreground`}
          >
            <button
              type="button"
              onClick={toggleAll}
              className="flex size-5 items-center justify-center rounded hover:bg-muted"
            >
              {allExpanded ? (
                <ChevronsDownUpIcon className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronsUpDownIcon className="size-3.5 text-muted-foreground" />
              )}
            </button>
            <span>Name</span>
            <span>Type</span>
            <span className="text-center">Required</span>
            <span />
          </div>

          {entries.map(([name, field]) => {
            const isOpen = expandedFields.has(name);
            const hasAdvanced = !!(field.description || field.allowedValues?.length || field.default != null);
            return (
              <Collapsible key={name} open={isOpen} onOpenChange={(open: boolean) => toggleField(name, open)}>
                <div className="border-b last:border-b-0">
                  <div className={`${GRID} py-2`}>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="relative flex size-5 items-center justify-center rounded hover:bg-muted"
                      >
                        <ChevronDownIcon
                          className={`size-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`}
                        />
                        {hasAdvanced && !isOpen && (
                          <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary" />
                        )}
                      </button>
                    </CollapsibleTrigger>

                    <span className="truncate text-sm font-medium">{name}</span>

                    <Select
                      value={field.type}
                      onValueChange={(v: string) => updateField(name, { type: v as MetadataFieldDefinition['type'] })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="string">string</SelectItem>
                        <SelectItem value="number">number</SelectItem>
                        <SelectItem value="boolean">boolean</SelectItem>
                        <SelectItem value="string[]">string[]</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="flex justify-center">
                      <Checkbox
                        id={`field-required-${name}`}
                        checked={field.required ?? false}
                        onCheckedChange={(checked: boolean | 'indeterminate') =>
                          updateField(name, { required: checked === true })
                        }
                      />
                    </div>

                    <Button variant="ghost" size="icon-sm" onClick={() => removeField(name)}>
                      <XIcon className="size-3.5" />
                    </Button>
                  </div>

                  <CollapsibleContent>
                    <div className="space-y-4 border-t px-3 py-4 pl-[2.75rem]">
                      <div className="flex flex-col gap-1.5">
                        <Label>Description</Label>
                        <Textarea
                          placeholder="What this field is for"
                          value={field.description ?? ''}
                          onChange={(e) => updateField(name, { description: e.target.value || undefined })}
                          rows={2}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>
                          Allowed Values <span className="font-normal text-muted-foreground">(comma-separated)</span>
                        </Label>
                        <Textarea
                          placeholder="e.g. US, UK, CA"
                          value={field.allowedValues?.join(', ') ?? ''}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            updateField(name, {
                              allowedValues: v ? v.split(',').map((s) => s.trim()) : undefined,
                            });
                          }}
                          rows={2}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Default Value</Label>
                        <Input
                          placeholder="Value when not specified"
                          value={field.default != null ? String(field.default) : ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateField(name, { default: v || undefined });
                          }}
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </>
      )}

      <div className={hasFields ? 'border-t px-3 py-2' : 'px-3 py-2'}>
        <div className="flex gap-2">
          <Input
            placeholder="New field name"
            value={newFieldName}
            onChange={(e) => setNewFieldName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addField()}
          />
          <Button variant="outline" onClick={addField} disabled={!newFieldName.trim()}>
            <PlusIcon className="mr-1 size-3" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
