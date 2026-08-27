/**
 * `set_instrument`: the sound of a track. Samples load lazily, so the envelope says whether the new
 * instrument is already audible (plan Decision 3).
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { setInstrumentInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { dispatch } from './shared.ts';

export const setInstrument: ToolDefinition<typeof setInstrumentInput> = {
  name: 'set_instrument',
  title: 'Change an instrument',
  kind: 'write',
  description: descriptions.set_instrument,
  input: setInstrumentInput,
  example: {
    track_id: 'chords',
    instrument: 'electric-piano',
    why: 'An electric piano sits softer under the melody.',
  },
  badExample: { track_id: 'chords', instrument: 'stradivarius', why: 'Not in the catalogue.' },
  execute(args, context) {
    const result = dispatch(
      context,
      'set_instrument',
      { track_id: args.track_id, instrument: args.instrument },
      args,
    );
    const snapshot = context.engine.getSnapshot();
    const key = `${args.track_id}:${args.instrument}`;
    return ok(result.revision, result.changed, result.summary, {
      track_id: args.track_id,
      instrument: args.instrument,
      loaded: snapshot.audio.running && snapshot.loading[key] === undefined,
      ...(snapshot.fallbacks[key] === undefined ? {} : { note: snapshot.fallbacks[key] }),
    });
  },
};
