import { describe, expect, it } from 'vitest';
import { createHarness } from '../../helpers/harness.ts';

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
});
