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
  renderLink?: (item: NavItem, children: ReactNode) => ReactNode;
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
  renderLink?: (item: NavItem, children: ReactNode) => ReactNode;
}

function NavContent({ navGroups, renderLink }: NavContentProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-1.5">
      {navGroups.map((group: NavGroup, groupIdx: number) => (
        <div key={group.label ?? `group-${String(groupIdx)}`}>
          {group.label != null && (
            <p className="mb-1 mt-2.5 px-2 text-2xs font-semibold uppercase tracking-widest text-foreground/50 first:mt-1">
              {group.label}
            </p>
          )}
          {group.items.map((item: NavItem) => {
            const isActive = item.isActive ?? false;

            const row = (
              <div
                key={item.href}
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

            return renderLink != null ? (
              <div key={item.href}>{renderLink(item, row)}</div>
            ) : (
              <DefaultLink key={item.href} href={item.href}>
                {row}
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
  renderLink?: (item: NavItem, children: ReactNode) => ReactNode;
}

function SidebarBody({ navGroups, bottomNavGroups, userMenu, renderLink }: SidebarBodyProps): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <NavContent navGroups={navGroups} renderLink={renderLink} />
      </div>

      {bottomNavGroups != null && bottomNavGroups.length > 0 && (
        <div className="shrink-0">
          <NavContent navGroups={bottomNavGroups} renderLink={renderLink} />
        </div>
      )}

      {userMenu != null && (
        <div className="shrink-0 p-2">
          <div className="h-px bg-border" />
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
    <div className={cn('flex h-screen flex-col overflow-hidden bg-background text-foreground', className)}>
      {/* -- Header -- */}
      <header className="relative z-10 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
        {/* Hamburger / close — mobile only */}
        <button
          type="button"
          aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setMobileOpen((prev) => !prev)}
          className="flex size-8 items-center justify-center text-muted-foreground md:hidden"
        >
          {mobileOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
        </button>

        {/* Logo / wordmark */}
        {logo != null && <div className="flex shrink-0 items-center">{logo}</div>}

        {/* Right: topBarLeft + topBarRight */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {topBarLeft != null && topBarLeft}
          {topBarRight != null && topBarRight}
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
          {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: nav links inside handle keyboard */}
          <div
            className={cn(
              'flex w-[200px] shrink-0 flex-col border-r border-border bg-background transition-transform duration-200 ease-out',
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
          {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: backdrop dismiss */}
          <div
            className={cn(
              'flex-1 bg-black/50 transition-opacity duration-200',
              mobileOpen ? 'opacity-100' : 'opacity-0',
            )}
            onClick={() => setMobileOpen(false)}
          />
        </div>

        {/* -- Desktop nav sidebar -- */}
        <nav className="relative hidden w-[200px] shrink-0 flex-col overflow-visible border-r border-border bg-background md:flex">
          <SidebarBody
            navGroups={navGroups}
            bottomNavGroups={bottomNavGroups}
            userMenu={userMenu}
            renderLink={renderLink}
          />
        </nav>

        {/* -- Main content -- */}
        <main className="grid flex-1 overflow-hidden bg-background">{children}</main>
      </div>
    </div>
  );
}
