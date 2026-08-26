/** Human note commands shared by the piano roll and drum grid. */
import type { Note } from '../../song/types.ts';
import type { Command } from '../../webmcp/bus.ts';

export function humanNotesCommand(
  trackId: string,
  notes: readonly Note[],
  summary: string,
): Command {
  return {
    type: 'set_notes',
    source: 'human',
    args: {
      track_id: trackId,
      bar_from: 1,
      notes: notes.map((note) => ({ ...note })),
      replace: true,
      summary,
    },
  };
}
