// === Auth ===

export type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
export { authClient } from './auth-client.js';
export { AuthGate } from './auth-gate.js';
export { AuthProvider, useAuth, useSignOut } from './auth-provider.js';
// === Custom Compound Components ===
export type { AppShellProps, NavGroup, NavItem } from './components/AppShell.js';
export { AppShell } from './components/AppShell.js';
export type { DataTableProps } from './components/DataTable.js';
export { DataTable } from './components/DataTable.js';
export type { EmptyStateProps } from './components/EmptyState.js';
export { EmptyState } from './components/EmptyState.js';
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
} from './components/Form.js';
export type { LoadingSpinnerProps, LoadingSpinnerSize } from './components/LoadingSpinner.js';
export { LoadingSpinner } from './components/LoadingSpinner.js';
export type { PageHeaderProps } from './components/PageHeader.js';
export { PageHeader } from './components/PageHeader.js';
export type { SectionLabelProps } from './components/SectionLabel.js';
export { SectionLabel } from './components/SectionLabel.js';
export type { StatCardProps } from './components/StatCard.js';
export { StatCard } from './components/StatCard.js';
export type { StatusBadgeProps, StatusBadgeVariant } from './components/StatusBadge.js';
export { StatusBadge } from './components/StatusBadge.js';
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
} from './components/ui/alert-dialog.js';
export { Badge, badgeVariants } from './components/ui/badge.js';
export { Button, buttonVariants } from './components/ui/button.js';
export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './components/ui/card.js';
export {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './components/ui/collapsible.js';
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
} from './components/ui/command.js';
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
} from './components/ui/dialog.js';
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
} from './components/ui/dropdown-menu.js';
export { Input } from './components/ui/input.js';
export { Label } from './components/ui/label.js';
export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from './components/ui/popover.js';
export { ScrollArea, ScrollBar } from './components/ui/scroll-area.js';
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
} from './components/ui/select.js';
export { Separator } from './components/ui/separator.js';
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './components/ui/sheet.js';
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
} from './components/ui/sidebar.js';
export { Skeleton } from './components/ui/skeleton.js';
export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from './components/ui/table.js';
export { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs.js';
export { Textarea } from './components/ui/textarea.js';
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './components/ui/tooltip.js';
// === Hooks ===
export { useIsMobile } from './hooks/use-mobile.js';
export type { FormatAbsoluteTimeOptions } from './lib/format-time.js';
export { formatAbsoluteTime, formatRelativeTime } from './lib/format-time.js';
// === Utilities ===
export { cn } from './lib/utils.js';
export { LoginPage } from './login-page.js';
// === Theme ===
export type { Theme, ThemeContextValue, ThemeProviderProps } from './theme/ThemeProvider.js';
export { ThemeContext, ThemeProvider } from './theme/ThemeProvider.js';
export { useTheme } from './theme/useTheme.js';
