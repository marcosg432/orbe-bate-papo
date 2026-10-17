import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { ChatScreen } from '../components/ChatScreen';
import { NameGate } from '../components/NameGate';
import { ChatProvider } from '../contexts/ChatContext';
import { useRoomSession } from '../hooks/useRoomSession';
import { isRoomId } from '../types';
import { Button } from '../components/Button';

export function RoomPage() {
  const { roomId } = useParams();
  if (!isRoomId(roomId)) return <Unavailable title="Link inválido" body="Este endereço não corresponde a uma conversa." />;
  return <ValidRoom roomId={roomId} />;
}

function ValidRoom({ roomId }: { roomId: string }) {
  const entry = useRoomSession(roomId);

  useEffect(() => {
    document.title = 'Conversa privada · Orbe';
    return () => {
      document.title = 'Orbe';
    };
  }, []);

  if (entry.phase === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center text-muted">
        Abrindo conversa…
      </main>
    );
  }

  if (entry.phase === 'missing') {
    return <Unavailable title="Conversa não encontrada" body="Este link não abre nenhuma sala. Ele pode ter sido digitado incorretamente." />;
  }

  if (entry.phase === 'error') {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5">
        <h1 className="font-display text-4xl">Não foi possível abrir</h1>
        <p role="alert" className="mt-3 text-danger">{entry.error}</p>
        <div className="mt-6 flex gap-3">
          <Button onClick={() => void entry.reload()}>Tentar de novo</Button>
          <Link to="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-tide">
            Voltar ao início
          </Link>
        </div>
      </main>
    );
  }

  if (entry.phase === 'join' || !entry.session) {
    return <NameGate error={entry.error} pending={entry.joining} onSubmit={entry.join} />;
  }

  const { session } = entry;
  return (
    <ChatProvider roomId={roomId} participant={session.participant} onSessionLost={entry.leaveSession}>
      <ChatScreen
        roomId={roomId}
        selfId={session.participant.id}
        displayName={session.participant.displayName}
        createdAt={session.room.createdAt}
      />
    </ChatProvider>
  );
}

function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5">
      <p className="text-sm font-semibold tracking-[0.16em] text-tide uppercase">Orbe</p>
      <h1 className="mt-3 font-display text-4xl">{title}</h1>
      <p className="mt-3 text-muted">{body}</p>
      <Link to="/" className="mt-6 inline-flex text-sm font-semibold text-tide">
        Criar uma conversa
      </Link>
    </main>
  );
}
