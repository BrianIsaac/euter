/**
 * `get_track_notes` (read): one track's notes for at most eight bars, each onset relative to its
 * own bar (plan Tool surface; Decision 18).
 */
import { selectTrackNotes } from '../../song/selectors.ts';
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { getTrackNotesInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';

export const getTrackNotes: ToolDefinition<typeof getTrackNotesInput> = {
  name: 'get_track_notes',
  title: 'Read a track',
  kind: 'read',
  description: descriptions.get_track_notes,
  input: getTrackNotesInput,
  example: { track_id: 'melody', bar_from: 1, bar_to: 4 },
  badExample: { track_id: 'melody', bar_from: 0, bar_to: 4 },
  execute(args, context) {
    const song = context.bus.getDocument();
    const bars = selectTrackNotes(song, args.track_id, args.bar_from, args.bar_to);
    const count = bars.reduce((total, bar) => total + bar.notes.length, 0);
    return ok(
      song.revision,
      [],
      `${args.track_id} bars ${args.bar_from}-${args.bar_to}: ${count} notes`,
      { track_id: args.track_id, bars },
    );
  },
};
