/**
 * `set_notes`: the agent writes notes into a bar range, replacing what was there. Starts are
 * relative to `bar_from`; lane A's reducer refuses pitches out of range and notes past the range.
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { setNotesInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { dispatch, targetBars } from './shared.ts';

export const setNotes: ToolDefinition<typeof setNotesInput> = {
  name: 'set_notes',
  title: 'Write notes',
  kind: 'write',
  description: descriptions.set_notes,
  input: setNotesInput,
  example: {
    track_id: 'melody',
    bar_from: 1,
    notes: [
      { p: 64, s: 0, d: 1, v: 0.8 },
      { p: 67, s: 1, d: 1 },
    ],
    replace: true,
    why: 'Answering your first phrase with the same shape a third higher.',
  },
  badExample: {
    track_id: 'melody',
    bar_from: 1,
    notes: [{ p: 200, s: 0, d: 1 }],
    replace: true,
    why: 'Out of range.',
  },
  execute(args, context) {
    const result = dispatch(
      context,
      'set_notes',
      {
        track_id: args.track_id,
        bar_from: args.bar_from,
        notes: args.notes,
        replace: true,
      },
      args,
    );
    return ok(result.revision, result.changed, result.summary, {
      track_id: args.track_id,
      notes: args.notes.length,
      ...targetBars(result),
    });
  },
};
