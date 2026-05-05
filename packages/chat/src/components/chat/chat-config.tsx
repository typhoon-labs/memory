import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

export interface ChatConfig {
  /** Display name of the current user (shown on user messages). */
  userName?: string;
  /** Called when user gives feedback (thumbs up/down) on a message. null = toggle off. */
  onFeedback?: (messageId: string, rating: 'positive' | 'negative' | null, comment?: string) => void;
  /** Map of messageId to current feedback (rating + optional comment). */
  feedbackState?: Map<string, { rating: 'positive' | 'negative'; comment?: string }>;
  /** Called when user clicks "Open document" on an inline citation. */
  onDocumentOpen?: (documentId: string, options?: { startIndex?: number; chunkText?: string }) => void;
  /** When true, feedback is read-only: only the active rating is shown, clicks are ignored. */
  feedbackReadOnly?: boolean;
  /** When true, tool call steps show expandable debug details. */
  showDebugInfo?: boolean;
}

const ChatConfigContext = createContext<ChatConfig>({});

export function ChatConfigProvider({ config, children }: { config: ChatConfig; children: ReactNode }) {
  return <ChatConfigContext.Provider value={config}>{children}</ChatConfigContext.Provider>;
}

export function useChatConfig(): ChatConfig {
  return useContext(ChatConfigContext);
}
