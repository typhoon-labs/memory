import { Chat, useChat } from '@ai-sdk/react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { TyphoonThread } from '@typhoon/chat';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup, useAuth } from '@typhoon/ui';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ThreadSidebar } from '../chat/thread-sidebar';
import { useFeedback } from '../chat/use-feedback';
import { type ThreadListResponse, useThread } from '../chat/use-thread';
import { DocumentViewerPanel } from './document-viewer-panel';

const TITLE_POLL_INTERVAL = 5_000;
const TITLE_POLL_MAX_ATTEMPTS = 24;

export function ChatPage() {
  const params = useParams({ strict: false }) as { threadId?: string };
  const threadId = params.threadId;
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [viewerDoc, setViewerDoc] = useState<{
    documentId: string;
    startIndex?: number;
    chunkText?: string;
    chunks?: Array<{ startIndex?: number; chunkText?: string }>;
  } | null>(null);
  // Counter forces DocumentViewerPanel remount on every citation click (even the
  // same citation), so detection/highlighting re-runs from a fresh state.
  const viewerTriggerRef = useRef(0);

  // Close document viewer and refresh thread data when switching threads
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-run when threadId changes
  useEffect(() => {
    setViewerDoc(null);
    if (threadId) {
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
    }
  }, [threadId]);

  const userId = user?.id;

  const { data: threadData } = useThread(threadId);
  const { feedbackState, handleFeedback } = useFeedback(threadId);

  const initialMessages = useMemo(
    () => (threadData?.messages as UIMessage[] | undefined) ?? [],
    [threadData?.messages],
  );

  // Persist Chat instances across thread switches so in-flight streams survive.
  // Transport is immutable on Chat, so each thread gets its own instance.
  const chatMapRef = useRef(new Map<string, Chat<UIMessage>>());
  const newThreadIdsRef = useRef(new Set<string>());
  const chatId = threadId ?? 'new';

  if (!chatMapRef.current.has(chatId)) {
    chatMapRef.current.set(
      chatId,
      new Chat({
        id: chatId,
        messages: initialMessages,
        transport: new DefaultChatTransport({
          api: '/api/v1/chat/typhoon-supervisor',
          headers: { Accept: 'text/event-stream' },
          prepareSendMessagesRequest({ messages, trigger }) {
            return {
              body: {
                messages,
                trigger,
                ...(threadId && {
                  memory: { thread: threadId, resource: userId },
                }),
              },
            };
          },
        }),
        onFinish: () => {
          queryClient.invalidateQueries({ queryKey: ['thread', chatId] });
          if (newThreadIdsRef.current.has(chatId)) {
            // Don't invalidate ['threads'] — the server title is still empty
            // and would overwrite the optimistic title with "Untitled".
            // Start polling; the poll callback invalidates ['threads'] once
            // generateTitle has produced a real title.
            setPollingThreadId(chatId);
          } else {
            queryClient.invalidateQueries({ queryKey: ['threads'] });
          }
        },
      }),
    );
  }
  // biome-ignore lint/style/noNonNullAssertion: guaranteed by the block above
  const chat = chatMapRef.current.get(chatId)!;

  const { messages, sendMessage, status, stop, setMessages, error } = useChat({ chat });

  useEffect(() => {
    if (error) console.error('[useChat error]', error);
  }, [error]);

  // Update the thread title in the cache as soon as the setThreadTitle tool
  // result arrives in the stream — directly, without refetching.
  const titleRefreshedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!threadId || titleRefreshedRef.current.has(threadId)) return;

    for (const m of messages) {
      for (const p of m.parts ?? []) {
        const isMatch =
          (p.type === 'tool-setThreadTitle' ||
            ((p as { type: string; toolName?: string }).toolName === 'setThreadTitle' && p.type === 'dynamic-tool')) &&
          (p as { state?: string }).state === 'output-available';
        if (!isMatch) continue;

        const title = (p as { output?: { title?: string } }).output?.title;
        if (!title) continue;

        titleRefreshedRef.current.add(threadId);
        queryClient.setQueryData<ThreadListResponse>(['threads'], (old) =>
          old ? { ...old, threads: old.threads.map((t) => (t.id === threadId ? { ...t, title } : t)) } : old,
        );
        return;
      }
    }
  }, [messages, threadId, queryClient]);

  // Seed messages from server when a Chat was created with empty initial data
  // (e.g. thread data hadn't loaded yet). Skip if the Chat already has messages
  // from a previous visit (preserved in chatMapRef) or from an active stream.
  const seededThreadRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const current = threadId ?? null;
    if (seededThreadRef.current === current) return;

    // Chat from Map already has messages — don't overwrite with server data
    if (messages.length > 0) {
      seededThreadRef.current = current;
      return;
    }

    if (status === 'streaming' || status === 'submitted') {
      seededThreadRef.current = current;
      return;
    }

    if (initialMessages.length > 0) {
      setMessages(initialMessages);
      seededThreadRef.current = current;
    }
  }, [threadId, status, initialMessages, setMessages, messages.length]);

  // Send pending message after auto-creation redirect
  const pendingRef = useRef<{ threadId: string; text: string } | null>(null);
  const [pollingThreadId, setPollingThreadId] = useState<string | null>(null);
  useEffect(() => {
    if (threadId && pendingRef.current && pendingRef.current.threadId === threadId) {
      const text = pendingRef.current.text;
      pendingRef.current = null;
      sendMessage({ text });
    }
  }, [threadId, sendMessage]);

  const prevStatusRef = useRef(status);
  const prevThreadIdRef = useRef(threadId);
  const currentThreadIdRef = useRef(threadId);
  currentThreadIdRef.current = threadId;

  // Refresh thread list + thread data when streaming finishes.
  // When the user switches threads, useChat creates a new Chat instance whose
  // status starts as 'ready'. This looks like a streaming→ready transition but
  // is actually a thread switch — detect via prevThreadIdRef and skip.
  useEffect(() => {
    const threadChanged = prevThreadIdRef.current !== threadId;
    prevThreadIdRef.current = threadId;

    if (threadChanged) {
      prevStatusRef.current = status;
      return;
    }

    if (prevStatusRef.current === 'streaming' && status === 'ready') {
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
      // Skip ['threads'] for new threads — onFinish polling handles it
      // to avoid overwriting the optimistic title with "Untitled".
      if (!threadId || !newThreadIdsRef.current.has(threadId)) {
        queryClient.invalidateQueries({ queryKey: ['threads'] });
      }
    }
    prevStatusRef.current = status;
  }, [status, queryClient, threadId]);

  // Poll for title generation on newly-created threads.
  // Decoupled from thread navigation so it survives thread switches.
  useEffect(() => {
    if (!pollingThreadId) return;

    const controller = new AbortController();
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/v1/threads/${pollingThreadId}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (res.ok) {
          const thread = await res.json();
          if (thread.title) {
            newThreadIdsRef.current.delete(pollingThreadId);
            setPollingThreadId(null);
            queryClient.invalidateQueries({ queryKey: ['threads'] });
            queryClient.invalidateQueries({ queryKey: ['thread', pollingThreadId] });
            clearInterval(timer);
            return;
          }
        }
      } catch {
        /* aborted */
      }
      if (attempts >= TITLE_POLL_MAX_ATTEMPTS) {
        newThreadIdsRef.current.delete(pollingThreadId);
        setPollingThreadId(null);
        queryClient.invalidateQueries({ queryKey: ['threads'] });
        clearInterval(timer);
      }
    }, TITLE_POLL_INTERVAL);

    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [pollingThreadId, queryClient]);

  // Handle new thread auto-creation
  const handleSendMessage = useCallback(
    async (msg: { text: string }) => {
      if (!threadId) {
        const threadIdAtInvocation = currentThreadIdRef.current;

        const res = await fetch('/api/v1/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ title: '' }),
        });
        if (!res.ok) return;
        const thread = await res.json();

        // If the user navigated away during the fetch, don't override their
        // navigation. The thread was created and will appear in the sidebar;
        // onFinish will handle title polling when the stream completes.
        if (currentThreadIdRef.current !== threadIdAtInvocation) {
          newThreadIdsRef.current.add(thread.id);
          return;
        }

        // Optimistic update: show truncated first message as title immediately.
        // The DB title stays empty so Mastra's generateTitle still runs.
        queryClient.setQueryData<ThreadListResponse>(['threads'], (old) =>
          old ? { ...old, threads: [{ ...thread, title: msg.text.slice(0, 100) }, ...old.threads] } : old,
        );
        chatMapRef.current.delete('new');
        newThreadIdsRef.current.add(thread.id);
        pendingRef.current = { threadId: thread.id, text: msg.text };
        navigate({ to: '/chat/$threadId', params: { threadId: thread.id } });
        return;
      }
      sendMessage(msg);
    },
    [threadId, sendMessage, navigate, queryClient],
  );

  return (
    <div className="relative flex h-full flex-col md:flex-row">
      <ThreadSidebar activeThreadId={threadId} />
      {viewerDoc ? (
        <ResizablePanelGroup orientation="horizontal" className="flex-1">
          <ResizablePanel defaultSize={60} minSize={30}>
            <TyphoonThread
              messages={messages}
              status={status}
              sendMessage={handleSendMessage}
              stop={stop}
              config={{
                userName: user?.name ?? user?.email ?? 'You',
                onFeedback: handleFeedback,
                feedbackState,
                onDocumentOpen: (documentId, options) => {
                  viewerTriggerRef.current += 1;
                  setViewerDoc({
                    documentId,
                    startIndex: options?.startIndex,
                    chunkText: options?.chunkText,
                    chunks: options?.chunks,
                  });
                },
              }}
              className="h-full"
            />
          </ResizablePanel>
          <ResizableHandle withHandle className="hidden lg:flex" />
          <ResizablePanel defaultSize={40} minSize={25} className="hidden lg:block">
            <DocumentViewerPanel
              key={`${viewerDoc.documentId}-${String(viewerDoc.startIndex ?? '')}-${viewerTriggerRef.current}`}
              documentId={viewerDoc.documentId}
              searchTerms={[]}
              startIndex={viewerDoc.startIndex}
              chunkText={viewerDoc.chunkText}
              citationChunks={viewerDoc.chunks}
              onClose={() => setViewerDoc(null)}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <TyphoonThread
          messages={messages}
          status={status}
          sendMessage={handleSendMessage}
          stop={stop}
          config={{
            userName: user?.name ?? user?.email ?? 'You',
            onFeedback: handleFeedback,
            feedbackState,
            onDocumentOpen: (documentId, options) =>
              setViewerDoc({
                documentId,
                startIndex: options?.startIndex,
                chunkText: options?.chunkText,
              }),
          }}
          className="flex-1"
        />
      )}
    </div>
  );
}
