import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, NavLink, Outlet, Route, Routes } from 'react-router';
import { cn } from '@/lib/utils';
import { queryClient, useFeatured, useSite } from '@/lib/queries';
import { ServiceFooter } from '@/components/service-footer';
import { StatusBanner } from '@/components/status-banner';
import { Home } from '@/pages/home';
import { Register } from '@/pages/register';
import { Search } from '@/pages/search';

const PAGES = [
  ['/', 'Home'],
  ['/search', 'Search'],
  ['/register', 'Register'],
] as const;

function Mark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6">
      <circle cx="6.5" cy="6.5" r="5" fill="#1d5fd1" />
      <rect x="13" y="1.5" width="10" height="10" fill="#2a9d3f" />
      <path d="M6.5 13 12 23H1z" fill="#f07c00" />
      <path d="M18 12.5 23.5 18 18 23.5 12.5 18z" fill="#e0489b" />
    </svg>
  );
}

function Layout() {
  const site = useSite().data;
  useFeatured();
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-6 px-6">
          <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-[-0.01em]">
            <Mark />
            {site?.title}
          </Link>
          <nav aria-label="Pages" className="flex gap-1">
            {PAGES.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-[0.9375rem] font-medium text-muted-foreground hover:text-foreground',
                    isActive && 'bg-secondary text-foreground',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <StatusBanner />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <Outlet />
      </main>
      <ServiceFooter />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="search" element={<Search />} />
            <Route path="register" element={<Register />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
