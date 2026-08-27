/**
 * `add_track`: a new track with an instrument from the catalogue; the reconciler builds its channel
 * and loads the samples as soon as the document says it exists (plan Architecture item 4).
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { addTrackInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { dispatch } from './shared.ts';

export const addTrack: ToolDefinition<typeof addTrackInput> = {
  name: 'add_track',
  title: 'Add a track',
  kind: 'write',
  description: descriptions.add_track,
  input: addTrackInput,
  untrustedContent: true,
  example: {
    kind: 'drums',
    instrument: 'studio-kit',
    why: 'A kit to put the pulse under your melody.',
  },
  badExample: { kind: 'strings', instrument: 'studio-kit', why: 'Not a track kind.' },
  execute(args, context) {
    const result = dispatch(
      context,
      'add_track',
      {
        kind: args.kind,
        instrument: args.instrument,
        ...(args.name === undefined ? {} : { name: args.name }),
      },
      args,
    );
    const track = context.bus.getDocument().tracks.at(-1);
    return ok(result.revision, result.changed, result.summary, {
      track_id: track?.id ?? null,
      name: track?.name ?? null,
      kind: args.kind,
      instrument: args.instrument,
    });
  },
};
