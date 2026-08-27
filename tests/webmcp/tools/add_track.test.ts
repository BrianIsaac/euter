import { describe, expect, it } from 'vitest';
import { createHarness } from '../../helpers/harness.ts';

interface AddTrackEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: { track_id: string | null; name: string | null; kind: string; instrument: string };
}

describe('add_track', () => {
  it('appends the track with the instrument asked for and returns its id and name', async () => {
    const harness = createHarness();
    const before = harness.engine.store.getDocument().tracks.length;

    const envelope = (await harness.invoke('add_track', {
      kind: 'drums',
      instrument: 'pocket-kit',
      name: 'Little Kit',
      why: 'A smaller kit so the pulse stays behind your voice.',
    })) as AddTrackEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.summary).toBe('Added Little Kit with pocket-kit');
    expect(envelope.data).toEqual({
      track_id: 'drums-1',
      name: 'Little Kit',
      kind: 'drums',
      instrument: 'pocket-kit',
    });

    const tracks = harness.engine.store.getDocument().tracks;
    expect(tracks).toHaveLength(before + 1);
    expect(tracks.at(-1)).toMatchObject({
      id: 'drums-1',
      name: 'Little Kit',
      kind: 'drums',
      instrument: 'pocket-kit',
      notes: [],
    });
    harness.engine.dispose();
  });

  it('names the track after its kind and takes that kind default mix', async () => {
    const harness = createHarness();
    const envelope = (await harness.invoke('add_track', {
      kind: 'bass',
      instrument: 'sub-bass',
      why: 'Something to hold the bottom under the chorus.',
    })) as AddTrackEnvelope;

    expect(envelope.data).toMatchObject({ track_id: 'bass-1', name: 'Bass' });
    expect(harness.engine.store.getDocument().tracks.at(-1)).toMatchObject({
      name: 'Bass',
      volume_db: -7,
      pan: 0,
      mute: false,
      solo: false,
    });

    const chordsTrack = (await harness.invoke('add_track', {
      kind: 'chords',
      instrument: 'warm-pad',
      why: 'A pad to sit the chords on.',
    })) as AddTrackEnvelope;
    expect(chordsTrack.data).toMatchObject({ track_id: 'chords-1', name: 'Chords' });
    expect(harness.engine.store.getDocument().tracks.at(-1)).toMatchObject({
      volume_db: -9,
      pan: 0.12,
    });
    harness.engine.dispose();
  });

  it('refuses an instrument that is not in the catalogue', async () => {
    const harness = createHarness();
    const before = harness.engine.store.getDocument().tracks.length;
    await expect(
      harness.invoke('add_track', {
        kind: 'melody',
        instrument: 'stradivarius',
        why: 'No such instrument is loaded.',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
      message:
        'Instrument "stradivarius" is not in the current catalogue. Read get_song_state for names.',
      recoverable: true,
    });
    expect(harness.engine.store.getDocument().tracks).toHaveLength(before);
    expect(harness.engine.store.getDocument().revision).toBe(0);
    harness.engine.dispose();
  });
});
