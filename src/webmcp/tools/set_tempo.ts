/**
 * `set_tempo`: the transport follows the document, so the tempo changes everywhere at once and the
 * notes keep their beat positions (plan Architecture item 4).
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { setTempoInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { dispatch } from './shared.ts';

export const setTempo: ToolDefinition<typeof setTempoInput> = {
  name: 'set_tempo',
  title: 'Set the tempo',
  kind: 'write',
  description: descriptions.set_tempo,
  input: setTempoInput,
  example: { bpm: 92, why: 'Slowing it a little so the words have room.' },
  badExample: { bpm: 900, why: 'Too fast.' },
  execute(args, context) {
    const result = dispatch(context, 'set_tempo', { bpm: args.bpm }, args);
    return ok(result.revision, result.changed, result.summary, {
      bpm: context.bus.getDocument().bpm,
    });
  },
};
