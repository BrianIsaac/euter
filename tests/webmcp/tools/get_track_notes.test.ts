import { describe, expect, it } from 'vitest';
import { loadExampleSong } from '../../../src/song/serialise.ts';
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
  data: {
    track_id: string;
    bars: BarView[];
    notes_total: number;
    note_offset: number;
    next_note_offset: number | null;
  };
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
    expect(envelope.summary).toBe('melody bars 1-2: notes 1-7 of 7');
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

  it('pages a dense eight-bar note range without exceeding the output budget', async () => {
    const song = loadExampleSong();
    const melody = song.tracks.find(({ id }) => id === 'melody');
    if (!melody) throw new Error('example melody missing');
    melody.notes = Array.from({ length: 96 }, (_, index) => ({
      p: 48 + (index % 24),
      s: (index % 32) + (index % 4) * 0.001,
      d: 0.125,
      v: 0.8,
      source: 'human' as const,
    }));
    const harness = createHarness({ engine: { document: song } });

    const first = (await harness.invoke('get_track_notes', {
      track_id: 'melody',
      bar_from: 1,
      bar_to: 8,
      note_limit: 24,
    })) as NotesEnvelope;
    expect(first.ok).toBe(true);
    expect(first.data.notes_total).toBe(96);
    expect(first.data.note_offset).toBe(0);
    expect(first.data.next_note_offset).toBe(24);
    expect(first.data.bars.flatMap(({ notes }) => notes)).toHaveLength(24);
    expect(JSON.stringify(first).length).toBeLessThanOrEqual(1500);

    const last = (await harness.invoke('get_track_notes', {
      track_id: 'melody',
      bar_from: 1,
      bar_to: 8,
      note_offset: 72,
      note_limit: 24,
    })) as NotesEnvelope;
    expect(last.ok).toBe(true);
    expect(last.data.next_note_offset).toBeNull();
    expect(last.data.bars.flatMap(({ notes }) => notes)).toHaveLength(24);
    expect(JSON.stringify(last).length).toBeLessThanOrEqual(1500);
    harness.engine.dispose();
  });
});
