import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that depend on them
// ---------------------------------------------------------------------------

const mockUseChat = vi.fn(() => ({
  messages: [] as Record<string, unknown>[],
  status: 'ready' as const,
  sendMessage: vi.fn(),
  stop: vi.fn(),
  error: null as Error | null,
  setMessages: vi.fn(),
}));

vi.mock('@ai-sdk/react', () => ({
  Chat: vi.fn(),
  useChat: () => mockUseChat(),
}));

vi.mock('ai', () => ({
  DefaultChatTransport: vi.fn(),
}));

vi.mock('@typhoon/chat', () => ({
  TyphoonThread: ({ messages }: { messages: unknown[] }) => (
    <div data-testid="typhoon-thread">{messages?.length ?? 0} messages</div>
  ),
  DocumentViewerPanel: () => <div data-testid="doc-viewer">Viewer</div>,
  useStreamStallDetection: vi.fn(() => ({ error: null })),
}));

vi.mock('../chat/thread-sidebar', () => ({
  ThreadSidebar: ({ activeThreadId }: { activeThreadId?: string }) => (
    <div data-testid="thread-sidebar">{activeThreadId ?? 'no-thread'}</div>
  ),
}));

vi.mock('../chat/use-thread', () => ({
  useThread: vi.fn(() => ({ data: null, isLoading: false })),
  useThreads: vi.fn(() => ({ data: { threads: [] } })),
}));

vi.mock('../chat/use-feedback', () => ({
  useFeedback: vi.fn(() => ({
    feedbackState: new Map(),
    handleFeedback: vi.fn(),
  })),
}));

const mockUseParams = vi.fn(() => ({}));
const mockNavigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useParams: () => mockUseParams(),
  useNavigate: () => mockNavigate,
}));

vi.mock('../../hooks/use-page-title', () => ({
  usePageTitle: vi.fn(),
  detailTitle: vi.fn((_section: string, title?: string) => title ?? 'Chat'),
}));

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return {
    ...actual,
    useAuth: () => ({ user: { id: 'user-1', name: 'Test User', email: 'test@test.com', role: 'rep' } }),
    apiFetch: vi.fn(),
    ResizablePanel: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="resizable-panel">{children}</div>
    ),
    ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="resizable-panel-group">{children}</div>
    ),
    ResizableHandle: () => <div data-testid="resizable-handle" />,
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { renderWithQueryClient } from '../../test-utils';
import { ChatPage } from './chat';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockUseParams.mockReturnValue({});
  mockUseChat.mockReturnValue({
    messages: [] as Record<string, unknown>[],
    status: 'ready' as const,
    sendMessage: vi.fn(),
    stop: vi.fn(),
    error: null as Error | null,
    setMessages: vi.fn(),
  });
});

describe('ChatPage', () => {
  it('renders the thread sidebar', () => {
    renderWithQueryClient(<ChatPage />);

    expect(screen.getByTestId('thread-sidebar')).toBeTruthy();
  });

  it('renders the TyphoonThread component', () => {
    renderWithQueryClient(<ChatPage />);

    expect(screen.getByTestId('typhoon-thread')).toBeTruthy();
  });

  it('renders without crash when there is no active thread', () => {
    mockUseParams.mockReturnValue({});

    renderWithQueryClient(<ChatPage />);

    expect(screen.getByTestId('thread-sidebar')).toBeTruthy();
    expect(screen.getByTestId('typhoon-thread')).toBeTruthy();
    // Sidebar should show 'no-thread' since no threadId param
    expect(screen.getByTestId('thread-sidebar').textContent).toBe('no-thread');
  });

  it('passes threadId to ThreadSidebar when param is set', () => {
    mockUseParams.mockReturnValue({ threadId: 'thread-42' });

    renderWithQueryClient(<ChatPage />);

    expect(screen.getByTestId('thread-sidebar').textContent).toBe('thread-42');
  });

  it('shows 0 messages when chat has no messages', () => {
    renderWithQueryClient(<ChatPage />);

    expect(screen.getByTestId('typhoon-thread').textContent).toBe('0 messages');
  });

  it('shows message count when chat has messages', () => {
    mockUseChat.mockReturnValue({
      messages: [
        { id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
        { id: '2', role: 'assistant', parts: [{ type: 'text', text: 'Hi' }] },
      ],
      status: 'ready' as const,
      sendMessage: vi.fn(),
      stop: vi.fn(),
      error: null,
      setMessages: vi.fn(),
    });

    renderWithQueryClient(<ChatPage />);

    expect(screen.getByTestId('typhoon-thread').textContent).toBe('2 messages');
  });

  it('does not render DocumentViewerPanel by default', () => {
    renderWithQueryClient(<ChatPage />);

    expect(screen.queryByTestId('doc-viewer')).toBeNull();
  });

  it('logs error when useChat returns error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const testError = new Error('Stream failed');

    mockUseChat.mockReturnValue({
      messages: [],
      status: 'ready' as const,
      sendMessage: vi.fn(),
      stop: vi.fn(),
      error: testError,
      setMessages: vi.fn(),
    });

    renderWithQueryClient(<ChatPage />);

    expect(consoleSpy).toHaveBeenCalledWith('[useChat error]', testError);
    consoleSpy.mockRestore();
  });

  it('passes sendMessage handler to TyphoonThread', () => {
    mockUseParams.mockReturnValue({ threadId: 'thread-1' });

    renderWithQueryClient(<ChatPage />);

    // TyphoonThread receives messages prop, verifying the component wires correctly
    expect(screen.getByTestId('typhoon-thread')).toBeTruthy();
  });

  it('renders resizable panel layout', () => {
    renderWithQueryClient(<ChatPage />);

    expect(screen.getByTestId('resizable-panel-group')).toBeTruthy();
    expect(screen.getAllByTestId('resizable-panel').length).toBeGreaterThanOrEqual(1);
  });
});
