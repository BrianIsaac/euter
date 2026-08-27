/**
 * `stop`: stops the transport and drops any option preview back to the live song. Not an edit.
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { stopInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';

export const stop: ToolDefinition<typeof stopInput> = {
  name: 'stop',
  title: 'Stop',
  kind: 'write',
  description: descriptions.stop,
  input: stopInput,
  example: {},
  badExample: { now: true },
  async execute(_args, context) {
    const result = await context.engine.stop();
    return ok(context.bus.getDocument().revision, [], `Stopped at bar ${result.position_bar}`, {
      playing: result.playing,
      position_bar: result.position_bar,
    });
  },
};
