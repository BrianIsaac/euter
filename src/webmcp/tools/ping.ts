/**
 * `ping {message}`: the probe write for day-one check 0. Dispatches a `ping` command on the bus,
 * which bumps the revision, and returns the envelope.
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { pingInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';

export const ping: ToolDefinition<typeof pingInput> = {
  name: 'ping',
  title: 'Ping',
  kind: 'write',
  description: descriptions.ping,
  input: pingInput,
  example: { message: 'hello' },
  badExample: { message: 42 },
  execute(args, context) {
    const result = context.bus.dispatch({
      type: 'ping',
      args: { message: args.message },
      source: 'agent',
    });
    return ok(result.revision, result.changed, result.summary, { message: args.message });
  },
};
