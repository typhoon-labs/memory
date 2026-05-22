import type { ChatStatus } from 'ai';
import { SendHorizontalIcon, SquareIcon } from 'lucide-react';
import { useCallback, useState } from 'react';

import { PromptInput, PromptInputSubmit, PromptInputTextarea } from '../ai-elements/prompt-input';

export function TyphoonComposer({
  sendMessage,
  stop,
  status,
}: {
  sendMessage: (msg: { text: string }) => void;
  stop?: () => void;
  status: ChatStatus;
}) {
  const [input, setInput] = useState('');
  const isStreaming = status === 'streaming' || status === 'submitted';

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    if (isStreaming) {
      stop?.();
      return;
    }
    sendMessage({ text });
    setInput('');
  }, [input, isStreaming, sendMessage, stop]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center">
      <div className="from-background via-background/70 absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t to-transparent" />
      <div className="pointer-events-auto relative z-10 w-[min(720px,100%)] px-5 pt-3 pb-5">
        <PromptInput
          onSubmit={handleSubmit}
          className="border-border bg-card flex items-end gap-2 rounded-xl border p-2.5 shadow-lg shadow-black/50 transition-shadow duration-150 focus-within:shadow-black/60"
        >
          <PromptInputTextarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional focus for chat composer
            autoFocus
          />
          <PromptInputSubmit status={isStreaming ? 'streaming' : 'ready'}>
            {isStreaming ? <SquareIcon className="size-3" /> : <SendHorizontalIcon className="size-3.5" />}
          </PromptInputSubmit>
        </PromptInput>
      </div>
    </div>
  );
}
