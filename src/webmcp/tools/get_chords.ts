/**
 * `get_chords` (read): the chord per bar with its Roman numeral in the current key (plan Tool
 * surface; music §7.1).
 */
import { selectChords } from '../../song/selectors.ts';
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { getChordsInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';

export const getChords: ToolDefinition<typeof getChordsInput> = {
  name: 'get_chords',
  title: 'Read the chords',
  kind: 'read',
  description: descriptions.get_chords,
  input: getChordsInput,
  example: { bar_from: 1, bar_to: 8 },
  badExample: { bar_from: 'one' },
  execute(args, context) {
    const song = context.bus.getDocument();
    const chords = selectChords(song, args.bar_from ?? 1, args.bar_to ?? song.bars);
    return ok(song.revision, [], `${chords.length} chords in ${song.key.name}`, {
      key: song.key.name,
      chords,
    });
  },
};
