import { describe, expect, it } from 'vitest';
import { createHarness } from '../../helpers/harness.ts';

interface BarView {
  bar: number;
  notes: { p: number; s: number; d: number; v: number }[];
}

interface NotesEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: { track_id: string; bars: BarView[] };
}

describe('get_track_notes', () => {
  it('returns one entry per bar with onsets relative to that bar', async () => {
    const harness = createHarness();
    const envelope = (await harness.invoke('get_track_notes', {
      track_id: 'melody',
      bar_from: 1,
      bar_to: 2,
    })) as NotesEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.revision).toBe(0);
    expect(envelope.changed).toEqual([]);
    expect(envelope.summary).toBe('melody bars 1-2: 7 notes');
    expect(envelope.data.track_id).toBe('melody');
    expect(envelope.data.bars.map(({ bar }) => bar)).toEqual([1, 2]);
    expect(envelope.data.bars[0]?.notes).toEqual([
      { p: 64, s: 0, d: 1, v: 0.78 },
      { p: 67, s: 1, d: 1, v: 0.78 },
      { p: 69, s: 2, d: 1, v: 0.78 },
      { p: 67, s: 3, d: 1, v: 0.78 },
    ]);
    expect(envelope.data.bars[1]?.notes.map(({ s }) => s)).toEqual([0, 2, 3]);

    const empty = (await harness.invoke('get_track_notes', {
      track_id: 'chords',
      bar_from: 1,
      bar_to: 2,
    })) as NotesEnvelope;
    expect(empty.data.bars).toEqual([
      { bar: 1, notes: [] },
      { bar: 2, notes: [] },
    ]);
    harness.engine.dispose();
  });

  it('refuses a track that is not in the song and a bar past the end', async () => {
    const harness = createHarness();
    await expect(
      harness.invoke('get_track_notes', { track_id: 'strings', bar_from: 1, bar_to: 2 }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'TRACK_NOT_FOUND',
      message: 'Track "strings" does not exist.',
      recoverable: true,
    });
    await expect(
      harness.invoke('get_track_notes', { track_id: 'melody', bar_from: 8, bar_to: 9 }),
    ).resolves.toMatchObject({ ok: false, code: 'OUT_OF_RANGE', message: 'The song has 8 bars.' });
    harness.engine.dispose();
  });

  it('refuses more than eight bars in one read', async () => {
    const harness = createHarness();
    harness.engine.store.dispatch({
      type: 'arrange',
      args: { sections: [{ name: 'Verse', bar_from: 1, bar_to: 8, repeat: 2 }] },
      source: 'agent',
      why: 'Longer song.',
    });
    expect(harness.engine.store.getDocument().bars).toBe(24);

    await expect(
      harness.invoke('get_track_notes', { track_id: 'melody', bar_from: 1, bar_to: 10 }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'RESULT_TOO_LARGE',
      message: 'Read at most 8 bars at once.',
    });
    await expect(
      harness.invoke('get_track_notes', { track_id: 'melody', bar_from: 1, bar_to: 8 }),
    ).resolves.toMatchObject({ ok: true });
    harness.engine.dispose();
  });
});
