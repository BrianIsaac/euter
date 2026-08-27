/**
 * `set_chords`: one chord per bar, validated against tonal, returned with the Roman numeral so the
 * agent can say what it did in the person's language (plan Decision 19).
 */
import { selectChords } from '../../song/selectors.ts';
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { setChordsInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { dispatch, targetBars } from './shared.ts';

export const setChords: ToolDefinition<typeof setChordsInput> = {
  name: 'set_chords',
  title: 'Set the chords',
  kind: 'write',
  description: descriptions.set_chords,
  input: setChordsInput,
  example: {
    chords: [
      { bar: 1, symbol: 'C' },
      { bar: 2, symbol: 'Am7' },
    ],
    why: 'A gentle turn under the phrase you hummed.',
  },
  badExample: { chords: [{ bar: 1, symbol: 'Hmaj9#' }], why: 'Not a chord.' },
  execute(args, context) {
    const result = dispatch(context, 'set_chords', { chords: args.chords }, args);
    const song = context.bus.getDocument();
    const bars = args.chords.map(({ bar }) => bar);
    const chords = selectChords(song, Math.min(...bars), Math.max(...bars)).filter(({ bar }) =>
      bars.includes(bar),
    );
    return ok(result.revision, result.changed, result.summary, {
      key: song.key.name,
      chords,
      ...targetBars(result),
    });
  },
};
