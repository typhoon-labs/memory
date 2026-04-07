import { useChat } from '@ai-sdk/react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { TyphoonThread } from '@typhoon/chat';
import { useAuth } from '@typhoon/ui';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ThreadSidebar } from '../chat/thread-sidebar.js';
import { useFeedback } from '../chat/use-feedback.js';
import { type ThreadListResponse, useThread } from '../chat/use-thread.js';

const TITLE_POLL_INTERVAL = 2_000;
const TITLE_POLL_MAX_ATTEMPTS = 10;

export function ChatPage() {
  const params = useParams({ strict: false }) as { threadId?: string };
  const threadId = params.threadId;
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const userId = user?.id;
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/v1/chat/typhoon-supervisor',
        prepareSendMessagesRequest({ messages, trigger }) {
          return {
            body: {
              messages,
              trigger,
              ...(threadId && {
                memory: {
                  thread: threadId,
                  resource: userId,
                },
              }),
            },
          };
        },
      }),
    [threadId, userId],
  );

  const { data: threadData } = useThread(threadId);
  const { feedbackState, handleFeedback } = useFeedback(threadId);

  const initialMessages = useMemo(
    () => (threadData?.messages as UIMessage[] | undefined) ?? [],
    [threadData?.messages],
  );

  const { messages, sendMessage, status, stop, setMessages, error } = useChat({
    id: threadId ?? 'new',
    transport,
  });

  useEffect(() => {
    if (error) console.error('[useChat error]', error);
  }, [error]);

  // Seed / sync messages from server whenever server data changes.
  // Intentionally excludes `messages` from deps so it doesn't fire on every
  // streaming update — that would overwrite in-flight messages from useChat.
  useEffect(() => {
    if (initialMessages.length === 0) return;
    setMessages(initialMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessages, setMessages]);

  // Send pending message after auto-creation redirect
  const pendingRef = useRef<string | null>(null);
  const isNewThreadRef = useRef(false);
  useEffect(() => {
    if (threadId && pendingRef.current) {
      const text = pendingRef.current;
      pendingRef.current = null;
      sendMessage({ text });
    }
  }, [threadId, sendMessage]);

  const prevStatusRef = useRef(status);

  // Refresh thread list + thread data when streaming finishes
  useEffect(() => {
    if (prevStatusRef.current === 'streaming' && status === 'ready') {
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });

      if (isNewThreadRef.current) {
        // Poll for async title generation to complete.
        // The DB title starts empty; any non-empty value means generateTitle finished.
        const controller = new AbortController();
        let attempts = 0;
        const timer = setInterval(async () => {
          attempts++;
          try {
            const res = await fetch(`/api/v1/threads/${threadId}`, {
              credentials: 'include',
              signal: controller.signal,
            });
            if (res.ok) {
              const thread = await res.json();
              if (thread.title) {
                isNewThreadRef.current = false;
                queryClient.invalidateQueries({ queryKey: ['threads'] });
                clearInterval(timer);
                return;
              }
            }
          } catch {
            /* aborted */
          }
          if (attempts >= TITLE_POLL_MAX_ATTEMPTS) {
            isNewThreadRef.current = false;
            clearInterval(timer);
          }
        }, TITLE_POLL_INTERVAL);

        prevStatusRef.current = status;
        return () => {
          clearInterval(timer);
          controller.abort();
        };
      }

      queryClient.invalidateQueries({ queryKey: ['threads'] });
    }
    prevStatusRef.current = status;
  }, [status, queryClient, threadId]);

  // Handle new thread auto-creation
  const handleSendMessage = useCallback(
    async (msg: { text: string }) => {
      if (!threadId) {
        const res = await fetch('/api/v1/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ title: '' }),
        });
        if (!res.ok) return;
        const thread = await res.json();
        // Optimistic update: show truncated first message as title immediately.
        // The DB title stays empty so Mastra's generateTitle still runs.
        queryClient.setQueryData<ThreadListResponse>(['threads'], (old) =>
          old ? { ...old, threads: [{ ...thread, title: msg.text.slice(0, 100) }, ...old.threads] } : old,
        );
        isNewThreadRef.current = true;
        pendingRef.current = msg.text;
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
      <TyphoonThread
        messages={messages}
        status={status}
        sendMessage={handleSendMessage}
        stop={stop}
        config={{ userName: user?.name ?? user?.email ?? 'You', onFeedback: handleFeedback, feedbackState }}
        className="flex-1"
      />
    </div>
  );
}
