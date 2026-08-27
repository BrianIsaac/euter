import { describe, expect, it } from 'vitest';
import { createSongHistory } from '../../src/song/history.ts';
import { createEmptySong } from '../../src/song/types.ts';

describe('song history', () => {
  it('undoes and redoes detached snapshots linearly', () => {
    const history = createSongHistory();
    const before = createEmptySong();
    const after = { ...before, revision: 1, bpm: 100 };
    history.record(before, after, 'Set tempo to 100 bpm');
    after.key.name = 'D major';

    expect(history.undo()).toMatchObject({
      document: { revision: 0, bpm: 90 },
      summary: 'Undid Set tempo to 100 bpm',
      edits: 1,
    });
    expect(history.redo()).toMatchObject({
      document: { revision: 1, bpm: 100, key: { name: 'C major' } },
      edits: 1,
    });
  });

  it('clears redo on a new branch', () => {
    const history = createSongHistory();
    const song = createEmptySong();
    history.record(song, { ...song, revision: 1, bpm: 100 }, 'First');
    history.undo();
    history.record(song, { ...song, revision: 2, bpm: 80 }, 'Replacement');
    expect(history.redo()).toBeNull();
  });

  it('caps history at 200 snapshots', () => {
    const history = createSongHistory();
    for (let revision = 1; revision <= 205; revision += 1) {
      const before = { ...createEmptySong(), revision: revision - 1 };
      history.record(before, { ...before, revision }, `Edit ${revision}`);
    }
    expect(history.getPast()).toHaveLength(200);
    expect(history.getPast()[0]?.revision).toBe(6);
  });

  it('pops back to before an activity item and reports every removed edit', () => {
    const history = createSongHistory();
    let current = createEmptySong();
    for (let revision = 1; revision <= 4; revision += 1) {
      const next = { ...current, revision, bpm: 90 + revision };
      history.record(current, next, `Edit ${revision}`);
      current = next;
    }
    const move = history.undoItem(2);
    expect(move).toMatchObject({
      document: { revision: 1, bpm: 91 },
      edits: 3,
      revision: 2,
    });
    expect(move?.summary).toContain('2 newer edits');
    expect(history.redo()?.revision).toBe(2);
  });

  it('refuses invalid limits and missing items', () => {
    expect(() => createSongHistory(0)).toThrow(RangeError);
    expect(createSongHistory().undoItem(9)).toBeNull();
  });
});
