/**
 * `get_track_notes` (read): one track's notes for at most eight bars, each onset relative to its
 * own bar (plan Tool surface; Decision 18).
 */
import { selectTrackNotes } from '../../song/selectors.ts';
import { descriptions } from '../descriptions.ts';
import { ok, ToolError } from '../envelope.ts';
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
    const allBars = selectTrackNotes(song, args.track_id, args.bar_from, args.bar_to);
    const allNotes = allBars.flatMap(({ bar, notes }) => notes.map((note) => ({ bar, note })));
    const offset = args.note_offset ?? 0;
    const limit = args.note_limit ?? 24;
    if (offset > allNotes.length) {
      throw new ToolError(
        'OUT_OF_RANGE',
        `This range contains ${allNotes.length} notes; note_offset is ${offset}.`,
        true,
      );
    }
    const page = allNotes.slice(offset, offset + limit);
    const bars = allBars.map(({ bar }) => ({
      bar,
      notes: page.filter((entry) => entry.bar === bar).map(({ note }) => note),
    }));
    const nextOffset = offset + page.length < allNotes.length ? offset + page.length : null;
    const first = page.length === 0 ? 0 : offset + 1;
    const last = offset + page.length;
    return ok(
      song.revision,
      [],
      `${args.track_id} bars ${args.bar_from}-${args.bar_to}: notes ${first}-${last} of ${allNotes.length}`,
      {
        track_id: args.track_id,
        bar_from: args.bar_from,
        bar_to: args.bar_to,
        note_offset: offset,
        notes_total: allNotes.length,
        next_note_offset: nextOffset,
        bars,
      },
    );
  },
};
