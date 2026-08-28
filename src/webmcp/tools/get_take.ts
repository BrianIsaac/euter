/**
 * `get_take` (read): what the person hummed, played or imported, as notes plus the quality
 * readings that tell the agent whether to ask for another take (music §7.1), and the local
 * musical context an interpretation needs. The payload is trimmed to Chrome's output budget
 * rather than refused, so a long take stays readable.
 */
import { descriptions } from '../descriptions.ts';
import { ok, serialisedLength } from '../envelope.ts';
import { getTakeInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { boundTakeRead, requireTake, takeContext, takeData } from './shared.ts';

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
    const full = { ...takeData(take, song.time_sig[0]), context: takeContext(song, take) };
    const advice =
      take.notes.length === 0
        ? ' No notes were detected; ask for another take.'
        : take.median_clarity < 0.6
          ? ' The take is noisy; ask for another, or keep the raw take.'
          : ' Next: propose_options with kind take; commit_take keeps the raw take.';
    const summary = `Take ${take.id}: ${full.notes_total} notes, ${full.duration_s}s, clarity ${full.median_clarity}.${advice}`;
    const data = boundTakeRead(full, (candidate) =>
      serialisedLength(ok(song.revision, [], summary, candidate)),
    );
    return ok(song.revision, [], summary, data);
  },
};
