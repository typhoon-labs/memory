# @typhoon/ui

React component library built on Radix UI primitives with Tailwind CSS (shadcn/ui pattern). Provides low-level UI primitives, higher-level application components, authentication components, forms, theming, and shared utilities used across all Typhoon frontend apps.

## Architecture Context

```
apps/admin  ──>  @typhoon/ui  ──>  radix-ui (primitives)
apps/desk          |              class-variance-authority (CVA)
apps/widget        |              tailwind-merge (cn utility)
@typhoon/chat         |              better-auth (client)
@typhoon/api-client   |              @tanstack/react-table (DataTable)
                   |              react-hook-form + @hookform/resolvers
                   v
              Tailwind CSS + CSS custom properties (theme)
```

`@typhoon/ui` is the foundational UI package consumed by:

- **All frontend apps** (`apps/admin`, `apps/desk`, `apps/widget`) -- layout, forms, tables, auth
- **`@typhoon/chat`** -- `InlineCitationChip`, `ProgressTracker`, `markdownComponents`, `ExternalLinkDialog`
- **`@typhoon/api-client`** -- `apiFetch` and `ApiError` for HTTP calls

## Exports by Category

### Authentication

| Export                                    | Description                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `authClient`                              | Better Auth client instance (configured for the Typhoon API)              |
| `AuthProvider` / `useAuth` / `useSignOut` | Auth context provider and hooks (session state, user info, sign-out)   |
| `AuthGate`                                | Renders children only when authenticated; redirects to login otherwise |
| `LoginPage`                               | Full-page OIDC login screen with SSO button                            |
| `AccessDenied`                            | Access denied page component                                           |

### Application Components

| Export                  | Props Type                   | Description                                                             |
| ----------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| `AppShell`              | `AppShellProps`              | Application layout with sidebar navigation, header, and content area    |
| `DataTable`             | `DataTableProps<T>`          | Generic data table with sorting, filtering, pagination (TanStack Table) |
| `DocumentContentViewer` | `DocumentContentViewerProps` | Renders parsed document content with chunk highlighting                 |
| `EmptyState`            | `EmptyStateProps`            | Centered empty state with icon, title, description, and action          |
| `CsvTableViewer`        | --                           | CSV content viewer with parsed table display                            |
| `StatCard`              | `StatCardProps`              | Dashboard stat card with label, value, and optional trend               |
| `StatusBadge`           | `StatusBadgeProps`           | Color-coded status indicator (CVA variants)                             |
| `PageHeader`            | `PageHeaderProps`            | Page title with optional description and actions                        |
| `SectionLabel`          | `SectionLabelProps`          | Section heading for form groups                                         |
| `LoadingSpinner`        | `LoadingSpinnerProps`        | Animated loading indicator (sm/md/lg sizes)                             |
| `MarkdownContent`       | `MarkdownContentProps`       | Markdown renderer with custom component mapping                         |
| `ExternalLinkDialog`    | --                           | Confirmation dialog before navigating to external URLs                  |

### Tool UI Components

| Export               | Props Type                | Description                                               |
| -------------------- | ------------------------- | --------------------------------------------------------- |
| `InlineCitationChip` | `InlineCitationChipProps` | Interactive superscript citation badge with hover popover |
| `ProgressTracker`    | `ProgressTrackerProps`    | Multi-step tool progress indicator with status icons      |

### Forms

| Export                                                                        | Description                                              |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| `Form` / `FormField` / `FormItem` / `FormLabel` / `FormMessage`               | Composable form components (react-hook-form integration) |
| `FormProvider` / `useForm` / `useFormContext` / `useFormField` / `Controller` | Form state management hooks                              |
| `zodResolver`                                                                 | Zod schema resolver for form validation                  |

### shadcn/ui Primitives

All primitives are built on Radix UI with Tailwind CSS styling and CVA variants.

**Layout and Containers:**

| Component                                                                                             | Description                                         |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter` / `CardAction` | Card container with composable sections             |
| `Separator`                                                                                           | Visual divider                                      |
| `ScrollArea` / `ScrollBar`                                                                            | Custom scrollbar container                          |
| `ResizablePanel` / `ResizablePanelGroup` / `ResizableHandle`                                          | Resizable split panes                               |
| `Sidebar` / `SidebarProvider` / `SidebarContent` / `SidebarMenu` / ...                                | Full sidebar navigation system (20+ sub-components) |
| `Collapsible` / `CollapsibleContent` / `CollapsibleTrigger`                                           | Expandable/collapsible container                    |

**Inputs and Controls:**

| Component                                                                         | Description                                                                                     |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Button`                                                                          | Primary action button with CVA variants (default, destructive, outline, secondary, ghost, link) |
| `Input`                                                                           | Text input field                                                                                |
| `Textarea`                                                                        | Multi-line text input                                                                           |
| `Label`                                                                           | Form label                                                                                      |
| `Checkbox`                                                                        | Radix checkbox (never use raw `<input type="checkbox">`)                                        |
| `Select` / `SelectContent` / `SelectItem` / `SelectTrigger` / `SelectValue` / ... | Dropdown select                                                                                 |
| `Command` / `CommandInput` / `CommandList` / `CommandItem` / ...                  | Command palette / combobox (cmdk)                                                               |

**Overlays and Feedback:**

| Component                                                                                                | Description                                   |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter` / ... | Modal dialog                                  |
| `AlertDialog` / `AlertDialogAction` / `AlertDialogCancel` / `AlertDialogContent` / ...                   | Destructive confirmation dialog               |
| `Sheet` / `SheetContent` / `SheetHeader` / `SheetTitle` / ...                                            | Slide-out panel                               |
| `Popover` / `PopoverContent` / `PopoverTrigger` / `PopoverAnchor`                                        | Popover overlay                               |
| `Tooltip` / `TooltipContent` / `TooltipTrigger` / `TooltipProvider`                                      | Hover tooltip                                 |
| `DropdownMenu` / `DropdownMenuContent` / `DropdownMenuItem` / ...                                        | Dropdown menu with sub-menus and radio groups |

**Data Display:**

| Component                                                                                                       | Description                                                               |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `Table` / `TableHeader` / `TableBody` / `TableRow` / `TableHead` / `TableCell` / `TableFooter` / `TableCaption` | Basic HTML table with styling                                             |
| `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`                                                             | Tabbed content panels                                                     |
| `Badge`                                                                                                         | Inline label with CVA variants (default, secondary, destructive, outline) |
| `Skeleton`                                                                                                      | Loading placeholder                                                       |

### Theme

| Export          | Description                                               |
| --------------- | --------------------------------------------------------- |
| `ThemeProvider` | Theme context provider (wraps app root)                   |
| `ThemeContext`  | Raw theme context for advanced use                        |
| `useTheme`      | Hook to access/toggle theme (`light` / `dark` / `system`) |

Theme variables are defined as CSS custom properties in the global stylesheet. Colors follow the shadcn/ui convention: `--background`, `--foreground`, `--primary`, `--muted`, `--destructive`, etc.

### Hooks

| Export              | Signature                          | Description                                               |
| ------------------- | ---------------------------------- | --------------------------------------------------------- |
| `useIsMobile`       | `() => boolean`                    | Responsive breakpoint detection (768px)                   |
| `useDocumentTitle`  | `(title: string) => void`          | Set the document title                                    |
| `useUrlSearchInput` | `(paramName) => [value, setValue]` | Two-way binding between URL search params and input state |

### Utilities

| Export                 | Signature                              | Description                                             |
| ---------------------- | -------------------------------------- | ------------------------------------------------------- |
| `cn()`                 | `(...inputs: ClassValue[]) => string`  | Tailwind class merging (tailwind-merge + clsx)          |
| `formatRelativeTime()` | `(date) => string`                     | Human-readable relative time ("2 hours ago")            |
| `formatAbsoluteTime()` | `(date, options?) => string`           | Formatted absolute timestamp                            |
| `apiFetch()`           | `<T>(url, init?) => Promise<T>`        | Typed fetch wrapper with credentials and error handling |
| `ApiError`             | `class extends Error { status, data }` | Structured API error with status code                   |

### CSV Utilities

| Export            | Description                                       |
| ----------------- | ------------------------------------------------- |
| `parseCsv()`      | Parse CSV string to rows                          |
| `parseCsvRow()`   | Parse a single CSV row                            |
| `normalizeRows()` | Normalize parsed rows to uniform column structure |

### Markdown Utilities

| Export                               | Description                                                             |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `markdownComponents`                 | Shared markdown component mapping for `react-markdown` and `streamdown` |
| `createDocumentMarkdownComponents()` | Factory for document-viewer-specific markdown components                |

### Styles

Import `@typhoon/ui/styles` in your app entry point for the global CSS (Tailwind base/components/utilities + theme variables):

```typescript
import '@typhoon/ui/styles';
```

## CVA Pattern

Components use class-variance-authority (CVA) for type-safe variant styling:

```typescript
import { cva } from 'class-variance-authority';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'border-transparent bg-primary text-primary-foreground',
      secondary: 'border-transparent bg-secondary text-secondary-foreground',
      destructive: 'border-transparent bg-destructive text-destructive-foreground',
      outline: 'text-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});
```

Consumers use the `cn()` utility to merge variant classes with custom overrides:

```tsx
<Badge className={cn(badgeVariants({ variant: 'secondary' }), 'my-custom-class')} />
```

## Internal Structure

```
src/
  index.ts               -- Package entry point (re-exports everything)
  auth-client.ts          -- Better Auth client configuration
  auth-provider.tsx        -- AuthProvider context + useAuth + useSignOut
  auth-gate.tsx            -- Authenticated-only rendering gate
  login-page.tsx           -- OIDC login page
  components/
    AppShell.tsx           -- Application layout with sidebar
    DataTable.tsx          -- Generic data table (TanStack Table)
    DocumentContentViewer.tsx -- Document content renderer
    EmptyState.tsx         -- Empty state component
    CsvTableViewer.tsx     -- CSV table viewer
    StatCard.tsx           -- Dashboard stat card
    StatusBadge.tsx        -- Status indicator (CVA variants)
    PageHeader.tsx         -- Page title with actions
    SectionLabel.tsx       -- Section heading
    LoadingSpinner.tsx     -- Loading animation
    ExternalLinkDialog.tsx -- External link confirmation
    Form.tsx               -- Form components (react-hook-form)
    access-denied.tsx      -- Access denied page
    markdown-components.tsx -- Shared markdown component mapping
    tool-ui/
      citation/            -- InlineCitationChip
      progress-tracker/    -- ProgressTracker
    ui/
      alert-dialog.tsx     -- AlertDialog (Radix)
      badge.tsx            -- Badge (CVA)
      button.tsx           -- Button (CVA)
      card.tsx             -- Card
      checkbox.tsx         -- Checkbox (Radix)
      collapsible.tsx      -- Collapsible (Radix)
      command.tsx          -- Command palette (cmdk)
      dialog.tsx           -- Dialog (Radix)
      dropdown-menu.tsx    -- DropdownMenu (Radix)
      input.tsx            -- Input
      label.tsx            -- Label (Radix)
      popover.tsx          -- Popover (Radix)
      resizable.tsx        -- Resizable panels
      scroll-area.tsx      -- ScrollArea (Radix)
      select.tsx           -- Select (Radix)
      separator.tsx        -- Separator (Radix)
      sheet.tsx            -- Sheet (Radix)
      sidebar.tsx          -- Sidebar navigation system
      skeleton.tsx         -- Skeleton
      table.tsx            -- Table
      tabs.tsx             -- Tabs (Radix)
      textarea.tsx         -- Textarea
      tooltip.tsx          -- Tooltip (Radix)
  hooks/
    use-document-title.ts  -- Document title hook
    use-mobile.ts          -- Mobile breakpoint detection
    use-url-search-input.ts -- URL search param binding
  lib/
    api-fetch.ts           -- apiFetch wrapper + ApiError
    format-time.ts         -- Time formatting utilities
    utils.ts               -- cn() class merging
  styles/
    globals.css            -- Tailwind + theme CSS custom properties
  theme/
    ThemeProvider.tsx       -- Theme context provider
    useTheme.ts            -- Theme hook
```

## Dependencies

| Package                                   | Purpose                                                  |
| ----------------------------------------- | -------------------------------------------------------- |
| `@radix-ui/*`                             | Accessible UI primitives (dialog, popover, select, etc.) |
| `class-variance-authority`                | CVA for type-safe component variants                     |
| `tailwind-merge`                          | Intelligent Tailwind class merging                       |
| `lucide-react`                            | Icon library                                             |
| `@tanstack/react-table`                   | Headless table for DataTable                             |
| `react-hook-form` / `@hookform/resolvers` | Form state management + Zod validation                   |
| `better-auth`                             | Authentication client                                    |
| `cmdk`                                    | Command palette / combobox                               |
| `react-markdown`                          | Markdown rendering                                       |
| `react-resizable-panels`                  | Resizable panel layout                                   |

**Peer dependencies:** `react`, `react-dom`, `tailwindcss`

## Cross-References

- Frontend architecture: [../../docs/frontend/](../../docs/frontend/)
- Design system: [../../docs/design.md](../../docs/design.md)
- Chat components (consumer): [../chat/README.md](../chat/README.md)
- API client (consumer of apiFetch): [../api-client/README.md](../api-client/README.md)
- Auth documentation: [../../docs/auth/](../../docs/auth/)
