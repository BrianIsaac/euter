import { describe, expect, it } from 'vitest';
import { createHarness } from '../../helpers/harness.ts';

interface ProposeEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: {
    option_set_id: string | null;
    options: { option_id: string; label: string }[];
    target_bars: [number, number];
  };
}

const twoOptions = {
  kind: 'chords',
  bar_from: 1,
  bar_to: 2,
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
  why: 'Two ways to harmonise the opening; hear both before we commit.',
};

describe('propose_options', () => {
  it('registers the option set without touching the chords or the notes', async () => {
    const harness = createHarness();
    const before = harness.engine.store.getDocument();
    const envelope = (await harness.invoke('propose_options', twoOptions)) as ProposeEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.revision).toBe(1);
    expect(envelope.data.option_set_id).toBe('options-1');
    expect(envelope.data.options).toEqual([
      { option_id: 'option-1', label: 'Stay home' },
      { option_id: 'option-2', label: 'Lift it' },
    ]);
    expect(envelope.data.target_bars).toEqual([1, 2]);
    expect(envelope.changed).toContain('option_sets');

    const song = harness.engine.store.getDocument();
    expect(song.chords).toEqual(before.chords);
    expect(song.tracks.find(({ id }) => id === 'melody')?.notes).toEqual(
      before.tracks.find(({ id }) => id === 'melody')?.notes,
    );
    expect(song.option_sets).toHaveLength(1);
    expect(song.option_sets[0]).toMatchObject({
      id: 'options-1',
      kind: 'chords',
      bar_from: 1,
      bar_to: 2,
      chosen_option_id: null,
    });
    expect(song.notes_log.at(-1)).toMatchObject({
      why: 'Two ways to harmonise the opening; hear both before we commit.',
      bars: [1, 2],
      source: 'agent',
    });
    harness.engine.dispose();
  });

  it('refuses a chord it cannot parse and a set with only one option', async () => {
    const harness = createHarness();
    await expect(
      harness.invoke('propose_options', {
        ...twoOptions,
        options: [
          { ...twoOptions.options[0], chords: [{ bar: 1, symbol: 'Zzz9' }] },
          twoOptions.options[1],
        ],
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
      message: 'Chord "Zzz9" is not recognised.',
    });

    const single = (await harness.invoke('propose_options', {
      ...twoOptions,
      options: [twoOptions.options[0]],
    })) as { ok: false; code: string; message: string };
    expect(single.code).toBe('INVALID_ARGUMENT');
    expect(single.message).toContain('options');

    expect(harness.engine.store.getDocument().option_sets).toEqual([]);
    expect(harness.engine.store.getDocument().revision).toBe(0);
    harness.engine.dispose();
  });

  it('refuses bars past the end of the song', async () => {
    const harness = createHarness();
    await expect(
      harness.invoke('propose_options', { ...twoOptions, bar_from: 7, bar_to: 10 }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'OUT_OF_RANGE',
      message: 'The song has 8 bars.',
      recoverable: true,
    });
    expect(harness.engine.store.getDocument().option_sets).toEqual([]);
    harness.engine.dispose();
  });
});
