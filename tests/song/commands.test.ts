import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseSongCommand, songCommandSchema } from '../../src/song/commands.ts';

const base = { source: 'agent' as const, why: 'It supports the melody.' };

describe('song commands', () => {
  it.each([
    ['set_notes', { track_id: 'mel', bar_from: 1, notes: [], replace: true }],
    ['set_chords', { chords: [{ bar: 1, symbol: 'Cmaj7' }] }],
    ['set_key', { key: 'C major' }],
    ['set_tempo', { bpm: 92 }],
    ['set_quantize', { track_id: 'mel', grid: '16n', strength: 0.7 }],
    ['tune_vocal', { track_id: 'mel', strength: 0.35 }],
    ['add_track', { kind: 'bass', instrument: 'sub-bass' }],
    ['set_instrument', { track_id: 'mel', instrument: 'grand-piano' }],
    ['set_mix', { track_id: 'mel', pan: -0.2 }],
    ['generate_part', { track_id: 'bass', role: 'bass', style: 'lofi', bar_from: 1, bar_to: 4 }],
    ['arrange', { sections: [{ name: 'Verse', bar_from: 1, bar_to: 4, repeat: true }] }],
    ['commit_take', { take_id: 'take-1', track_id: 'mel', quantize_strength: 0.5, grid: '8n' }],
    [
      'propose_options',
      {
        kind: 'feel',
        options: [
          { label: 'Open', why: 'Leaves room.', style: 'pop' },
          { label: 'Warm', why: 'Softens it.', style: 'soul' },
        ],
        bar_from: 1,
        bar_to: 4,
      },
    ],
    ['choose_option', { option_id: 'option-1' }],
    ['request_take', { track_id: 'bass', bar_from: 5, bar_to: 8, prompt: 'Hum a bassline.' }],
  ] as const)('accepts %s and rejects undeclared arguments', (type, args) => {
    const command = { type, args, ...base };
    expect(songCommandSchema.parse(command)).toEqual(command);
    expect(() => songCommandSchema.parse({ ...command, extra: true })).toThrow(ZodError);
  });

  it('keeps ping compatible without requiring why', () => {
    expect(parseSongCommand({ type: 'ping', args: { message: 'hello' }, source: 'agent' })).toEqual(
      { type: 'ping', args: { message: 'hello' }, source: 'agent' },
    );
  });

  it('enforces the plan ranges and a concise producer reason', () => {
    expect(() =>
      songCommandSchema.parse({
        type: 'set_tempo',
        args: { bpm: 221 },
        ...base,
      }),
    ).toThrow(ZodError);
    expect(() =>
      songCommandSchema.parse({
        type: 'set_mix',
        args: { track_id: 'mel' },
        ...base,
      }),
    ).toThrow('Give at least one mix field.');
    expect(() =>
      songCommandSchema.parse({
        type: 'set_key',
        args: { key: 'C major' },
        source: 'agent',
        why: 'x'.repeat(201),
      }),
    ).toThrow(ZodError);
  });

  it('requires two or three teaching options', () => {
    expect(() =>
      songCommandSchema.parse({
        type: 'propose_options',
        args: {
          kind: 'chords',
          options: [{ label: 'Only', why: 'There is no comparison.' }],
          bar_from: 1,
          bar_to: 4,
        },
        ...base,
      }),
    ).toThrow(ZodError);
  });
});
