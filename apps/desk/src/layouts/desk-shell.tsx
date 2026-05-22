import { Link, Outlet } from '@tanstack/react-router';
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
          className="hover:bg-accent flex w-full min-w-0 items-center gap-2 rounded-md p-1 text-left transition-colors"
        >
          <div className="bg-primary text-2xs text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full font-medium">
            {user?.email?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          <span className="text-muted-foreground truncate text-xs">{user?.email ?? 'User'}</span>
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

function NavLink({ item, renderRow }: { item: NavItem; renderRow: (isActive: boolean) => React.ReactNode }) {
  return (
    <Link to={item.href} activeOptions={{ exact: item.href === '/' }}>
      {({ isActive }) => renderRow(isActive)}
    </Link>
  );
}

export function DeskShell() {
  return (
    <AppShell
      logo={<span className="text-base font-bold">Typhoon</span>}
      navGroups={NAV_GROUPS}
      userMenu={<UserMenu />}
      renderLink={(item, renderRow) => <NavLink item={item} renderRow={renderRow} />}
    >
      <Outlet />
    </AppShell>
  );
}
