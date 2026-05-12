import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { apiFetch } from '@typhoon/ui';
import { PanelLeftIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useThreads } from './use-thread';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SidebarContent({
  activeThreadId,
  onNavigate,
  isMobile,
}: {
  activeThreadId?: string;
  onNavigate?: () => void;
  isMobile?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useThreads();

  const deleteThread = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/v1/threads/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      if (deletedId === activeThreadId) {
        navigate({ to: '/chat' });
      }
      onNavigate?.();
    },
  });

  return (
    <>
      <div className="border-border border-b p-3">
        <button
          type="button"
          onClick={() => {
            navigate({ to: '/chat' });
            onNavigate?.();
          }}
          className="bg-primary text-primary-foreground w-full rounded-md px-3 py-2 text-sm font-medium"
        >
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {data?.threads.map((thread) => (
          <div
            key={thread.id}
            className={`border-border group flex items-start gap-2 border-b px-3 py-2.5 ${
              thread.id === activeThreadId ? 'bg-accent' : 'hover:bg-muted'
            }`}
          >
            <button
              type="button"
              className="min-w-0 flex-1 cursor-pointer text-left"
              onClick={() => {
                navigate({ to: '/chat/$threadId', params: { threadId: thread.id } });
                onNavigate?.();
              }}
            >
              <p className="truncate text-sm font-medium">{thread.title || 'Untitled'}</p>
              <p className="text-muted-foreground text-xs">{timeAgo(thread.updatedAt)}</p>
            </button>
            <button
              type="button"
              onClick={() => deleteThread.mutate(thread.id)}
              className={`text-muted-foreground hover:text-destructive shrink-0 transition-opacity ${
                isMobile ? '' : 'opacity-0 group-hover:opacity-100'
              }`}
              title="Delete thread"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <title>Delete</title>
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
        ))}
        {data?.threads.length === 0 && (
          <p className="text-muted-foreground p-4 text-center text-xs">No conversations yet</p>
        )}
      </div>
    </>
  );
}

export function ThreadSidebar({ activeThreadId }: { activeThreadId?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* -- Mobile: conversations bar + inline panel -- */}
      <div className="flex flex-col md:hidden">
        {/* Toggle bar */}
        <div className="flex h-10 items-center gap-2 border-b border-border px-3">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            aria-label={open ? 'Close thread list' : 'Open thread list'}
          >
            {open ? <XIcon className="size-4" /> : <PanelLeftIcon className="size-4" />}
          </button>
          <span className="text-xs font-medium text-muted-foreground">Conversations</span>
        </div>

        {/* Inline overlay panel — positioned relative to chat page container */}
        <div
          className={`absolute inset-x-0 top-10 bottom-0 z-30 flex ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
        >
          {/* Thread list */}
          <div
            className={`flex w-64 shrink-0 flex-col border-r border-border bg-background transition-transform duration-200 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <SidebarContent activeThreadId={activeThreadId} onNavigate={() => setOpen(false)} isMobile />
          </div>
          {/* Backdrop */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: backdrop dismiss */}
          <div
            className={`flex-1 bg-black/50 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setOpen(false)}
          />
        </div>
      </div>

      {/* -- Desktop: fixed sidebar -- */}
      <div className="border-border hidden w-64 shrink-0 flex-col border-r md:flex">
        <SidebarContent activeThreadId={activeThreadId} />
      </div>
    </>
  );
}
