/**
 * `commit_take`: the take becomes the track's notes, quantised to a grid with the sung timing kept
 * so `set_quantize` can change its mind later (music §4.4).
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { commitTakeInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { dispatch, requireTake, targetBars } from './shared.ts';

export const commitTake: ToolDefinition<typeof commitTakeInput> = {
  name: 'commit_take',
  title: 'Commit a take',
  kind: 'write',
  description: descriptions.commit_take,
  input: commitTakeInput,
  example: {
    take_id: 'take-1',
    track_id: 'melody',
    quantize_strength: 0.75,
    grid: '16n',
    why: 'Tightening the hum onto the grid without losing its feel.',
  },
  badExample: {
    take_id: 'take-1',
    track_id: 'melody',
    quantize_strength: 4,
    grid: '16n',
    why: 'x',
  },
  execute(args, context) {
    requireTake(context.bus.getDocument(), args.take_id);
    const result = dispatch(
      context,
      'commit_take',
      {
        take_id: args.take_id,
        track_id: args.track_id,
        quantize_strength: args.quantize_strength,
        grid: args.grid,
      },
      args,
    );
    context.engine.setPendingTake(null);
    return ok(result.revision, result.changed, result.summary, {
      take_id: args.take_id,
      track_id: args.track_id,
      grid: args.grid,
      quantize_strength: args.quantize_strength,
      ...targetBars(result),
    });
  },
};
