/**
 * `request_take`: the agent asks the person for a part instead of writing it. The prompt appears on
 * those bars with the recorder armed; the take arrives later under `takes` (plan Decision 13).
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { requestTakeInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { dispatch, targetBars } from './shared.ts';

export const requestTake: ToolDefinition<typeof requestTakeInput> = {
  name: 'request_take',
  title: 'Ask for a take',
  kind: 'write',
  description: descriptions.request_take,
  input: requestTakeInput,
  untrustedContent: true,
  example: {
    track_id: 'bass',
    bar_from: 1,
    bar_to: 4,
    prompt: 'Hum me a bassline for these four bars',
    why: 'You know how the low line should move better than I do.',
  },
  badExample: { track_id: 'bass', bar_from: 4, bar_to: 1, prompt: 'Backwards', why: 'x' },
  execute(args, context) {
    const result = dispatch(
      context,
      'request_take',
      {
        track_id: args.track_id,
        bar_from: args.bar_from,
        bar_to: args.bar_to,
        prompt: args.prompt,
      },
      args,
    );
    const request = context.bus.getDocument().take_request;
    return ok(result.revision, result.changed, result.summary, {
      request_id: request?.id ?? null,
      track_id: args.track_id,
      prompt: args.prompt,
      next: 'The person presses Record. Check get_song_state for a new take before writing this part yourself.',
      ...targetBars(result),
    });
  },
};
