import type { ChatStatus } from 'ai';
import { cn } from '../../lib/utils.js';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '../ai-elements/conversation.js';
import { Loader } from '../ai-elements/loader.js';
import type { ChatConfig } from './chat-config.js';
import { ChatConfigProvider } from './chat-config.js';
import { TyphoonComposer } from './typhoon-composer.js';
import { type ChatMessage, TyphoonMessage } from './typhoon-message.js';

export interface TyphoonThreadProps {
  messages: ChatMessage[];
  status: ChatStatus;
  sendMessage: (msg: { text: string }) => void;
  stop?: () => void;
  config?: ChatConfig;
  className?: string;
}

/** Returns true when the last assistant message already contains visible text. */
function lastMessageHasText(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return false;
  return last.parts.some((p) => p.type === 'text' && p.text.length > 0);
}

export function TyphoonThread({ messages, status, sendMessage, stop, config, className }: TyphoonThreadProps) {
  return (
    <ChatConfigProvider config={config ?? {}}>
      <div className={cn('relative flex h-full flex-col', className)}>
        <Conversation className="flex-1">
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState title="Ask Typhoon anything" />
            ) : (
              <div className="mx-auto max-w-[720px] px-5 py-6 pb-40">
                {messages.map((message, idx) => {
                  const isLastAssistant = message.role === 'assistant' && idx === messages.length - 1;
                  const isStreaming = isLastAssistant && (status === 'streaming' || status === 'submitted');
                  return <TyphoonMessage key={message.id} message={message} isStreaming={isStreaming} />;
                })}
                {(status === 'submitted' || (status === 'streaming' && !lastMessageHasText(messages))) && <Loader />}
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <TyphoonComposer sendMessage={sendMessage} stop={stop} status={status} />
      </div>
    </ChatConfigProvider>
  );
}
