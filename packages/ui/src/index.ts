// === Auth ===

export type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
export { authClient } from './auth-client';
export { AuthGate } from './auth-gate';
export { AuthProvider, useAuth, useSignOut } from './auth-provider';
export type { AppShellProps, NavGroup, NavItem } from './components/AppShell';
export { AppShell } from './components/AppShell';
// === Custom Compound Components ===
export { AccessDenied } from './components/access-denied';
export { CsvTableViewer, normalizeRows, parseCsv, parseCsvRow } from './components/CsvTableViewer';
export type { DataTableProps } from './components/DataTable';
export { DataTable } from './components/DataTable';
export type { DocumentContentViewerProps } from './components/DocumentContentViewer';
export { createDocumentMarkdownComponents, DocumentContentViewer } from './components/DocumentContentViewer';
export type { EmptyStateProps } from './components/EmptyState';
export { EmptyState } from './components/EmptyState';
export { ExternalLinkDialog } from './components/ExternalLinkDialog';
export {
  Controller,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormProvider,
  useForm,
  useFormContext,
  useFormField,
  zodResolver,
} from './components/Form';
export type { LoadingSpinnerProps, LoadingSpinnerSize } from './components/LoadingSpinner';
export { LoadingSpinner } from './components/LoadingSpinner';
export type { MarkdownContentProps } from './components/markdown-components';
export { MarkdownContent, markdownComponents } from './components/markdown-components';
export type { PageHeaderProps } from './components/PageHeader';
export { PageHeader } from './components/PageHeader';
export type { SectionLabelProps } from './components/SectionLabel';
export { SectionLabel } from './components/SectionLabel';
export type { StatCardProps } from './components/StatCard';
export { StatCard } from './components/StatCard';
export type { StatusBadgeProps, StatusBadgeVariant } from './components/StatusBadge';
export { StatusBadge } from './components/StatusBadge';
// === Tool UI ===
export type { CitationData, InlineCitationChipProps } from './components/tool-ui/citation/index';
export { InlineCitationChip } from './components/tool-ui/citation/index';
export type { ProgressEvent, ProgressStep, ProgressTrackerProps } from './components/tool-ui/progress-tracker/index';
export { ProgressTracker } from './components/tool-ui/progress-tracker/index';
// === shadcn/ui Primitives ===
export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './components/ui/alert-dialog';
export { Badge, badgeVariants } from './components/ui/badge';
export { Button, buttonVariants } from './components/ui/button';
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './components/ui/card';
export { Checkbox } from './components/ui/checkbox';
export { Collapsible, CollapsibleContent, CollapsibleTrigger } from './components/ui/collapsible';
export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from './components/ui/command';
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './components/ui/dialog';
export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
export { Input } from './components/ui/input';
export { Label } from './components/ui/label';
export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './components/ui/popover';
export { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './components/ui/resizable';
export { ScrollArea, ScrollBar } from './components/ui/scroll-area';
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
export { Separator } from './components/ui/separator';
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './components/ui/sheet';
export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from './components/ui/sidebar';
export { Skeleton } from './components/ui/skeleton';
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from './components/ui/table';
export { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
export { Textarea } from './components/ui/textarea';
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './components/ui/tooltip';
// === Hooks ===
export { useDocumentTitle } from './hooks/use-document-title';
export { useIsMobile } from './hooks/use-mobile';
export { useUrlSearchInput } from './hooks/use-url-search-input';
export { ApiError, apiFetch } from './lib/api-fetch';
export type { FormatAbsoluteTimeOptions } from './lib/format-time';
export { formatAbsoluteTime, formatRelativeTime } from './lib/format-time';
// === Utilities ===
export { cn } from './lib/utils';
export { LoginPage } from './login-page';
// === Theme ===
export type { Theme, ThemeContextValue, ThemeProviderProps } from './theme/ThemeProvider';
export { ThemeContext, ThemeProvider } from './theme/ThemeProvider';
export { useTheme } from './theme/useTheme';
