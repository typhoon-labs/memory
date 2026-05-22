import { MenuIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { cn } from '../lib/utils';

// =============================================================================
// Types
// =============================================================================

/** A single navigation item in the sidebar. */
export interface NavItem {
  /** Display label. */
  label: string;
  /** Route path or URL. */
  href: string;
  /** Lucide icon element. */
  icon?: ReactNode;
  /** Whether this item is currently active. */
  isActive?: boolean;
}

/** A group of navigation items with an optional heading. */
export interface NavGroup {
  /** Group heading label. Omit for an ungrouped set of items. */
  label?: string;
  /** Navigation items within this group. */
  items: NavItem[];
}

export interface AppShellProps {
  /** Logo element shown in the header. */
  logo?: ReactNode;
  /** Navigation groups rendered in the sidebar body. */
  navGroups: NavGroup[];
  /** Content rendered in the sidebar footer (e.g., user menu). */
  userMenu?: ReactNode;
  /** Content for the header left-center slot (e.g., search). */
  topBarLeft?: ReactNode;
  /** Content for the right side of the header (actions, notifications). */
  topBarRight?: ReactNode;
  /** Render function for navigation links. Allows consumers to use their router's Link component. */
  renderLink?: (item: NavItem, renderRow: (isActive: boolean) => ReactNode) => ReactNode;
  /** Navigation groups pinned to the bottom of the sidebar, above the user menu. */
  bottomNavGroups?: NavGroup[];
  /** Main page content. */
  children: ReactNode;
  /** Additional CSS classes on the outermost wrapper. */
  className?: string;
}

// =============================================================================
// Internal helpers
// =============================================================================

function DefaultLink({ href, children, ...props }: React.ComponentProps<'a'>): React.JSX.Element {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

interface NavContentProps {
  navGroups: NavGroup[];
  renderLink?: (item: NavItem, renderRow: (isActive: boolean) => ReactNode) => ReactNode;
}

function NavContent({ navGroups, renderLink }: NavContentProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-px px-2 py-1.5">
      {navGroups.map((group: NavGroup, groupIdx: number) => (
        <div key={group.label ?? `group-${String(groupIdx)}`} className="flex flex-col gap-px">
          {group.label !== null && group.label !== undefined && (
            <p className="text-2xs text-foreground/50 mt-2.5 mb-1 px-2 font-semibold tracking-widest uppercase first:mt-1">
              {group.label}
            </p>
          )}
          {group.items.map((item: NavItem) => {
            const renderRow = (isActive: boolean) => (
              <div
                className={cn(
                  'flex min-w-0 cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-xs transition-colors duration-75',
                  isActive ? 'bg-accent text-foreground' : 'text-foreground/70 hover:bg-accent hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'shrink-0 [&>svg]:size-4 [&>svg]:shrink-0',
                    isActive ? 'text-accent-foreground' : 'text-foreground/70',
                  )}
                >
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </div>
            );

            return renderLink !== null && renderLink !== undefined ? (
              <div key={item.href}>{renderLink(item, renderRow)}</div>
            ) : (
              <DefaultLink key={item.href} href={item.href}>
                {renderRow(item.isActive ?? false)}
              </DefaultLink>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Sidebar content (shared between desktop and mobile)
// =============================================================================

interface SidebarBodyProps {
  navGroups: NavGroup[];
  bottomNavGroups?: NavGroup[];
  userMenu?: ReactNode;
  renderLink?: (item: NavItem, renderRow: (isActive: boolean) => ReactNode) => ReactNode;
}

function SidebarBody({ navGroups, bottomNavGroups, userMenu, renderLink }: SidebarBodyProps): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <NavContent navGroups={navGroups} renderLink={renderLink} />
      </div>

      {bottomNavGroups !== null && bottomNavGroups !== undefined && bottomNavGroups.length > 0 && (
        <div className="shrink-0">
          <NavContent navGroups={bottomNavGroups} renderLink={renderLink} />
        </div>
      )}

      {userMenu !== null && userMenu !== undefined && (
        <div className="shrink-0 p-2">
          <div className="bg-border h-px" />
          <div className="mt-1.5">{userMenu}</div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// AppShell
// =============================================================================

/**
 * Application shell with a top header and a fixed left nav sidebar.
 * On mobile (<768px) the sidebar becomes an inline overlay panel
 * below the header, keeping the header always visible.
 *
 * Layout (desktop):
 *   +----------------------------------------+  <- header 48px
 *   | logo              topBarLeft topBarRight|
 *   +------+---------------------------------+
 *   | nav  |                                 |
 *   | 200  |         children                |
 *   |      |                                 |
 *   |[user]|                                 |
 *   +------+---------------------------------+
 *
 * Layout (mobile, nav open):
 *   +----------------------------------------+  <- header (always visible)
 *   | [X] logo         topBarLeft topBarRight|
 *   +------+---------------------------------+
 *   | nav  |░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
 *   | 200  |░░░░░ backdrop (tap=close) ░░░░░░|
 *   |      |░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
 *   |[user]|░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
 *   +------+---------------------------------+
 */
export function AppShell({
  logo,
  navGroups,
  bottomNavGroups,
  userMenu,
  topBarLeft,
  topBarRight,
  renderLink,
  children,
  className,
}: AppShellProps): React.JSX.Element {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className={cn('bg-background text-foreground flex h-screen flex-col overflow-hidden', className)}>
      {/* -- Header -- */}
      <header className="border-border bg-background relative z-10 flex h-12 shrink-0 items-center gap-3 border-b px-4">
        {/* Hamburger / close — mobile only */}
        <button
          type="button"
          aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setMobileOpen((prev) => !prev)}
          className="text-muted-foreground flex size-8 items-center justify-center md:hidden"
        >
          {mobileOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
        </button>

        {/* Logo / wordmark */}
        {logo !== null && logo !== undefined && <div className="flex shrink-0 items-center">{logo}</div>}

        {/* Right: topBarLeft + topBarRight */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {topBarLeft !== null && topBarLeft !== undefined && topBarLeft}
          {topBarRight !== null && topBarRight !== undefined && topBarRight}
        </div>
      </header>

      {/* -- Body: nav + main -- */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* -- Mobile nav panel (inline overlay below header) -- */}
        <div
          className={cn(
            'absolute inset-0 z-30 flex md:hidden',
            mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
          )}
        >
          {/* Nav panel */}
          {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- nav links inside handle keyboard */}
          <div
            className={cn(
              'border-border bg-background flex w-[200px] shrink-0 flex-col border-r transition-transform duration-200 ease-out',
              mobileOpen ? 'translate-x-0' : '-translate-x-full',
            )}
            onClick={() => setMobileOpen(false)}
          >
            <SidebarBody
              navGroups={navGroups}
              bottomNavGroups={bottomNavGroups}
              userMenu={userMenu}
              renderLink={renderLink}
            />
          </div>
          {/* Backdrop — tap to close */}
          {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- backdrop dismiss */}
          <div
            className={cn(
              'flex-1 bg-black/50 transition-opacity duration-200',
              mobileOpen ? 'opacity-100' : 'opacity-0',
            )}
            onClick={() => setMobileOpen(false)}
          />
        </div>

        {/* -- Desktop nav sidebar -- */}
        <nav className="border-border bg-background relative hidden w-[200px] shrink-0 flex-col overflow-visible border-r md:flex">
          <SidebarBody
            navGroups={navGroups}
            bottomNavGroups={bottomNavGroups}
            userMenu={userMenu}
            renderLink={renderLink}
          />
        </nav>

        {/* -- Main content -- */}
        <main className="bg-background grid flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden [&>*]:h-full">
          {children}
        </main>
      </div>
    </div>
  );
}
