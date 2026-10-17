import { createContext, useContext, type ReactNode } from 'react';
import { useChat } from '../hooks/useChat';
import type { Participant } from '../types';

type ChatController = ReturnType<typeof useChat>;

const ChatContext = createContext<ChatController | null>(null);

type ProviderProps = {
  roomId: string;
  participant: Participant;
  onSessionLost: () => void;
  children: ReactNode;
};

export function ChatProvider({ roomId, participant, onSessionLost, children }: ProviderProps) {
  const chat = useChat({ roomId, participant, onSessionLost });
  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatController {
  const value = useContext(ChatContext);
  if (!value) throw new Error('A conversa não está disponível.');
  return value;
}
