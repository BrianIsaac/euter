import { describe, expect, it } from 'vitest';
import { createHarness } from '../../helpers/harness.ts';

interface InstrumentEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: { track_id: string; instrument: string; loaded: boolean; note?: string };
}

describe('set_instrument', () => {
  it('changes the sound of one track, pins the reason and reports it as audible', async () => {
    const harness = createHarness();

    const envelope = (await harness.invoke('set_instrument', {
      track_id: 'chords',
      instrument: 'vcsl-vibraphone',
      why: 'A vibraphone leaves more room under the melody.',
    })) as InstrumentEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.revision).toBe(1);
    expect(envelope.summary).toBe('Set Chords to vcsl-vibraphone');
    expect(envelope.changed).toContain('track:chords:instrument');
    expect(envelope.data).toEqual({
      track_id: 'chords',
      instrument: 'vcsl-vibraphone',
      loaded: true,
    });

    const song = harness.engine.store.getDocument();
    expect(song.tracks.find(({ id }) => id === 'chords')?.instrument).toBe('vcsl-vibraphone');
    expect(song.tracks.find(({ id }) => id === 'melody')?.instrument).toBe('grand-piano');
    expect(song.notes_log.at(-1)).toMatchObject({
      why: 'A vibraphone leaves more room under the melody.',
      source: 'agent',
      track_id: 'chords',
    });
    harness.engine.dispose();
  });

  it('changes the document but reports it as not yet audible while the audio is locked', async () => {
    const harness = createHarness();
    harness.audio.setState('uninitialised');

    const envelope = (await harness.invoke('set_instrument', {
      track_id: 'melody',
      instrument: 'vcsl-strings',
      why: 'Strings hold the long notes better than the piano.',
    })) as InstrumentEnvelope;

    expect(envelope.data).toEqual({
      track_id: 'melody',
      instrument: 'vcsl-strings',
      loaded: false,
    });
    const song = harness.engine.store.getDocument();
    expect(song.tracks.find(({ id }) => id === 'melody')?.instrument).toBe('vcsl-strings');
    harness.engine.dispose();
  });

  it('refuses an instrument outside the catalogue and an unknown track', async () => {
    const harness = createHarness();

    await expect(
      harness.invoke('set_instrument', {
        track_id: 'chords',
        instrument: 'stradivarius',
        why: 'Not in the catalogue.',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
      recoverable: true,
      message: expect.stringContaining('stradivarius'),
    });

    await expect(
      harness.invoke('set_instrument', {
        track_id: 'strings',
        instrument: 'grand-piano',
        why: 'There is no strings track yet.',
      }),
    ).resolves.toMatchObject({ ok: false, code: 'TRACK_NOT_FOUND' });

    const song = harness.engine.store.getDocument();
    expect(song.revision).toBe(0);
    expect(song.tracks.find(({ id }) => id === 'chords')?.instrument).toBe('electric-piano');
    harness.engine.dispose();
  });
});
