import { describe, expect, it } from 'vitest';
import { createHarness, makeTake } from '../../helpers/harness.ts';

interface AuditionEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: {
    option_id: string;
    label: string;
    target_bars: [number, number];
    committed: boolean;
  };
}

const proposal = {
  kind: 'chords',
  bar_from: 3,
  bar_to: 4,
  options: [
    {
      label: 'Stay home',
      why: 'It keeps the calm of your hum.',
      chords: [
        { bar: 3, symbol: 'Am' },
        { bar: 4, symbol: 'G' },
      ],
    },
    {
      label: 'Lift it',
      why: 'The seventh opens into the chorus.',
      chords: [
        { bar: 3, symbol: 'Fmaj7' },
        { bar: 4, symbol: 'G7' },
      ],
    },
  ],
  why: 'Two ways through bars three and four.',
};

describe('audition_option', () => {
  it('loops the option over its bars as a preview and commits nothing', async () => {
    const harness = createHarness();
    await harness.invoke('propose_options', proposal);
    const chordsBefore = harness.engine.store.getDocument().chords;

    const envelope = (await harness.invoke('audition_option', {
      option_id: 'option-2',
    })) as AuditionEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.data).toEqual({
      option_id: 'option-2',
      label: 'Lift it',
      target_bars: [3, 4],
      committed: false,
    });
    expect(envelope.changed).toEqual([]);
    expect(envelope.summary).toContain('Nothing is committed');

    expect(harness.transport.calls.play).toEqual([
      { from_bar: 3, loop: { bar_from: 3, bar_to: 4 } },
    ]);

    const preview = harness.engine.playback.getPreview();
    expect(preview?.chords).toEqual([
      ...chordsBefore.slice(0, 2),
      { bar: 3, symbol: 'Fmaj7' },
      { bar: 4, symbol: 'G7' },
      ...chordsBefore.slice(4),
    ]);
    expect(preview?.tracks.find(({ id }) => id === 'chords')?.notes.length).toBeGreaterThan(0);

    const song = harness.engine.store.getDocument();
    expect(song.revision).toBe(envelope.revision);
    expect(song.revision).toBe(1);
    expect(song.chords).toEqual(chordsBefore);
    expect(song.tracks.find(({ id }) => id === 'chords')?.notes).toEqual([]);
    harness.engine.dispose();
  });

  it('asks for a gesture when the audio is locked and leaves no preview behind', async () => {
    const harness = createHarness();
    await harness.invoke('propose_options', proposal);
    harness.audio.setState('uninitialised');

    await expect(
      harness.invoke('audition_option', { option_id: 'option-1' }),
    ).resolves.toMatchObject({ ok: false, code: 'AUDIO_LOCKED', recoverable: true });
    expect(harness.transport.calls.play).toEqual([]);
    expect(harness.engine.playback.getPreview()).toBeNull();
    harness.engine.dispose();
  });

  it('refuses an option id nothing proposed', async () => {
    const harness = createHarness();
    await harness.invoke('propose_options', proposal);
    await expect(
      harness.invoke('audition_option', { option_id: 'option-9' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
      message: 'Option "option-9" does not exist. Read get_song_state for the option ids.',
    });
    expect(harness.transport.calls.play).toEqual([]);
    harness.engine.dispose();
  });

  it('previews a take reading in context without changing the raw take or track', async () => {
    const harness = createHarness();
    const take = {
      ...makeTake('take-1'),
      target_track_id: 'melody',
      target_bars: [1, 1] as [number, number],
    };
    harness.engine.addTake(take, 'Kept the rough take.', 'human');
    await harness.invoke('propose_options', {
      kind: 'take',
      take_id: take.id,
      track_id: 'melody',
      bar_from: 1,
      bar_to: 1,
      options: [
        {
          label: 'Four even notes',
          why: 'The repeated segments sound like four even notes.',
          notes: [60, 60, 60, 60].map((p, s) => ({ p, s, d: 0.8 })),
        },
        {
          label: 'Held opening',
          why: 'The first two segments may be one held note.',
          notes: [
            { p: 60, s: 0, d: 1.8 },
            { p: 64, s: 2, d: 0.8 },
          ],
        },
      ],
      why: 'Two readings of the rough note boundaries.',
    });
    const songBefore = structuredClone(harness.engine.store.getDocument());

    const envelope = (await harness.invoke('audition_option', {
      option_id: 'option-2',
    })) as AuditionEnvelope;

    expect(envelope.data.committed).toBe(false);
    expect(
      harness.engine.playback
        .getPreview()
        ?.tracks[0]?.notes.filter(({ s }) => s < 4)
        .map(({ p }) => p),
    ).toEqual([60, 64]);
    expect(harness.engine.store.getDocument()).toEqual(songBefore);
    expect(harness.engine.store.getDocument().takes[0]).toEqual(take);
    harness.engine.dispose();
  });
});
