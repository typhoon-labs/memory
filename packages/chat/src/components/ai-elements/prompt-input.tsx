import { createContext, type KeyboardEvent, type ReactNode, useCallback, useContext, useRef } from 'react';
import { cn } from '../../lib/utils';

// =============================================================================
// Context
// =============================================================================

interface PromptInputContextValue {
  submit: () => void;
}

const PromptInputContext = createContext<PromptInputContextValue | null>(null);

// =============================================================================
// Components
// =============================================================================

export function PromptInput({
  children,
  onSubmit,
  className,
}: {
  children: ReactNode;
  onSubmit: () => void;
  className?: string;
}) {
  return (
    <PromptInputContext.Provider value={{ submit: onSubmit }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className={className}
      >
        {children}
      </form>
    </PromptInputContext.Provider>
  );
}

export function PromptInputTextarea({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
  onKeyDown,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const ctx = useContext(PromptInputContext);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        ctx?.submit();
      }
      onKeyDown?.(e);
    },
    [ctx, onKeyDown],
  );

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      // biome-ignore lint/a11y/noAutofocus: composer needs focus on mount
      autoFocus={autoFocus}
      rows={1}
      className={cn(
        'min-h-[22px] max-h-[120px] flex-1 resize-none overflow-y-auto field-sizing-content bg-transparent px-1 py-0.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/65 focus-visible:outline-none',
        className,
      )}
      {...rest}
    />
  );
}

export function PromptInputSubmit({
  className,
  disabled,
  status,
  children,
}: {
  className?: string;
  disabled?: boolean;
  status?: 'ready' | 'streaming';
  children?: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={cn(
        'flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-85 disabled:opacity-40',
        className,
      )}
    >
      {children ??
        (status === 'streaming' ? (
          <div className="size-3 rounded-sm bg-current" />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5"
            aria-hidden="true"
          >
            <title>Send</title>
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        ))}
    </button>
  );
}
