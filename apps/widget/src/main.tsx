import './main.css';
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

// Read configuration from the script tag's data attributes
const scriptTag = document.querySelector('script[data-typhoon-api-key]');
const apiKey = scriptTag?.getAttribute('data-typhoon-api-key') ?? '';
const serverUrl = scriptTag?.getAttribute('data-typhoon-server') ?? '';
const widgetTitle = scriptTag?.getAttribute('data-typhoon-title') ?? 'Typhoon Support';
const widgetTheme = scriptTag?.getAttribute('data-typhoon-theme') ?? 'light';

const STORAGE_KEY = `typhoon:thread:${apiKey}`;
const RESOURCE_ID = `widget:${apiKey}`;

function getOrCreateThreadId(): string {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}

function TyphoonWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [threadId, setThreadId] = useState(() => getOrCreateThreadId());
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${serverUrl}/api/v1/widget/chat`,
        headers: { 'X-API-Key': apiKey },
        prepareSendMessagesRequest({ messages, trigger }) {
          return {
            body: {
              messages,
              trigger,
              memory: {
                thread: threadIdRef.current,
                resource: RESOURCE_ID,
              },
            },
          };
        },
      }),
    [],
  );

  const { messages, sendMessage, status, stop, setMessages, error } = useChat({
    id: threadId,
    transport,
  });

  // Detect stalled streams (server dies mid-stream, AI SDK hangs forever).
  // Uses 60s timeout when a tool call is executing, 15s otherwise.
  const lastActivityRef = useRef(Date.now());
  const messagesLenRef = useRef(messages.length);
  const lastContentRef = useRef('');
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [stallError, setStallError] = useState<Error | null>(null);
  useEffect(() => {
    const content = messages.at(-1)?.parts?.length?.toString() ?? '';
    if (messages.length !== messagesLenRef.current || content !== lastContentRef.current) {
      messagesLenRef.current = messages.length;
      lastContentRef.current = content;
      lastActivityRef.current = Date.now();
    }
  }, [messages]);
  useEffect(() => {
    if (status === 'submitted') {
      setStallError(null);
      lastActivityRef.current = Date.now();
    }
  }, [status]);
  useEffect(() => {
    if (status !== 'streaming' && status !== 'submitted') return;
    const interval = setInterval(() => {
      const last = messagesRef.current.at(-1);
      const hasPendingTool =
        last?.role === 'assistant' &&
        last.parts.some(
          (p) =>
            p.type.startsWith('tool-') &&
            !['output-available', 'output-error', 'output-denied'].includes((p as { state?: string }).state ?? ''),
        );
      const timeout = hasPendingTool ? 60_000 : 15_000;
      if (Date.now() - lastActivityRef.current > timeout) {
        stop();
        setStallError(new Error('Connection lost'));
        clearInterval(interval);
      }
    }, 5_000);
    return () => clearInterval(interval);
  }, [status, stop]);
  const chatError = error ?? stallError;

  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      sendMessage({ text: input });
      setInput('');
    },
    [input, isLoading, sendMessage],
  );

  const handleNewConversation = useCallback(() => {
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    setThreadId(id);
    threadIdRef.current = id;
    setMessages([]);
  }, [setMessages]);

  if (!apiKey) return null;

  return (
    <>
      {/* Floating toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="typhoon-toggle"
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? '\u2715' : '\u{1F4AC}'}
      </button>

      {/* Chat popup */}
      {isOpen && (
        <div className="typhoon-popup">
          <div className="typhoon-header">
            <span className="typhoon-header-title">{widgetTitle}</span>
            <button type="button" onClick={handleNewConversation} className="typhoon-new-btn" title="New conversation">
              +
            </button>
          </div>

          <div ref={scrollRef} className="typhoon-messages">
            {messages.length === 0 && <p className="typhoon-welcome">Hello! How can I help you today?</p>}
            {messages.map((msg: UIMessage) => (
              <div key={msg.id} className={`typhoon-msg ${msg.role === 'user' ? 'typhoon-msg-user' : 'typhoon-msg-assistant'}`}>
                {msg.parts
                  .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                  .map((p) => p.text)
                  .join('')}
              </div>
            ))}
            {isLoading && messages.at(-1)?.role !== 'assistant' && (
              <div className="typhoon-msg typhoon-msg-assistant typhoon-thinking">Thinking…</div>
            )}
            {chatError && !isLoading && (
              <div className="typhoon-msg typhoon-msg-assistant typhoon-error">Something went wrong. Please try again.</div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="typhoon-input-area">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question..."
              aria-label="Type your question"
              className="typhoon-input"
            />
            {isLoading ? (
              <button type="button" onClick={stop} className="typhoon-send-btn typhoon-stop-btn">
                Stop
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} className="typhoon-send-btn">
                Send
              </button>
            )}
          </form>
        </div>
      )}
    </>
  );
}

const container =
  document.getElementById('typhoon-widget-root') ??
  (() => {
    const el = document.createElement('div');
    el.id = 'typhoon-widget-root';
    document.body.appendChild(el);
    return el;
  })();

// Apply theme class for CSS variable overrides
if (widgetTheme === 'dark') {
  container.classList.add('typhoon-dark');
} else if (widgetTheme === 'auto') {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (prefersDark) container.classList.add('typhoon-dark');
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    container.classList.toggle('typhoon-dark', e.matches);
  });
}

createRoot(container).render(
  <StrictMode>
    <TyphoonWidget />
  </StrictMode>,
);
