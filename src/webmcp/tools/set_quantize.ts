/**
 * `set_quantize`: the same command the app's grid and strength sliders dispatch. Reversible,
 * because the recorded timing is kept on every note (music §4.4).
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { setQuantizeInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { dispatch, targetBars } from './shared.ts';

export const setQuantize: ToolDefinition<typeof setQuantizeInput> = {
  name: 'set_quantize',
  title: 'Quantise a track',
  kind: 'write',
  description: descriptions.set_quantize,
  input: setQuantizeInput,
  untrustedContent: true,
  example: {
    track_id: 'melody',
    grid: '16n',
    strength: 0.6,
    why: 'Tightening the timing while leaving some of the sway.',
  },
  badExample: { track_id: 'melody', grid: '32n', strength: 0.6, why: 'Unknown grid.' },
  execute(args, context) {
    const result = dispatch(
      context,
      'set_quantize',
      {
        track_id: args.track_id,
        grid: args.grid,
        strength: args.strength,
        ...(args.swing === undefined ? {} : { swing: args.swing }),
      },
      args,
    );
    return ok(result.revision, result.changed, result.summary, {
      track_id: args.track_id,
      grid: args.grid,
      strength: args.strength,
      reversible: true,
      ...targetBars(result),
    });
  },
};
