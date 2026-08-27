/**
 * `arrange`: the compound tool that turns a four-bar loop into verse and chorus, copying notes and
 * chords into the repeats and extending the song (music §7.2).
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { arrangeInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { dispatch, targetBars } from './shared.ts';

export const arrange: ToolDefinition<typeof arrangeInput> = {
  name: 'arrange',
  title: 'Arrange sections',
  kind: 'write',
  description: descriptions.arrange,
  input: arrangeInput,
  example: {
    sections: [
      { name: 'Verse', bar_from: 1, bar_to: 4, repeat: true },
      { name: 'Chorus', bar_from: 9, bar_to: 12 },
    ],
    why: 'Repeating the verse and leaving four bars for a chorus that lifts.',
  },
  badExample: { sections: [{ name: 'Verse', bar_from: 4, bar_to: 1 }], why: 'Inverted range.' },
  execute(args, context) {
    const result = dispatch(context, 'arrange', { sections: args.sections }, args);
    const song = context.bus.getDocument();
    return ok(result.revision, result.changed, result.summary, {
      bars: song.bars,
      sections: song.sections,
      ...targetBars(result),
    });
  },
};
