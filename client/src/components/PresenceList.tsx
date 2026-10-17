import { colorFor } from '../services/messages';
import type { OnlineParticipant } from '../types';

export function PresenceList({
  participants,
  selfId,
  light = false,
}: {
  participants: OnlineParticipant[];
  selfId: string;
  light?: boolean;
}) {
  if (participants.length === 0) {
    return <p className={`text-sm ${light ? 'text-foam/70' : 'text-muted'}`}>Conectando presença…</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {participants.map((person) => {
        const self = person.id === selfId;
        return (
          <li key={person.id} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorFor(person.id) }} />
            <span className={`truncate text-sm ${light ? 'text-foam' : 'text-ink'}`}>
              {person.displayName}
              {self ? ' (você)' : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
