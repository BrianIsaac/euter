/**
 * `get_take` (read): what the person hummed, played or imported, as notes plus the quality
 * readings that tell the agent whether to ask for another take (music §7.1).
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { getTakeInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { requireTake, takeContext, takeData } from './shared.ts';

export const getTake: ToolDefinition<typeof getTakeInput> = {
  name: 'get_take',
  title: 'Read a take',
  kind: 'read',
  description: descriptions.get_take,
  input: getTakeInput,
  untrustedContent: true,
  example: { take_id: 'take-1' },
  badExample: { take_id: 7 },
  execute(args, context) {
    const song = context.bus.getDocument();
    const take = requireTake(song, args.take_id);
    const data = { ...takeData(take, song.time_sig[0]), context: takeContext(song, take) };
    const advice =
      take.notes.length === 0
        ? ' No notes were detected; ask for another take.'
        : take.median_clarity < 0.6
          ? ' The take is noisy; ask for another, or keep the raw take.'
          : ' Next: propose_options with kind take; commit_take keeps the raw take.';
    return ok(
      song.revision,
      [],
      `Take ${take.id}: ${data.notes_total} notes, ${data.duration_s}s, clarity ${data.median_clarity}.${advice}`,
      data,
    );
  },
};
