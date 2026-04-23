# @typhoon/ui

React component library built on Radix UI primitives with Tailwind CSS (shadcn/ui pattern). Provides both low-level UI primitives and higher-level application components.

## Exports

**Application Components:**
`AppShell`, `DataTable`, `DocumentContentViewer`, `EmptyState`, `CsvTableViewer`, `ProgressTracker`, `StatusBadge`, `StatCard`, `SectionLabel`, `LoadingSpinner`, `PageHeader`

**Authentication:**
`authClient`, `AuthGate`, `AuthProvider`, `useAuth`, `useSignOut`, `LoginPage`

**Forms:**
`Form`, `FormField`, `FormItem`, `FormLabel`, `FormMessage`, `FormProvider`, `useForm`, `useFormContext`, `zodResolver`

**Shadcn/UI Primitives:**
`Button`, `Card`, `Dialog`, `DropdownMenu`, `Input`, `Label`, `Select`, `Sheet`, `Sidebar`, `Table`, `Tabs`, `Textarea`, `Tooltip`, `Badge`, `Checkbox`, `Command`, `Popover`, `ScrollArea`, `Separator`, `Skeleton`, `Switch`

**Theme:**
`ThemeProvider`, `useTheme`

**Utilities:**
`cn()` (class merging), `formatRelativeTime()`, `formatAbsoluteTime()`, `useIsMobile()`

**Styles:**
Import `@typhoon/ui/styles` for the global CSS (Tailwind + theme variables).

## Dependencies

`radix-ui`, `react-hook-form`, `@hookform/resolvers`, `@tanstack/react-table`, `class-variance-authority`, `tailwind-merge`, `lucide-react`, `cmdk`, `react-markdown`, `react-resizable-panels`, `better-auth`

**Peer dependencies:** `react`, `react-dom`, `tailwindcss`
