import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '../../lib/utils';

// =============================================================================
// Context
// =============================================================================

interface ConversationContextValue {
  scrollRef: RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  scrollToBottom: () => void;
  performAutoScroll: () => void;
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

function useConversation() {
  const ctx = useContext(ConversationContext);
  if (!ctx) throw new Error('useConversation must be used within <Conversation>');
  return ctx;
}

// =============================================================================
// Components
// =============================================================================

export function Conversation({ children, className }: { children: ReactNode; className?: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const stickyRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      stickyRef.current = true;
    }
  }, []);

  const performAutoScroll = useCallback(() => {
    if (!stickyRef.current) return;
    const el = scrollRef.current;
    if (el?.scrollTo) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 100;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsAtBottom(atBottom);
    stickyRef.current = atBottom;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const ctxValue = useMemo(
    () => ({ scrollRef, isAtBottom, scrollToBottom, performAutoScroll }),
    [scrollRef, isAtBottom, scrollToBottom, performAutoScroll],
  );

  return (
    <ConversationContext.Provider value={ctxValue}>
      <div className={cn('relative flex min-h-0 flex-col overflow-hidden', className)}>{children}</div>
    </ConversationContext.Provider>
  );
}

export function ConversationContent({ children, className }: { children: ReactNode; className?: string }) {
  const { scrollRef, performAutoScroll } = useConversation();

  // Auto-scroll when content changes and user is near the bottom.
  // Uses a ref-based sticky flag (in Conversation) instead of React state
  // to avoid race conditions during rapid streaming updates.
  useEffect(() => {
    performAutoScroll();
  }, [children, performAutoScroll]);

  return (
    <div ref={scrollRef} className={cn('flex-1 overflow-y-auto', className)}>
      {children}
    </div>
  );
}

export function ConversationScrollButton({ className }: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useConversation();

  if (isAtBottom) return null;

  return (
    <div className={cn('absolute inset-x-0 bottom-0 flex justify-center pb-4', className)}>
      <button
        type="button"
        onClick={scrollToBottom}
        className="border-border bg-card text-muted-foreground hover:bg-accent rounded-full border px-3 py-1.5 text-xs shadow-md transition-colors"
      >
        Scroll to bottom
      </button>
    </div>
  );
}

export function ConversationEmptyState({
  icon,
  title,
  description,
  className,
}: {
  icon?: ReactNode;
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex h-full flex-col items-center justify-center gap-4 px-5', className)}>
      {icon}
      {title && <p className="text-muted-foreground/40 text-sm">{title}</p>}
      {description && <p className="text-muted-foreground/30 text-xs">{description}</p>}
    </div>
  );
}
