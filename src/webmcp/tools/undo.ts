/**
 * `undo`: one linear stack for the person and the agent, so "undo the last thing you did" and
 * "undo my last edit" are the same button (plan Decision 15).
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { undoInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';

export const undo: ToolDefinition<typeof undoInput> = {
  name: 'undo',
  title: 'Undo',
  kind: 'write',
  description: descriptions.undo,
  input: undoInput,
  example: {},
  badExample: { steps: 2 },
  execute(_args, context) {
    const move = context.engine.store.undo('agent');
    if (move === null) {
      const song = context.bus.getDocument();
      return ok(song.revision, [], 'Nothing to undo yet.', { undone: false, edits: 0 });
    }
    return ok(move.revision, move.changed, move.summary, { undone: true, edits: move.edits });
  },
};
