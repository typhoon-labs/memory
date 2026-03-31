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
import { FileTextIcon, LayoutDashboardIcon, LogOutIcon, MessageSquareIcon, SearchIcon } from 'lucide-react';

const NAV_GROUPS = [
  {
    items: [
      { label: 'Dashboard', href: '/', icon: <LayoutDashboardIcon /> },
      { label: 'Chat', href: '/chat', icon: <MessageSquareIcon /> },
      { label: 'Search', href: '/search', icon: <SearchIcon /> },
      { label: 'Documents', href: '/documents', icon: <FileTextIcon /> },
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
            {user?.email?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          <span className="truncate text-xs text-muted-foreground">{user?.email ?? 'User'}</span>
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
  // We use a plain <a> here. TanStack Router's Link is used in the route-tree,
  // but AppShell's renderLink needs a simple wrapper. The AppShell handles active
  // state via the isActive prop on NavItem.
  return <a href={item.href}>{children}</a>;
}

export function DeskShell() {
  return (
    <AppShell
      logo={<span className="text-base font-bold">Typhoon</span>}
      navGroups={NAV_GROUPS}
      userMenu={<UserMenu />}
      renderLink={(item, children) => <NavLink item={item}>{children}</NavLink>}
    >
      <Outlet />
    </AppShell>
  );
}
