import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Renders a component wrapped in QueryClientProvider with a fresh, isolated
 * QueryClient per call (no retries, zero GC time to prevent cross-test leakage).
 */
export function renderWithQueryClient(ui: React.ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  const queryClient = createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return { ...render(ui, { wrapper: Wrapper, ...options }), queryClient };
}
