/** `tune_vocal`: reversible, key-aware pitch correction for retained voice clips. */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { tuneVocalInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { dispatch, targetBars } from './shared.ts';

export const tuneVocal: ToolDefinition<typeof tuneVocalInput> = {
  name: 'tune_vocal',
  title: 'Tune a vocal',
  kind: 'write',
  description: descriptions.tune_vocal,
  input: tuneVocalInput,
  untrustedContent: true,
  example: {
    track_id: 'melody',
    strength: 0.35,
    why: 'A gentle correction keeps the character of the performance.',
  },
  badExample: {
    track_id: 'vocal',
    strength: 2,
    why: 'Correction strength cannot exceed one.',
  },
  execute(args, context) {
    const result = dispatch(
      context,
      'tune_vocal',
      { track_id: args.track_id, strength: args.strength },
      args,
    );
    const song = context.bus.getDocument();
    const track = song.tracks.find(({ id }) => id === args.track_id);
    return ok(result.revision, result.changed, result.summary, {
      track_id: args.track_id,
      key: song.key.name,
      strength: args.strength,
      clips_updated: track?.clips.length ?? 0,
      reversible: true,
      ...targetBars(result),
    });
  },
};
