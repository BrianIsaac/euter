/**
 * `generate_part`: deterministic, rule-based parts from the chords, the key and a named style
 * (plan Decisions 19 and 20). The agent decides; the page generates.
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { generatePartInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { dispatch, targetBars } from './shared.ts';

export const generatePart: ToolDefinition<typeof generatePartInput> = {
  name: 'generate_part',
  title: 'Generate a part',
  kind: 'write',
  description: descriptions.generate_part,
  input: generatePartInput,
  example: {
    track_id: 'drums',
    role: 'drums',
    style: 'lofi',
    bar_from: 1,
    bar_to: 4,
    why: 'A laid-back kit so the hum has something to lean on.',
  },
  badExample: {
    track_id: 'drums',
    role: 'vocals',
    style: 'lofi',
    bar_from: 1,
    bar_to: 4,
    why: 'Not a role.',
  },
  execute(args, context) {
    const result = dispatch(
      context,
      'generate_part',
      {
        track_id: args.track_id,
        role: args.role,
        style: args.style,
        bar_from: args.bar_from,
        bar_to: args.bar_to,
      },
      args,
    );
    const track = context.bus.getDocument().tracks.find(({ id }) => id === args.track_id);
    return ok(result.revision, result.changed, result.summary, {
      track_id: args.track_id,
      role: args.role,
      style: args.style,
      notes: track?.notes.length ?? 0,
      ...targetBars(result),
    });
  },
};
