/**
 * `suggest_chords` (read): the page's own rule-based proposal, one chord per bar with a fit score,
 * for the agent to accept, edit or turn into options (plan Decision 19).
 */
import { suggestChordProgression } from '../../theory/progressions.ts';
import { descriptions } from '../descriptions.ts';
import { ok, ToolError } from '../envelope.ts';
import { suggestChordsInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';

/** Bars a single call may propose for, so the result stays inside the output budget. */
export const SUGGEST_MAX_BARS = 16;

export const suggestChords: ToolDefinition<typeof suggestChordsInput> = {
  name: 'suggest_chords',
  title: 'Suggest chords',
  kind: 'read',
  description: descriptions.suggest_chords,
  input: suggestChordsInput,
  example: { bar_from: 1, bar_to: 4, style: 'lofi' },
  badExample: { bar_from: 1, bar_to: 4, style: 'techno' },
  execute(args, context) {
    const song = context.bus.getDocument();
    if (args.bar_to < args.bar_from) {
      throw new ToolError('INVALID_ARGUMENT', 'Give an ordered, one-based bar range.', true);
    }
    if (args.bar_to > song.bars) {
      throw new ToolError('OUT_OF_RANGE', `The song has ${song.bars} bars.`, true);
    }
    if (args.bar_to - args.bar_from + 1 > SUGGEST_MAX_BARS) {
      throw new ToolError(
        'RESULT_TOO_LARGE',
        `Ask for at most ${SUGGEST_MAX_BARS} bars at a time.`,
        true,
      );
    }
    const melody = song.tracks
      .filter(({ kind }) => kind === 'melody')
      .flatMap(({ notes }) => notes);
    const chords = suggestChordProgression(
      melody,
      song.key.name,
      args.style,
      args.bar_from,
      args.bar_to,
      song.time_sig[0],
    ).map((chord) => ({ ...chord, fit: Math.round(chord.fit * 100) / 100 }));
    const weakest = Math.min(...chords.map(({ fit }) => fit));
    return ok(
      song.revision,
      [],
      `${chords.length} ${args.style} chords for bars ${args.bar_from}-${args.bar_to} in ${song.key.name}${
        melody.length === 0 ? ' (no melody yet, so these follow the style only)' : ''
      }`,
      { key: song.key.name, style: args.style, weakest_fit: weakest, chords },
    );
  },
};
