import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePcm16Wav } from '../../../scripts/bench-takes.ts';
import { transcribePcmToTake } from '../../../src/transcribe/takes.ts';
import { createHarness } from '../../helpers/harness.ts';

interface ProposeEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: {
    option_set_id: string | null;
    options: { option_id: string; label: string; raw_take?: boolean }[];
    raw_option_id?: string;
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

  it('binds interpretations to a real rough take and always adds its raw escape path', async () => {
    const harness = createHarness();
    const wav = decodePcm16Wav(
      readFileSync(resolve('tests/fixtures/takes/take-03-low-register.wav')),
    );
    const take = {
      ...transcribePcmToTake(wav.pcm, wav.sampleRate, {
        id: 'take-03-low-register',
        source: 'import' as const,
        bpm: 96,
      }),
      target_track_id: 'melody',
      target_bars: [1, 2] as [number, number],
    };
    expect(take.notes.map(({ p }) => p)).toEqual([47, 50, 52, 40, 51, 57]);
    harness.engine.addTake(take, 'Kept the rough low-register take.', 'human');
    const melodyBefore = harness.engine.store
      .getDocument()
      .tracks.find(({ id }) => id === 'melody')?.notes;

    const envelope = (await harness.invoke('propose_options', {
      kind: 'take',
      take_id: take.id,
      track_id: 'melody',
      bar_from: 1,
      bar_to: 2,
      options: [
        {
          label: 'Four-note climb',
          why: 'The 40 is isolated between the climbing notes, so this hears four steady steps.',
          notes: [48, 52, 55, 60].map((p, index) => ({ p, s: index * 2, d: 1.5 })),
        },
        {
          label: 'Keep the turn',
          why: 'This keeps the small turn before the last note while folding the isolated low blip.',
          notes: [48, 50, 52, 51, 57].map((p, index) => ({ p, s: index * 1.5, d: 1 })),
        },
      ],
      why: 'Two plausible readings of a six-segment hum; neither claims to recover missing truth.',
    })) as ProposeEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.data.options).toHaveLength(3);
    expect(envelope.data.options[2]).toEqual({
      option_id: 'option-3',
      label: 'None of these — keep what I sang',
      raw_take: true,
    });
    expect(envelope.data.raw_option_id).toBe('option-3');
    expect(harness.engine.store.getDocument().option_sets[0]).toMatchObject({
      kind: 'take',
      take_id: take.id,
      track_id: 'melody',
      chosen_option_id: null,
    });
    expect(harness.engine.store.getDocument().option_sets[0]?.options[2]?.notes).toEqual(
      take.notes,
    );
    expect(
      harness.engine.store.getDocument().tracks.find(({ id }) => id === 'melody')?.notes,
    ).toEqual(melodyBefore);
    harness.engine.dispose();
  });

  it('carries every measured human take through context and non-destructive proposal', async () => {
    const names = [
      'take-01-ascending',
      'take-02-descending',
      'take-03-low-register',
      'take-04-octave-leap',
      'take-05-repeated-note',
      'take-06-held-notes',
      'take-07-scale',
      'take-08-phrase',
      'take-09-quiet',
      'take-10-wide',
    ];
    for (const name of names) {
      const expected = JSON.parse(
        readFileSync(resolve(`tests/fixtures/takes/${name}.json`), 'utf8'),
      ) as { bpm: number; pitches: number[] };
      const wav = decodePcm16Wav(readFileSync(resolve(`tests/fixtures/takes/${name}.wav`)));
      const rough = transcribePcmToTake(wav.pcm, wav.sampleRate, {
        id: name,
        source: 'import',
        bpm: expected.bpm,
      });
      const lastBeat = Math.max(...rough.notes.map(({ s, d }) => s + d));
      const barTo = Math.max(1, Math.ceil(lastBeat / 4));
      const take = {
        ...rough,
        target_track_id: 'melody',
        target_bars: [1, barTo] as [number, number],
      };
      const harness = createHarness();
      harness.engine.addTake(take, `Kept ${name}.`, 'human');
      const melodyBefore = structuredClone(
        harness.engine.store.getDocument().tracks.find(({ id }) => id === 'melody')?.notes,
      );

      const reading = (await harness.invoke('get_take', { take_id: name })) as {
        ok: true;
        data: { notes_total: number; context: { target_bars: [number, number] } };
      };
      expect(reading.ok, name).toBe(true);
      expect(reading.data.notes_total, name).toBe(rough.notes.length);
      expect(reading.data.context.target_bars, name).toEqual([1, barTo]);
      expect(JSON.stringify(reading).length, name).toBeLessThanOrEqual(1500);

      const span = barTo * 4;
      const step = span / expected.pitches.length;
      const proposal = (await harness.invoke('propose_options', {
        kind: 'take',
        take_id: name,
        track_id: 'melody',
        bar_from: 1,
        bar_to: barTo,
        options: [
          {
            label: 'Phrase reading',
            why:
              rough.notes.length < expected.pitches.length
                ? 'The recording exposes fewer attacks, so this extra note is plausible rather than recovered.'
                : 'This groups the drifting segments into the phrase-level notes they most resemble.',
            notes: expected.pitches.map((p, index) => ({
              p,
              s: index * step,
              d: step * 0.8,
            })),
          },
          {
            label: 'Literal contour',
            why: 'This keeps each detected turn while placing the line in the song register.',
            notes: rough.notes.map(({ p, s, d }) => ({ p: Math.min(96, p + 12), s, d })),
          },
        ],
        why: 'Two contextual readings of a rough human take, presented without changing the song.',
      })) as ProposeEnvelope;

      expect(proposal.ok, name).toBe(true);
      expect(proposal.data.options.at(-1), name).toMatchObject({ raw_take: true });
      expect(
        harness.engine.store.getDocument().option_sets[0]?.options.at(-1)?.notes,
        name,
      ).toEqual(take.notes);
      expect(
        harness.engine.store.getDocument().tracks.find(({ id }) => id === 'melody')?.notes,
        name,
      ).toEqual(melodyBefore);
      harness.engine.dispose();
    }
  });
});
