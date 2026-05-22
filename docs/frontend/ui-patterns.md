# UI Patterns

This document covers the component conventions, layout patterns, and interaction design used across Typhoon's frontend applications.

## Component Library

Typhoon uses **Radix UI** primitives with **shadcn/ui-style** wrappers. Components live in `packages/ui/src/components/ui/` and are consumed as `@typhoon/ui` across all apps.

### Styling

- **CVA** (class-variance-authority) for component variants:

  ```typescript
  const buttonVariants = cva('inline-flex items-center ...', {
    variants: {
      variant: { default: '...', destructive: '...', outline: '...' },
      size: { default: '...', sm: '...', lg: '...' },
    },
  });
  ```

- **`cn()`** for class merging -- wraps `clsx` + `tailwind-merge` to safely combine conditional and conflicting Tailwind classes:

  ```typescript
  import { cn } from '@typhoon/ui';
  <div className={cn('p-4 text-sm', isActive && 'bg-blue-50')} />
  ```

- **Tailwind CSS** for all styling -- no CSS modules, no styled-components.

## Page Layout Conventions

### Width Constraints

| Page type  | Max width   | Example                         |
| ---------- | ----------- | ------------------------------- |
| List pages | `max-w-5xl` | Sources list, scorers list      |
| Form pages | `max-w-5xl` | Scorer create, field group edit |
| Dashboards | `max-w-6xl` | Admin dashboard, review detail  |

### Form Page Structure

Form pages use a consistent section layout:

```tsx
<div className="max-w-5xl space-y-6">
  <h1>Create Scorer</h1>

  <section>
    <h2 className="text-sm font-semibold">General</h2>
    <div className="pt-4 space-y-4">{/* form fields */}</div>
  </section>

  <section>
    <h2 className="text-sm font-semibold pt-4">Configuration</h2>
    <div className="pt-4 space-y-4">{/* more form fields */}</div>
  </section>

  <Separator />
  <div className="flex gap-2">
    <Button type="submit">Create</Button>
    <Button variant="outline" onClick={cancel}>
      Cancel
    </Button>
  </div>
</div>
```

Key conventions:

- Section headers use `<h2 className="text-sm font-semibold">`
- Spacing between sections uses `pt-4`
- A `Separator` precedes the action buttons
- Action buttons are in a `flex gap-2` container

## Entity Creation Pattern

Entity creation uses **dedicated pages**, not dialogs:

1. **List page** links to a create page (e.g., `/scorers` links to `/scorers/create`)
2. **Create page** renders a form. On success, redirects to the new entity's detail page
3. **Detail page** shows the entity with an edit mode

### Dual-Mode Components

Some components handle both create and edit by checking for route params:

```typescript
function FieldGroupDetailPage() {
  const params = useParams({ from: '/metadata/field-groups/$groupId' });
  const isCreate = !params.groupId;

  // Render create form or edit form based on isCreate
}
```

This pattern is used for:

- `FieldGroupDetailPage` -- `/metadata/field-groups/create` vs `/metadata/field-groups/$groupId`
- `MetadataTemplateDetailPage` -- `/metadata/templates/create` vs `/metadata/templates/$templateId`
- `DatasetItemFormPage` -- `/datasets/$datasetId/items/create` vs `/datasets/$datasetId/items/$itemId`

### When to Use Dialogs

Dialogs (modals) are reserved for:

- **Destructive confirmations** -- `AlertDialog` for delete, archive, or other irreversible actions
- **Simple inline actions** -- quick edits or confirmations that do not warrant a full page

Never use dialogs for entity creation or complex forms.

## Form Controls

### Checkbox

Always use Radix `Checkbox` from `@typhoon/ui`:

```tsx
import { Checkbox } from '@typhoon/ui';

<Checkbox checked={value} onCheckedChange={setValue} />;
```

Never use raw `<input type="checkbox">` -- the Radix component provides consistent styling and accessibility.

### Select

Radix `Select` from `@typhoon/ui` for dropdowns. In tests with happy-dom, use:

```typescript
const user = userEvent.setup({ pointerEventsCheck: 0 });
```

## Specialized Components

### FieldSchemaEditor

Location: `apps/admin/src/components/shared/field-schema-editor.tsx`

A compact table layout for defining metadata field schemas. Features:

- **Columns:** Name, Type, Required, Searchable -- all inline-editable
- **Searchable column** -- checkbox that opts the field into full-text search via weighted tsvector
- Collapsible rows for advanced field options (description, allowed values, default value, search weight)
- **Search weight dropdown** -- visible when Searchable is checked; options: `critical`, `high`, `moderate` (default), `standard`
- Expand/collapse all toggle in the table header
- New fields auto-expand to show all options immediately
- Save button is disabled until changes are detected (dirty state tracking)

### FieldBadgePopover

Location: `apps/admin/src/components/shared/field-badge-popover.tsx`

A hover-triggered popover that displays metadata field details. Used next to field labels in the document metadata editor and other contexts. Shows:

- Field name and type
- Required status
- Searchable status with weight (e.g., "Yes, moderate weight")
- Allowed values (if defined)
- Default value (if defined)

### DocumentDetailSheet

Location: `apps/admin/src/components/pages/sync-source-detail/document-detail-sheet.tsx`

A slide-over sheet for viewing and editing document details. Key behaviors:

- **Metadata tab** is schema-aware: fetches the sync target's metadata template and shows only template-defined fields
- **Click-to-edit** pattern for all metadata values
- Values are coerced to proper types (number, boolean, string[]) before saving via `coerceMetadataValue()`
- Each field label has an info icon showing `FieldBadgePopover` with type, required, searchable status, allowed values, and default
- Non-required select fields have a "---" clear option; text fields show an X button to clear values
- Cleared fields send `null` to remove the key from custom metadata
- Documents without a template show "No metadata template assigned"
- **Details tab** uses the label "File Properties" (not "Metadata") to avoid collision with the Metadata tab
- **Needs sync indicator** -- sheet header shows `refresh needs sync` next to the status badge when `searchMetaDirty` is true
- Saving custom metadata auto-propagates `_searchMeta_*` fields on save (no sync needed)

### Dirty Document Indicators

Documents with stale search indexes (`searchMetaDirty = true`) show visual indicators:

- **Document list views** (main documents page, sync source documents tab, S3 browse view) -- amber `RefreshCw` icon inline after the last-synced time
- **Document detail sheet** -- `needs sync` text next to the status badge in the header
- **Field group/template save pages** -- amber banner with the count of affected sync sources
- **Sync source overview tab** -- banner showing the count of documents needing search index refresh

## Navigation

Always use TanStack Router's `<Link>` component:

```tsx
import { Link } from '@tanstack/react-router';

<Link to="/sources/$sourceId" params={{ sourceId }}>
  {source.name}
</Link>;
```

Never use plain `<a href>` for internal links -- it causes a full page reload, losing all client state, query cache, and component state. See [Routing](./routing.md) for details.

## Data Tables

Data tables use a shared `DataTable` component that accepts column definitions and data. Column cell renderers handle formatting, links, and status badges inline:

```typescript
const columns = [
  {
    header: 'Name',
    cell: ({ row }) => (
      <Link to="/sources/$sourceId" params={{ sourceId: row.id }}>
        {row.name}
      </Link>
    ),
  },
  {
    header: 'Status',
    cell: ({ row }) => <StatusBadge status={row.status} />,
  },
];
```

In tests, rendering `DataTable` with data rows exercises all cell renderers automatically.
