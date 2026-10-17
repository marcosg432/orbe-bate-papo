import { useEffect, useRef, useState } from 'react';
import { ApiError, getMessages, isMessage } from '../services/api';
import { createMessageId } from '../services/ids';
import { mergeLatest, compareMessages, upsertMessage } from '../services/messages';
import { createChatSocket, isSendAck, type ChatSocket } from '../services/socket';
import type { ChatMessage, ConnectionState, MessagePage, OnlineParticipant, Participant } from '../types';

const PAGE_SIZE = 50;

type UseChatOptions = {
  roomId: string;
  participant: Participant;
  onSessionLost: () => void;
};

export function useChat({ roomId, participant, onSessionLost }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [presence, setPresence] = useState<OnlineParticipant[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const hasMoreRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const connectionRef = useRef<ConnectionState>('connecting');
  const onSessionLostRef = useRef(onSessionLost);
  const socketRef = useRef<ChatSocket | null>(null);
  onSessionLostRef.current = onSessionLost;

  function commit(next: ChatMessage[]) {
    messagesRef.current = next;
    setMessages(next);
  }

  function rememberMore(value: boolean) {
    hasMoreRef.current = value;
    setHasMore(value);
  }

  useEffect(() => {
    let stopped = false;
    const socket = createChatSocket(roomId);
    socketRef.current = socket;
    const lose = () => {
      if (stopped) return;
      stopped = true;
      onSessionLostRef.current();
    };

    const applyPage = (page: MessagePage, replaceOlder: boolean) => {
      const merged = replaceOlder
        ? page.messages.map((item) => ({ ...item, status: 'sent' as const }))
        : mergeLatest(messagesRef.current, page.messages);
      commit(merged);
      const keptOlder = merged.some((item) => item.status === 'sent' && !page.messages.some((server) => server.id === item.id));
      rememberMore(keptOlder ? hasMoreRef.current : page.hasMore);
    };

    const refresh = async (initial: boolean) => {
      try {
        const page = await getMessages(roomId, { limit: PAGE_SIZE });
        if (stopped) return;
        applyPage(page, initial && messagesRef.current.length === 0);
        setLoadError(null);
        if (initial) setLoading(false);
      } catch (error) {
        if (stopped) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          lose();
          return;
        }
        if (initial) {
          setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar as mensagens.');
          setLoading(false);
        }
      }
    };

    socket.on('connect', () => {
      const restored = connectionRef.current === 'reconnecting';
      connectionRef.current = 'online';
      setConnection('online');
      if (restored) setNotice('Conexão restabelecida.');
      void refresh(false);
    });

    socket.on('disconnect', (reason) => {
      if (stopped) return;
      if (reason === 'io server disconnect') {
        lose();
        return;
      }
      connectionRef.current = 'reconnecting';
      setConnection('reconnecting');
      setNotice(null);
    });

    socket.on('connect_error', (error) => {
      if (error.message === 'unauthorized') {
        lose();
        return;
      }
      connectionRef.current = 'reconnecting';
      setConnection('reconnecting');
    });

    socket.on('session:expired', () => {
      lose();
    });

    socket.on('message:new', (message) => {
      if (!isMessage(message) || message.roomId !== roomId) return;
      const next = upsertMessage(messagesRef.current, message);
      commit(next);
    });

    socket.on('presence:update', (payload) => {
      if (!payload || !Array.isArray(payload.participants)) return;
      const people = payload.participants.filter(
        (person) => person && typeof person.id === 'string' && typeof person.displayName === 'string',
      );
      setPresence(people);
    });

    void refresh(true);

    return () => {
      stopped = true;
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function emit(clientMessageId: string, content: string) {
    const socket = socketRef.current;
    if (!socket?.connected) {
      commit(messagesRef.current.map((item) => (item.clientMessageId === clientMessageId ? { ...item, status: 'failed' } : item)));
      return;
    }
    socket.timeout(10000).emit('message:send', { clientMessageId, content }, (error: unknown, response: unknown) => {
      if (error || !isSendAck(response) || !response.ok) {
        commit(messagesRef.current.map((item) => (item.clientMessageId === clientMessageId ? { ...item, status: 'failed' } : item)));
        if (isSendAck(response) && !response.ok && response.code === 'session_expired') onSessionLostRef.current();
        return;
      }
      commit(upsertMessage(messagesRef.current, response.message));
    });
  }

  function send(content: string) {
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > 2000) return;
    const clientMessageId = createMessageId();
    const optimistic: ChatMessage = {
      id: `local-${clientMessageId}`,
      roomId,
      participantId: participant.id,
      displayName: participant.displayName,
      content: trimmed,
      createdAt: new Date().toISOString(),
      clientMessageId,
      status: 'pending',
    };
    commit([...messagesRef.current, optimistic].sort(compareMessages));
    emit(clientMessageId, trimmed);
  }

  function retry(clientMessageId: string) {
    const message = messagesRef.current.find((item) => item.clientMessageId === clientMessageId);
    if (!message) return;
    commit(messagesRef.current.map((item) => (item.clientMessageId === clientMessageId ? { ...item, status: 'pending' } : item)));
    emit(clientMessageId, message.content);
  }

  async function loadOlder() {
    const oldest = messagesRef.current.find((item) => item.status === 'sent');
    if (!oldest || !hasMoreRef.current || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const page = await getMessages(roomId, {
        limit: PAGE_SIZE,
        beforeCreatedAt: oldest.createdAt,
        beforeId: oldest.id,
      });
      const known = new Set(messagesRef.current.map((item) => item.id));
      const older = page.messages
        .filter((item) => !known.has(item.id))
        .map((item) => ({ ...item, status: 'sent' as const }));
      commit([...older, ...messagesRef.current].sort(compareMessages));
      rememberMore(page.hasMore);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        onSessionLostRef.current();
        return;
      }
      setNotice(error instanceof Error ? error.message : 'Não foi possível carregar mensagens anteriores.');
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }

  async function reload() {
    setLoading(true);
    setLoadError(null);
    try {
      const page = await getMessages(roomId, { limit: PAGE_SIZE });
      commit(page.messages.map((item) => ({ ...item, status: 'sent' })));
      rememberMore(page.hasMore);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        onSessionLostRef.current();
        return;
      }
      setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar as mensagens.');
    } finally {
      setLoading(false);
    }
  }

  return {
    messages,
    presence,
    connection,
    loading,
    loadingOlder,
    hasMore,
    loadError,
    notice,
    send,
    retry,
    loadOlder,
    reload,
  };
}
