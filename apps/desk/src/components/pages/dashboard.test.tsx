import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/use-page-title', () => ({ usePageTitle: vi.fn() }));
vi.mock('../dashboard/conversation-activity', () => ({
  ConversationActivity: () => <div data-testid="conversation-activity">ConversationActivity</div>,
}));
vi.mock('../dashboard/conversation-volume', () => ({
  ConversationVolume: () => <div data-testid="conversation-volume">ConversationVolume</div>,
}));
vi.mock('../dashboard/quick-access', () => ({
  QuickAccess: () => <div data-testid="quick-access">QuickAccess</div>,
}));
vi.mock('../dashboard/widget-card', () => ({
  WidgetCard: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid="widget-card">
      <span>{title}</span>
      {children}
    </div>
  ),
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return {
    ...actual,
    apiFetch: vi.fn(),
    useAuth: () => ({ user: { name: 'Test User', email: 'test@test.com', role: 'admin' } }),
    StatCard: ({ label, value }: { label: string; value: string | number }) => (
      <div data-testid={`stat-${label.toLowerCase()}`}>
        {label}: {value}
      </div>
    ),
  };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../test-utils';
import { DashboardPage } from './dashboard';

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => vi.clearAllMocks());

describe('DashboardPage', () => {
  it('renders greeting with user first name', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<DashboardPage />);
    // Greeting should include the user's first name
    expect(screen.getByText(/Test/)).toBeTruthy();
  });

  it('renders page subtitle', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<DashboardPage />);
    expect(screen.getByText('Overview of your knowledge base and conversations')).toBeTruthy();
  });

  it('renders stat cards with loading placeholders', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<DashboardPage />);
    expect(screen.getByTestId('stat-conversations')).toBeTruthy();
    expect(screen.getByTestId('stat-today')).toBeTruthy();
    expect(screen.getByTestId('stat-satisfaction')).toBeTruthy();
    expect(screen.getByTestId('stat-documents')).toBeTruthy();
  });

  it('renders dashboard widgets', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<DashboardPage />);
    expect(screen.getByTestId('conversation-activity')).toBeTruthy();
    expect(screen.getByTestId('conversation-volume')).toBeTruthy();
    expect(screen.getByTestId('quick-access')).toBeTruthy();
  });

  it('displays document count when data loads', async () => {
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents'))
        return Promise.resolve([{ status: 'ready' }, { status: 'ready' }, { status: 'pending' }]);
      if (String(url).includes('/threads'))
        return Promise.resolve({ threads: [], total: 5, page: 1, perPage: 20, hasMore: false });
      if (String(url).includes('/feedback')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<DashboardPage />);

    // Wait for the documents stat to update with the loaded count
    await waitFor(() => {
      const docStat = screen.getByTestId('stat-documents');
      expect(docStat.textContent).toContain('3');
    });
  });

  it('renders greeting based on time of day', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<DashboardPage />);
    // getGreeting returns "Good morning", "Good afternoon", or "Good evening"
    expect(screen.getByText(/Good (morning|afternoon|evening)/)).toBeTruthy();
  });

  it('displays conversation total and today count with data', async () => {
    const now = new Date().toISOString();
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents')) return Promise.resolve([]);
      if (String(url).includes('/threads'))
        return Promise.resolve({
          threads: [
            { id: 't1', title: 'Thread 1', createdAt: now, updatedAt: now },
            { id: 't2', title: 'Thread 2', createdAt: now, updatedAt: now },
          ],
          total: 10,
          page: 1,
          perPage: 20,
          hasMore: false,
        });
      if (String(url).includes('/feedback')) return Promise.resolve([]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<DashboardPage />);

    await waitFor(() => {
      const convStat = screen.getByTestId('stat-conversations');
      expect(convStat.textContent).toContain('10');
      const todayStat = screen.getByTestId('stat-today');
      expect(todayStat.textContent).toContain('2');
    });
  });

  it('displays satisfaction percentage with feedback data', async () => {
    const now = new Date().toISOString();
    mockApiFetch.mockImplementation((url: string | URL | Request) => {
      if (String(url).includes('/documents')) return Promise.resolve([]);
      if (String(url).includes('/threads'))
        return Promise.resolve({ threads: [], total: 0, page: 1, perPage: 20, hasMore: false });
      if (String(url).includes('/feedback'))
        return Promise.resolve([
          { id: 'f1', rating: 'positive', createdAt: now },
          { id: 'f2', rating: 'positive', createdAt: now },
          { id: 'f3', rating: 'negative', createdAt: now },
          { id: 'f4', rating: 'positive', createdAt: now },
        ]);
      return Promise.resolve(null);
    });

    renderWithQueryClient(<DashboardPage />);

    await waitFor(() => {
      const satStat = screen.getByTestId('stat-satisfaction');
      // 3 positive out of 4 = 75%
      expect(satStat.textContent).toContain('75%');
    });
  });
});
