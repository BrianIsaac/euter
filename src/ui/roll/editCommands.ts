/** Human note commands shared by the piano roll and drum grid. */
import type { Note } from '../../song/types.ts';
import type { Command } from '../../webmcp/bus.ts';

export interface HumanNotesRange {
  barFrom: number;
  barTo: number;
  beatsPerBar: number;
  expectedRevision?: number;
}

export function humanNotesCommand(
  trackId: string,
  notes: readonly Note[],
  summary: string,
  { barFrom, barTo, beatsPerBar, expectedRevision }: HumanNotesRange,
): Command {
  const rangeStart = (barFrom - 1) * beatsPerBar;
  const rangeEnd = barTo * beatsPerBar;
  return {
    type: 'set_notes',
    source: 'human',
    why: summary.slice(0, 200),
    ...(expectedRevision === undefined ? {} : { expected_revision: expectedRevision }),
    args: {
      track_id: trackId,
      bar_from: barFrom,
      notes: notes
        .filter((note) => note.s >= rangeStart && note.s < rangeEnd)
        .map(({ p, s, d, v }) => ({ p, s: s - rangeStart, d, v })),
      replace: true,
    },
  };
}
