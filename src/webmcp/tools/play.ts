/**
 * `play`: the only route from a tool to the speakers, through lane A's transport (plan Architecture
 * item 4). Not an edit, and locked until the person has clicked once (Decision 24).
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { playInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';

export const play: ToolDefinition<typeof playInput> = {
  name: 'play',
  title: 'Play',
  kind: 'write',
  description: descriptions.play,
  input: playInput,
  example: { from_bar: 1 },
  badExample: { from_bar: 0 },
  async execute(args, context) {
    const song = context.bus.getDocument();
    const result = await context.engine.play({
      ...(args.from_bar === undefined ? {} : { from_bar: args.from_bar }),
      ...(args.loop === undefined ? {} : { loop: args.loop }),
    });
    return ok(
      song.revision,
      [],
      args.loop === undefined
        ? `Playing from bar ${result.position_bar}`
        : `Looping bars ${args.loop.bar_from}-${args.loop.bar_to}`,
      {
        playing: result.playing,
        from_bar: result.position_bar,
        ...(args.loop === undefined ? {} : { loop: args.loop }),
        audio: 'running',
      },
    );
  },
};
