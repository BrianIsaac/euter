/**
 * `set_key`: names the key and returns how well the melody fits it, with the app's own ranked
 * alternatives, so the agent can tell the person why it chose one (music §4.1).
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { setKeyInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { dispatch } from './shared.ts';

export const setKey: ToolDefinition<typeof setKeyInput> = {
  name: 'set_key',
  title: 'Set the key',
  kind: 'write',
  description: descriptions.set_key,
  input: setKeyInput,
  example: { key: 'C major', why: 'Your hum sits on C and ends there, so C major is home.' },
  badExample: { key: 'H sharp lydianish', why: 'Not a key.' },
  execute(args, context) {
    const result = dispatch(context, 'set_key', { key: args.key }, args);
    const key = context.bus.getDocument().key;
    return ok(result.revision, result.changed, result.summary, {
      key: key.name,
      confidence: Math.round(key.confidence * 100) / 100,
      alternatives: key.alternatives.map(({ name, confidence }) => ({
        name,
        confidence: Math.round(confidence * 100) / 100,
      })),
    });
  },
};
