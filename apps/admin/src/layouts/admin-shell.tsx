import { Outlet } from '@tanstack/react-router';
import {
  AppShell,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  type NavItem,
  useAuth,
  useSignOut,
} from '@typhoon/ui';
import {
  FileTextIcon,
  FolderSyncIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  LogOutIcon,
  MessageSquareQuoteIcon,
} from 'lucide-react';
import { useQueueEvents } from '../lib/use-queue-events.js';

const NAV_GROUPS = [
  {
    items: [
      { label: 'Dashboard', href: '/', icon: <LayoutDashboardIcon /> },
      { label: 'Sync Sources', href: '/sources', icon: <FolderSyncIcon /> },
      { label: 'Documents', href: '/documents', icon: <FileTextIcon /> },
      { label: 'Feedback', href: '/feedback', icon: <MessageSquareQuoteIcon /> },
      { label: 'Queues', href: '/queues', icon: <ListChecksIcon /> },
    ],
  },
];

function UserMenu() {
  const { user } = useAuth();
  const signOut = useSignOut();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full min-w-0 items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-accent"
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-2xs font-medium text-primary-foreground">
            {user?.email?.charAt(0).toUpperCase() ?? 'A'}
          </div>
          <span className="truncate text-xs text-muted-foreground">{user?.email ?? 'Admin'}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onClick={signOut}>
          <LogOutIcon className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavLink({ item, children }: { item: NavItem; children: React.ReactNode }) {
  return <a href={item.href}>{children}</a>;
}

export function AdminShell() {
  useQueueEvents();
  return (
    <AppShell
      logo={
        <div className="flex items-baseline gap-1.5">
          <span className="text-base font-bold">Typhoon</span>
          <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Admin</span>
        </div>
      }
      navGroups={NAV_GROUPS}
      userMenu={<UserMenu />}
      renderLink={(item, children) => <NavLink item={item}>{children}</NavLink>}
    >
      <Outlet />
    </AppShell>
  );
}
