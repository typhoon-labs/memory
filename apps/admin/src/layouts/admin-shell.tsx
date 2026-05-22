import { Link, Outlet } from '@tanstack/react-router';
import {
  AppShell,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  type NavGroup,
  type NavItem,
  useAuth,
  useSignOut,
} from '@typhoon/ui';
import {
  ActivityIcon,
  ClipboardCheckIcon,
  DatabaseIcon,
  FileTextIcon,
  FlaskConicalIcon,
  FolderSyncIcon,
  GaugeIcon,
  LayersIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  LogOutIcon,
  TagsIcon,
} from 'lucide-react';

import { useQueueEvents } from '../features/queues/use-queue-events';

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/', icon: <LayoutDashboardIcon /> }],
  },
  {
    label: 'Content',
    items: [
      { label: 'Sync Sources', href: '/sources', icon: <FolderSyncIcon /> },
      { label: 'Documents', href: '/documents', icon: <FileTextIcon /> },
    ],
  },
  {
    label: 'Metadata',
    items: [
      { label: 'Templates', href: '/metadata/templates', icon: <TagsIcon /> },
      { label: 'Field Groups', href: '/metadata/field-groups', icon: <LayersIcon /> },
    ],
  },
  {
    label: 'Quality',
    items: [
      { label: 'Reviews', href: '/reviews', icon: <ClipboardCheckIcon /> },
      { label: 'Datasets', href: '/datasets', icon: <DatabaseIcon /> },
      { label: 'Experiments', href: '/experiments', icon: <FlaskConicalIcon /> },
      { label: 'Scorers', href: '/scorers', icon: <GaugeIcon /> },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Traces', href: '/traces', icon: <ActivityIcon /> },
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
          className="hover:bg-accent flex w-full min-w-0 items-center gap-2 rounded-md p-1 text-left transition-colors"
        >
          <div className="bg-primary text-2xs text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full font-medium">
            {user?.email?.charAt(0).toUpperCase() ?? 'A'}
          </div>
          <span className="text-muted-foreground truncate text-xs">{user?.email ?? 'Admin'}</span>
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

export function AdminShell() {
  useQueueEvents();
  return (
    <AppShell
      logo={
        <div className="flex items-baseline gap-1.5">
          <span className="text-base font-bold">Typhoon</span>
          <span className="text-2xs text-muted-foreground font-medium tracking-wider uppercase">Admin</span>
        </div>
      }
      navGroups={NAV_GROUPS}
      userMenu={<UserMenu />}
      renderLink={(item, renderRow) => <NavLink item={item} renderRow={renderRow} />}
    >
      <Outlet />
    </AppShell>
  );
}
