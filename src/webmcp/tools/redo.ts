/**
 * `redo`: puts back the last undone edit, from the same linear history (plan Decision 15).
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { redoInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';

export const redo: ToolDefinition<typeof redoInput> = {
  name: 'redo',
  title: 'Redo',
  kind: 'write',
  description: descriptions.redo,
  input: redoInput,
  untrustedContent: true,
  example: {},
  badExample: { steps: 2 },
  execute(_args, context) {
    const move = context.engine.store.redo('agent');
    if (move === null) {
      const song = context.bus.getDocument();
      return ok(song.revision, [], 'Nothing to redo.', { redone: false, edits: 0 });
    }
    return ok(move.revision, move.changed, move.summary, { redone: true, edits: move.edits });
  },
};
