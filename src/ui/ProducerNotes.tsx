/**
 * The producer-notes rail (plan Architecture item 8): the `why` of every write, in song order,
 * so the song's reasoning reads without the chat. Writes with `why` arrive on 29 Aug; today the
 * rail lists `notes_log`, which is empty.
 */
import { useSyncExternalStore } from 'react';
import type { SongDocument } from '../song/types.ts';
import type { CommandBus } from '../webmcp/bus.ts';

export interface ProducerNotesProps {
  bus: CommandBus<SongDocument>;
}

/**
 * Renders the rail.
 *
 * @param props - The command bus.
 * @returns The rail.
 */
export function ProducerNotes({ bus }: ProducerNotesProps) {
  const song = useSyncExternalStore(bus.subscribe, bus.getDocument);
  const notes = [...song.notes_log].sort(
    (a, b) => a.bars[0] - b.bars[0] || a.revision - b.revision,
  );
  return (
    <section className="notes" aria-label="Producer notes">
      <header className="notes-header">
        <h2>Producer notes</h2>
      </header>
      {notes.length === 0 ? (
        <p className="muted">
          Every change the agent makes carries one sentence on why. The sentences land here in song
          order, pinned to their bars, from 29 Aug.
        </p>
      ) : (
        <ol className="notes-list">
          {notes.map((note) => (
            <li key={`${note.revision}-${note.bars[0]}`} data-testid="producer-note">
              <span className="notes-bars">
                bars {note.bars[0]}-{note.bars[1]}
              </span>
              <span className="notes-why">{note.why}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
