/**
 * `set_mix`: level, pan, mute and solo. Only the fields given change, so "the bass is too loud" is
 * one call that does not disturb anything else.
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { setMixInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { dispatch } from './shared.ts';

export const setMix: ToolDefinition<typeof setMixInput> = {
  name: 'set_mix',
  title: 'Set the mix',
  kind: 'write',
  description: descriptions.set_mix,
  input: setMixInput,
  example: { track_id: 'bass', volume_db: -9, why: 'Taking the bass back so the hum leads.' },
  badExample: { track_id: 'bass', why: 'No field to change.' },
  execute(args, context) {
    const fields = {
      ...(args.volume_db === undefined ? {} : { volume_db: args.volume_db }),
      ...(args.pan === undefined ? {} : { pan: args.pan }),
      ...(args.mute === undefined ? {} : { mute: args.mute }),
      ...(args.solo === undefined ? {} : { solo: args.solo }),
    };
    const result = dispatch(context, 'set_mix', { track_id: args.track_id, ...fields }, args);
    const track = context.bus.getDocument().tracks.find(({ id }) => id === args.track_id);
    return ok(result.revision, result.changed, result.summary, {
      track_id: args.track_id,
      volume_db: track?.volume_db ?? null,
      pan: track?.pan ?? null,
      mute: track?.mute ?? false,
      solo: track?.solo ?? false,
    });
  },
};
