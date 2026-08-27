import { describe, expect, it } from 'vitest';
import { createHarness } from '../../helpers/harness.ts';

interface WriteEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: { track_id: string; notes: number; target_bars: [number, number] };
}

describe('set_notes', () => {
  it('writes the notes from bar_from, replaces those bars and pins the reason', async () => {
    const harness = createHarness();
    const envelope = (await harness.invoke('set_notes', {
      track_id: 'melody',
      bar_from: 3,
      notes: [
        { p: 72, s: 0, d: 1 },
        { p: 74, s: 2, d: 1, v: 0.5 },
      ],
      replace: true,
      why: 'Lifting the third bar an octave so the chorus has somewhere to go.',
    })) as WriteEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.revision).toBe(1);
    expect(envelope.summary).toBe('Set 2 notes in bars 3-3 of Melody');
    expect(envelope.data).toEqual({ track_id: 'melody', notes: 2, target_bars: [3, 3] });
    expect(envelope.changed).toContain('track:melody:notes');

    const song = harness.engine.store.getDocument();
    const melody = song.tracks.find(({ id }) => id === 'melody');
    expect(melody?.notes.filter(({ s }) => s >= 8 && s < 12)).toEqual([
      { p: 72, s: 8, d: 1, v: 0.8, source: 'agent' },
      { p: 74, s: 10, d: 1, v: 0.5, source: 'agent' },
    ]);
    expect(melody?.notes).toHaveLength(12);
    expect(song.notes_log.at(-1)).toMatchObject({
      why: 'Lifting the third bar an octave so the chorus has somewhere to go.',
      bars: [3, 3],
      track_id: 'melody',
      source: 'agent',
    });
    harness.engine.dispose();
  });

  it('refuses more than eight bars of notes and notes past the end of the song', async () => {
    const harness = createHarness();
    await expect(
      harness.invoke('set_notes', {
        track_id: 'melody',
        bar_from: 1,
        notes: [
          { p: 60, s: 0, d: 1 },
          { p: 60, s: 32, d: 1 },
        ],
        replace: true,
        why: 'Nine bars in one call.',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'OUT_OF_RANGE',
      message: 'set_notes accepts at most eight bars per call.',
    });

    await expect(
      harness.invoke('set_notes', {
        track_id: 'melody',
        bar_from: 8,
        notes: [
          { p: 60, s: 0, d: 1 },
          { p: 62, s: 4, d: 1 },
        ],
        replace: true,
        why: 'The second bar of this run does not exist yet.',
      }),
    ).resolves.toMatchObject({ ok: false, code: 'OUT_OF_RANGE', message: 'The song has 8 bars.' });

    expect(harness.engine.store.getDocument().revision).toBe(0);
    harness.engine.dispose();
  });

  it('accepts a note ending exactly at the eight-bar replacement boundary', async () => {
    const harness = createHarness();
    await expect(
      harness.invoke('set_notes', {
        track_id: 'melody',
        bar_from: 1,
        notes: [{ p: 60, s: 0, d: 32 }],
        replace: true,
        why: 'One held note across the complete eight-bar song.',
      }),
    ).resolves.toMatchObject({
      ok: true,
      data: { target_bars: [1, 8] },
    });
    expect(harness.engine.store.getDocument().tracks[0]?.notes[0]).toMatchObject({ s: 0, d: 32 });
    harness.engine.dispose();
  });

  it('refuses a track that is not on the song', async () => {
    const harness = createHarness();
    await expect(
      harness.invoke('set_notes', {
        track_id: 'strings',
        bar_from: 1,
        notes: [{ p: 60, s: 0, d: 1 }],
        replace: true,
        why: 'There is no strings track.',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'TRACK_NOT_FOUND',
      message: 'Track "strings" does not exist.',
      recoverable: true,
    });
    expect(harness.engine.store.getDocument().revision).toBe(0);
    harness.engine.dispose();
  });
});
