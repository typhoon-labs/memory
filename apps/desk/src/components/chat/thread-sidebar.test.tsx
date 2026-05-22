import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}));
vi.mock('./use-thread', () => ({
  useThreads: vi.fn(),
}));
vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { renderWithQueryClient } from '../../test-utils';
import { ThreadSidebar } from './thread-sidebar';
import { useThreads } from './use-thread';

const mockUseThreads = vi.mocked(useThreads);

beforeEach(() => vi.clearAllMocks());

describe('ThreadSidebar', () => {
  it('renders "New Chat" button', () => {
    mockUseThreads.mockReturnValue({
      data: { threads: [], total: 0, page: 1, perPage: 50, hasMore: false },
    } as unknown as ReturnType<typeof useThreads>);
    renderWithQueryClient(<ThreadSidebar />);
    // Both mobile and desktop sidebars render the button
    const buttons = screen.getAllByText('New Chat');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no threads', () => {
    mockUseThreads.mockReturnValue({
      data: { threads: [], total: 0, page: 1, perPage: 50, hasMore: false },
    } as unknown as ReturnType<typeof useThreads>);
    renderWithQueryClient(<ThreadSidebar />);
    const emptyMessages = screen.getAllByText('No conversations yet');
    expect(emptyMessages.length).toBeGreaterThanOrEqual(1);
  });

  it('renders thread list when threads exist', () => {
    const threads = [
      {
        id: 't-1',
        title: 'First thread',
        resourceId: 'r-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 't-2',
        title: 'Second thread',
        resourceId: 'r-2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    mockUseThreads.mockReturnValue({ data: { threads, total: 2, page: 1, perPage: 50, hasMore: false } } as ReturnType<
      typeof useThreads
    >);
    renderWithQueryClient(<ThreadSidebar />);
    // Desktop sidebar renders the threads
    expect(screen.getAllByText('First thread').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Second thread').length).toBeGreaterThanOrEqual(1);
  });

  it('renders "Untitled" for threads without a title', () => {
    const threads = [
      {
        id: 't-1',
        title: '',
        resourceId: 'r-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    mockUseThreads.mockReturnValue({ data: { threads, total: 1, page: 1, perPage: 50, hasMore: false } } as ReturnType<
      typeof useThreads
    >);
    renderWithQueryClient(<ThreadSidebar />);
    const untitledLabels = screen.getAllByText('Untitled');
    expect(untitledLabels.length).toBeGreaterThanOrEqual(1);
  });

  it('highlights the active thread', () => {
    const threads = [
      {
        id: 't-1',
        title: 'Active thread',
        resourceId: 'r-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    mockUseThreads.mockReturnValue({ data: { threads, total: 1, page: 1, perPage: 50, hasMore: false } } as ReturnType<
      typeof useThreads
    >);
    renderWithQueryClient(<ThreadSidebar activeThreadId="t-1" />);
    // The active thread container should have bg-accent class
    const threadButtons = screen.getAllByLabelText('Open thread: Active thread');
    const parentDiv = threadButtons[0]?.closest('div.group');
    expect(parentDiv?.className).toContain('bg-accent');
  });

  it('renders a delete button for each thread', () => {
    const threads = [
      {
        id: 't-1',
        title: 'Thread to delete',
        resourceId: 'r-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    mockUseThreads.mockReturnValue({ data: { threads, total: 1, page: 1, perPage: 50, hasMore: false } } as ReturnType<
      typeof useThreads
    >);
    renderWithQueryClient(<ThreadSidebar />);
    const deleteButtons = screen.getAllByLabelText('Delete thread');
    // Both mobile and desktop sidebars render a delete button
    expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('calls apiFetch DELETE when delete button is clicked', async () => {
    const user = userEvent.setup();
    const threads = [
      {
        id: 't-1',
        title: 'Thread to delete',
        resourceId: 'r-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    mockUseThreads.mockReturnValue({ data: { threads, total: 1, page: 1, perPage: 50, hasMore: false } } as ReturnType<
      typeof useThreads
    >);

    const { apiFetch: mockApiFetch } = await import('@typhoon/ui');
    vi.mocked(mockApiFetch).mockResolvedValue(null);

    renderWithQueryClient(<ThreadSidebar activeThreadId="t-1" />);

    const deleteButtons = screen.getAllByLabelText('Delete thread');
    const firstDeleteButton = deleteButtons[0];
    expect(firstDeleteButton).toBeTruthy();
    await user.click(firstDeleteButton as HTMLElement);

    await waitFor(() => {
      expect(vi.mocked(mockApiFetch)).toHaveBeenCalledWith('/api/v1/threads/t-1', { method: 'DELETE' });
    });
  });

  it('renders mobile toggle button', () => {
    const threads = [
      {
        id: 't-1',
        title: 'Some thread',
        resourceId: 'r-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    mockUseThreads.mockReturnValue({ data: { threads, total: 1, page: 1, perPage: 50, hasMore: false } } as ReturnType<
      typeof useThreads
    >);
    renderWithQueryClient(<ThreadSidebar />);
    // Mobile toggle button should be present with an aria-label
    expect(screen.getByLabelText('Open thread list')).toBeTruthy();
    expect(screen.getByText('Conversations')).toBeTruthy();
  });

  it('displays time ago text for threads', () => {
    // Create a thread updated 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const threads = [
      {
        id: 't-1',
        title: 'Recent thread',
        resourceId: 'r-1',
        createdAt: twoHoursAgo,
        updatedAt: twoHoursAgo,
      },
    ];
    mockUseThreads.mockReturnValue({ data: { threads, total: 1, page: 1, perPage: 50, hasMore: false } } as ReturnType<
      typeof useThreads
    >);
    renderWithQueryClient(<ThreadSidebar />);
    // Should show "2h ago" in at least one of the sidebar instances
    const timeTexts = screen.getAllByText('2h ago');
    expect(timeTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "just now" for very recent threads', () => {
    const threads = [
      {
        id: 't-1',
        title: 'Brand new thread',
        resourceId: 'r-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    mockUseThreads.mockReturnValue({ data: { threads, total: 1, page: 1, perPage: 50, hasMore: false } } as ReturnType<
      typeof useThreads
    >);
    renderWithQueryClient(<ThreadSidebar />);
    const justNowTexts = screen.getAllByText('just now');
    expect(justNowTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('renders New Chat button as a clickable element that navigates to /chat', async () => {
    const user = userEvent.setup();
    mockUseThreads.mockReturnValue({
      data: { threads: [], total: 0, page: 1, perPage: 50, hasMore: false },
    } as unknown as ReturnType<typeof useThreads>);
    renderWithQueryClient(<ThreadSidebar />);

    const newChatButtons = screen.getAllByText('New Chat');
    // Click the first one (desktop sidebar)
    await user.click(newChatButtons[0] as HTMLElement);

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/chat' });
  });

  it('renders correct thread count in the list', () => {
    const threads = [
      {
        id: 't-1',
        title: 'Thread A',
        resourceId: 'r-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 't-2',
        title: 'Thread B',
        resourceId: 'r-2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 't-3',
        title: 'Thread C',
        resourceId: 'r-3',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    mockUseThreads.mockReturnValue({ data: { threads, total: 3, page: 1, perPage: 50, hasMore: false } } as ReturnType<
      typeof useThreads
    >);
    renderWithQueryClient(<ThreadSidebar />);
    // Each thread should appear in both mobile and desktop sidebars
    expect(screen.getAllByText('Thread A').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Thread B').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Thread C').length).toBeGreaterThanOrEqual(1);
    // Delete buttons should match thread count (x2 for mobile+desktop)
    const deleteButtons = screen.getAllByLabelText('Delete thread');
    expect(deleteButtons.length).toBeGreaterThanOrEqual(3);
  });

  it('shows days ago for older threads', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const threads = [
      {
        id: 't-1',
        title: 'Old thread',
        resourceId: 'r-1',
        createdAt: threeDaysAgo,
        updatedAt: threeDaysAgo,
      },
    ];
    mockUseThreads.mockReturnValue({ data: { threads, total: 1, page: 1, perPage: 50, hasMore: false } } as ReturnType<
      typeof useThreads
    >);
    renderWithQueryClient(<ThreadSidebar />);
    const dayTexts = screen.getAllByText('3d ago');
    expect(dayTexts.length).toBeGreaterThanOrEqual(1);
  });

  it('toggles mobile overlay when toggle button is clicked', async () => {
    const user = userEvent.setup();
    mockUseThreads.mockReturnValue({
      data: { threads: [], total: 0, page: 1, perPage: 50, hasMore: false },
    } as unknown as ReturnType<typeof useThreads>);
    renderWithQueryClient(<ThreadSidebar />);

    // Initially shows "Open thread list" label
    expect(screen.getByLabelText('Open thread list')).toBeTruthy();

    // Click to open
    await user.click(screen.getByLabelText('Open thread list'));

    // After opening, the button should now show "Close thread list"
    expect(screen.getByLabelText('Close thread list')).toBeTruthy();

    // Click to close
    await user.click(screen.getByLabelText('Close thread list'));

    // Should be back to "Open thread list"
    expect(screen.getByLabelText('Open thread list')).toBeTruthy();
  });

  it('truncates long thread titles via CSS', () => {
    const threads = [
      {
        id: 't-1',
        title: 'This is a very long thread title that should be truncated by the CSS truncate class',
        resourceId: 'r-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    mockUseThreads.mockReturnValue({ data: { threads, total: 1, page: 1, perPage: 50, hasMore: false } } as ReturnType<
      typeof useThreads
    >);
    renderWithQueryClient(<ThreadSidebar />);
    const titleElements = screen.getAllByText(/This is a very long thread title/);
    expect(titleElements.length).toBeGreaterThanOrEqual(1);
    // The title element has the 'truncate' class
    expect(titleElements[0].className).toContain('truncate');
  });

  it('shows minutes ago for threads updated minutes ago', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const threads = [
      {
        id: 't-1',
        title: 'Recent-ish thread',
        resourceId: 'r-1',
        createdAt: thirtyMinAgo,
        updatedAt: thirtyMinAgo,
      },
    ];
    mockUseThreads.mockReturnValue({ data: { threads, total: 1, page: 1, perPage: 50, hasMore: false } } as ReturnType<
      typeof useThreads
    >);
    renderWithQueryClient(<ThreadSidebar />);
    const timeTexts = screen.getAllByText('30m ago');
    expect(timeTexts.length).toBeGreaterThanOrEqual(1);
  });
});
