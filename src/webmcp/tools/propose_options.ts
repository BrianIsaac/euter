/**
 * `propose_options`: the teaching tool (plan Decision 13). Two or three alternatives become cards
 * with Play and Choose; nothing moves until the person picks one or the agent auditions it.
 */
import { descriptions } from '../descriptions.ts';
import { ok } from '../envelope.ts';
import { proposeOptionsInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { dispatch, targetBars } from './shared.ts';

export const proposeOptions: ToolDefinition<typeof proposeOptionsInput> = {
  name: 'propose_options',
  title: 'Offer options',
  kind: 'write',
  description: descriptions.propose_options,
  input: proposeOptionsInput,
  untrustedContent: true,
  example: {
    kind: 'chords',
    bar_from: 1,
    bar_to: 4,
    options: [
      {
        label: 'Stay home',
        why: 'It keeps the calm of your hum.',
        chords: [
          { bar: 1, symbol: 'C' },
          { bar: 2, symbol: 'F' },
        ],
      },
      {
        label: 'Lift it',
        why: 'The minor turn opens into the chorus.',
        chords: [
          { bar: 1, symbol: 'Am7' },
          { bar: 2, symbol: 'Fmaj7' },
        ],
      },
    ],
    why: 'Two ways to harmonise the verse; hear both before we commit.',
  },
  badExample: {
    kind: 'chords',
    bar_from: 1,
    bar_to: 4,
    options: [{ label: 'Only one', why: 'A single option is not a choice.' }],
    why: 'Too few options.',
  },
  execute(args, context) {
    const result = dispatch(
      context,
      'propose_options',
      {
        kind: args.kind,
        ...(args.take_id === undefined ? {} : { take_id: args.take_id }),
        ...(args.track_id === undefined ? {} : { track_id: args.track_id }),
        options: args.options,
        bar_from: args.bar_from,
        bar_to: args.bar_to,
      },
      args,
    );
    const set = context.bus.getDocument().option_sets.at(-1);
    return ok(result.revision, result.changed, result.summary, {
      option_set_id: set?.id ?? null,
      options: (set?.options ?? []).map(({ id, label, raw_take }) => ({
        option_id: id,
        label,
        ...(raw_take === true ? { raw_take: true } : {}),
      })),
      ...(set?.kind === 'take'
        ? {
            raw_option_id: set.options.find(({ raw_take }) => raw_take === true)?.id ?? null,
            next: 'audition_option plays a reading without committing it; the person chooses a card, including the raw take.',
          }
        : { next: 'audition_option plays one; the person can also press Play on the card.' }),
      ...targetBars(result),
    });
  },
};
