import { describe, expect, it } from 'vitest';
import { loadExampleSong } from '../../../src/song/serialise.ts';
import type { Note, Track } from '../../../src/song/types.ts';
import { createHarness } from '../../helpers/harness.ts';

interface GenerateEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: {
    track_id: string;
    role: string;
    style: string;
    notes: number;
    target_bars: [number, number];
  };
}

const lofiDrums = {
  track_id: 'drums',
  role: 'drums',
  style: 'lofi',
  bar_from: 1,
  bar_to: 4,
  why: 'A laid-back kit so the hum has something to lean on.',
};

function track(notes: readonly Track[], id: string): Track {
  const found = notes.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`The example song has no "${id}" track.`);
  return found;
}

function inBars(notes: readonly Note[], fromBeat: number, toBeat: number): Note[] {
  return notes.filter(({ s }) => s >= fromBeat && s < toBeat);
}

describe('generate_part', () => {
  it('writes a deterministic part over the bars it is given and leaves the rest alone', async () => {
    const harness = createHarness();
    const before = track(harness.engine.store.getDocument().tracks, 'drums');

    const envelope = (await harness.invoke('generate_part', lofiDrums)) as GenerateEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.revision).toBe(1);
    expect(envelope.summary).toBe('Generated lofi drums in bars 1-4');
    expect(envelope.data).toEqual({
      track_id: 'drums',
      role: 'drums',
      style: 'lofi',
      notes: 80,
      target_bars: [1, 4],
    });

    const after = track(harness.engine.store.getDocument().tracks, 'drums');
    expect(after.notes_rev).toBe(before.notes_rev + 1);
    expect(after.notes).toHaveLength(80);
    expect(inBars(after.notes, 0, 16)).toHaveLength(48);
    expect(inBars(after.notes, 0, 16)).not.toEqual(inBars(before.notes, 0, 16));
    expect(inBars(after.notes, 16, 32)).toEqual(inBars(before.notes, 16, 32));
    expect(harness.engine.store.getDocument().notes_log.at(-1)).toMatchObject({
      why: lofiDrums.why,
      source: 'agent',
      track_id: 'drums',
      bars: [1, 4],
    });

    const twin = createHarness();
    await twin.invoke('generate_part', lofiDrums);
    expect(track(twin.engine.store.getDocument().tracks, 'drums').notes).toEqual(after.notes);

    twin.engine.dispose();
    harness.engine.dispose();
  });

  it('refuses a role the track is not for', async () => {
    const harness = createHarness();

    await expect(
      harness.invoke('generate_part', {
        track_id: 'drums',
        role: 'bass',
        style: 'pop',
        bar_from: 1,
        bar_to: 4,
        why: 'The drums track cannot hold a bass line.',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
      message: expect.stringContaining('is drums'),
    });

    const song = harness.engine.store.getDocument();
    expect(song.revision).toBe(0);
    expect(track(song.tracks, 'drums').notes_rev).toBe(1);
    harness.engine.dispose();
  });

  it('asks for chords first when the part follows the harmony', async () => {
    const harness = createHarness({
      engine: { document: { ...loadExampleSong(), chords: [] } },
    });

    for (const [trackId, role] of [
      ['bass', 'bass'],
      ['chords', 'chords'],
    ]) {
      await expect(
        harness.invoke('generate_part', {
          track_id: trackId,
          role,
          style: 'soul',
          bar_from: 1,
          bar_to: 4,
          why: 'There is no harmony to follow yet.',
        }),
      ).resolves.toMatchObject({
        ok: false,
        code: 'INVALID_ARGUMENT',
        message: 'Set chords before generating this part.',
      });
    }

    await expect(harness.invoke('generate_part', lofiDrums)).resolves.toMatchObject({ ok: true });
    harness.engine.dispose();
  });

  it('refuses bars past the end of the song', async () => {
    const harness = createHarness();

    await expect(
      harness.invoke('generate_part', {
        track_id: 'bass',
        role: 'bass',
        style: 'pop',
        bar_from: 7,
        bar_to: 12,
        why: 'The song is only eight bars long.',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'OUT_OF_RANGE',
      message: 'The song has 8 bars.',
    });

    expect(harness.engine.store.getDocument().revision).toBe(0);
    harness.engine.dispose();
  });
});
