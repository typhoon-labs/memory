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
import { useThread } from '../chat/use-thread.js';

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

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    id: threadId ?? 'new',
    transport,
  });

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const statusRef = useRef(status);
  statusRef.current = status;
  const needsResyncRef = useRef(false);
  const prevStatusRef = useRef(status);

  // When a request finishes (success or error), mark resync needed and refresh data.
  useEffect(() => {
    const prev = prevStatusRef.current;
    const wasActive = prev === 'streaming' || prev === 'submitted';
    const isIdle = status === 'ready' || status === 'error';
    if (wasActive && isIdle) {
      needsResyncRef.current = true;
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
    }
    prevStatusRef.current = status;
  }, [status, queryClient, threadId]);

  // Seed messages on initial load, and resync when fresh server data arrives
  // after streaming. Uses refs for messages/status so this effect only fires
  // when initialMessages actually changes — never from local message updates.
  useEffect(() => {
    if (initialMessages.length === 0) return;
    if (messagesRef.current.length === 0) {
      setMessages(initialMessages);
      return;
    }
    const idle = statusRef.current === 'ready' || statusRef.current === 'error';
    if (needsResyncRef.current && idle) {
      needsResyncRef.current = false;
      setMessages(initialMessages);
    }
  }, [initialMessages, setMessages]);

  // Send pending message after auto-creation redirect
  const pendingRef = useRef<string | null>(null);
  useEffect(() => {
    if (threadId && pendingRef.current) {
      const text = pendingRef.current;
      pendingRef.current = null;
      sendMessage({ text });
    }
  }, [threadId, sendMessage]);

  // Handle new thread auto-creation
  const handleSendMessage = useCallback(
    (msg: { text: string }) => {
      if (!threadId) {
        const newThreadId = crypto.randomUUID();
        pendingRef.current = msg.text;
        navigate({ to: '/chat/$threadId', params: { threadId: newThreadId } });
        return;
      }
      sendMessage(msg);
    },
    [threadId, sendMessage, navigate],
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
