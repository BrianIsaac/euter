import { describe, expect, it } from 'vitest';
import { createHarness } from '../../helpers/harness.ts';

interface MixEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: {
    track_id: string;
    volume_db: number | null;
    pan: number | null;
    mute: boolean;
    solo: boolean;
  };
}

describe('set_mix', () => {
  it('changes only the fields it is given and returns the whole mix', async () => {
    const harness = createHarness();

    const first = (await harness.invoke('set_mix', {
      track_id: 'chords',
      volume_db: -14,
      why: 'Taking the chords back so the hum leads.',
    })) as MixEnvelope;

    expect(first.ok).toBe(true);
    expect(first.revision).toBe(1);
    expect(first.summary).toBe('Updated the mix for Chords');
    expect(first.changed).toContain('track:chords:mix');
    expect(first.data).toEqual({
      track_id: 'chords',
      volume_db: -14,
      pan: 0.12,
      mute: false,
      solo: false,
    });

    const second = (await harness.invoke('set_mix', {
      track_id: 'chords',
      pan: -0.3,
      mute: true,
      why: 'Parking the chords on the left while we listen to the melody.',
    })) as MixEnvelope;

    expect(second.revision).toBe(2);
    expect(second.data).toEqual({
      track_id: 'chords',
      volume_db: -14,
      pan: -0.3,
      mute: true,
      solo: false,
    });

    const song = harness.engine.store.getDocument();
    const chords = song.tracks.find(({ id }) => id === 'chords');
    expect(chords).toMatchObject({ volume_db: -14, pan: -0.3, mute: true, solo: false });
    expect(song.tracks.find(({ id }) => id === 'bass')).toMatchObject({
      volume_db: -7,
      pan: 0,
      mute: false,
    });
    expect(song.notes_log.at(-1)).toMatchObject({
      why: 'Parking the chords on the left while we listen to the melody.',
      source: 'agent',
      track_id: 'chords',
    });
    harness.engine.dispose();
  });

  it('refuses a call that names no field and one that names no track', async () => {
    const harness = createHarness();

    await expect(
      harness.invoke('set_mix', { track_id: 'bass', why: 'Nothing to change.' }),
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });

    await expect(
      harness.invoke('set_mix', { track_id: 'horns', volume_db: -6, why: 'No horns yet.' }),
    ).resolves.toMatchObject({ ok: false, code: 'TRACK_NOT_FOUND' });

    const song = harness.engine.store.getDocument();
    expect(song.revision).toBe(0);
    expect(song.tracks.find(({ id }) => id === 'bass')?.volume_db).toBe(-7);
    harness.engine.dispose();
  });
});
