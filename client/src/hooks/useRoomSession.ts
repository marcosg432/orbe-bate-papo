import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, createSession, getRoom } from '../services/api';
import type { RoomSession } from '../types';

export type RoomPhase = 'loading' | 'join' | 'ready' | 'missing' | 'error';

export function useRoomSession(roomId: string) {
  const [phase, setPhase] = useState<RoomPhase>('loading');
  const [session, setSession] = useState<RoomSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const next = await getRoom(roomId);
      if (!mounted.current) return;
      setSession(next);
      setPhase('ready');
    } catch (caught) {
      if (!mounted.current) return;
      if (caught instanceof ApiError && caught.status === 401) {
        setSession(null);
        setPhase('join');
        return;
      }
      if (caught instanceof ApiError && caught.status === 404) {
        setPhase('missing');
        return;
      }
      setError(caught instanceof Error ? caught.message : 'Não foi possível abrir a conversa.');
      setPhase('error');
    }
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function join(displayName: string) {
    setJoining(true);
    setError(null);
    try {
      const next = await createSession(roomId, displayName);
      if (!mounted.current) return;
      setSession(next);
      setPhase('ready');
    } catch (caught) {
      if (!mounted.current) return;
      if (caught instanceof ApiError && caught.status === 404) {
        setPhase('missing');
        return;
      }
      setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.');
    } finally {
      if (mounted.current) setJoining(false);
    }
  }

  function leaveSession() {
    setSession(null);
    setPhase('join');
  }

  return { phase, session, error, joining, join, reload: load, leaveSession };
}
