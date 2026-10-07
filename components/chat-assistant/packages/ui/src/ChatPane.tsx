/**
 * The chat pane: what was asked or pressed, and what came back.
 *
 * A question and its answer are a conversation. A button pressed on the card
 * is drawn apart from that, as one entry: the button's words, and what the
 * action came to. A refusal says which layer refused, in words, with an icon
 * and a color of its own (./Callout).
 */
import { ArrowUpIcon, CheckIcon, MousePointerClickIcon } from 'lucide-react';
import type { FormEvent, KeyboardEvent, RefObject } from 'react';
import { Callout, type Outcome } from './Callout';
import { Markdown } from './markdown';
import { cn } from '@/lib/utils';

export interface ChatEntry {
  id: number;
  kind: 'you' | 'assistant' | 'action';
  /** What was typed, what the assistant answered, or what the action came to. */
  text: string;
  /** For an action: the words on the button. */
  label?: string;
  pending?: boolean;
  /** Set when the answer was a refusal or a failure; it is drawn in place of the text. */
  problem?: Outcome;
}

// Each can be answered from the incident record. Pressing one fills the box; it is sent like any other message.
const EXAMPLES = ['What is failing, and since when?', 'What changed before the errors started?', 'What does the diagnosis recommend?'];

function Entry({ entry, you }: { entry: ChatEntry; you: string }) {
  if (entry.kind === 'you') {
    return (
      <p className="max-w-[85%] self-end rounded-xl rounded-br-[3px] bg-secondary px-3 py-1.5 whitespace-pre-wrap [overflow-wrap:anywhere]">
        <span className="sr-only">{you}: </span>
        {entry.text}
      </p>
    );
  }

  if (entry.kind === 'action') {
    return (
      <div className="rounded-lg border text-sm">
        <p className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground">
          <MousePointerClickIcon aria-hidden className="size-4 shrink-0" />
          <span>
            You pressed <strong className="font-medium text-foreground">{entry.label}</strong>
          </span>
        </p>
        {entry.pending ? (
          <p role="status" className="flex items-center gap-2 border-t px-3 py-2">
            <i aria-hidden className="spinner size-3.5" />
            Working
          </p>
        ) : entry.problem ? (
          <Callout {...entry.problem} className="rounded-t-none border-x-0 border-b-0" />
        ) : (
          <div className="flex items-start gap-2 border-t px-3 py-2">
            <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
            <Markdown text={entry.text} className="[overflow-wrap:anywhere]" />
          </div>
        )}
      </div>
    );
  }

  if (entry.problem) return <Callout {...entry.problem} />;
  if (entry.text) {
    return (
      <div className="max-w-[60ch]">
        <span className="sr-only">Assistant: </span>
        <Markdown text={entry.text} className="[overflow-wrap:anywhere]" />
      </div>
    );
  }
  return entry.pending ? (
    <div role="status" aria-label="Working" className="grid gap-2 pt-1">
      <i className="h-2.5 w-4/5 animate-pulse rounded bg-well" />
      <i className="h-2.5 w-3/5 animate-pulse rounded bg-well" />
    </div>
  ) : null;
}

export function ChatPane({
  chat,
  you,
  draft,
  busy,
  log,
  onDraft,
  onSubmit,
  className,
}: {
  chat: ChatEntry[];
  /** The signed-in user's name, for a screen reader. */
  you: string;
  draft: string;
  busy: boolean;
  log: RefObject<HTMLDivElement | null>;
  onDraft: (text: string) => void;
  onSubmit: (event: FormEvent) => void;
  /** Where the pane stands on the page, which is the page's to say. */
  className?: string;
}) {
  // Enter sends; Shift+Enter starts a new line.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    // Beside the incident the pane is as tall as the window under the bar at the top, and stays
    // there while the window scrolls the incident: the message box is always at its foot.
    // In one column it comes after the incident and its log has a height of its own.
    <aside aria-label="Chat" className={cn('flex min-h-0 flex-col border-t min-[60rem]:border-t-0 min-[60rem]:border-l', className)}>
      <div
        ref={log}
        aria-live="polite"
        className="flex max-h-96 min-h-48 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pt-6 pb-2 [scrollbar-width:thin] min-[60rem]:max-h-none min-[60rem]:pt-8"
      >
        {chat.length === 0 && (
          <div className="mt-auto max-w-[34ch] text-sm text-muted-foreground">
            <p className="text-[0.9375rem] font-semibold text-foreground">Ask about the incident</p>
            <p>The assistant answers from the incident record. It cannot change anything.</p>
          </div>
        )}
        {chat.map((entry) => (
          <Entry key={entry.id} entry={entry} you={you} />
        ))}
      </div>
      {chat.length === 0 && (
        <div className="grid px-3">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onDraft(example)}
              className="rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground outline-offset-[-2px] hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {example}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={onSubmit}
        className="m-4 mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-xl border border-input py-2 pr-2 pl-3 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-ring"
      >
        <textarea
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Ask about the incident"
          aria-label="Message"
          disabled={busy}
          className="field-sizing-content max-h-32 min-h-8 resize-none bg-transparent py-1 leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={busy || !draft.trim()}
          className="grid size-8 place-items-center rounded-full bg-foreground text-background outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring disabled:bg-well disabled:text-faint"
        >
          <ArrowUpIcon aria-hidden className="size-4" strokeWidth={2.5} />
        </button>
      </form>
    </aside>
  );
}
