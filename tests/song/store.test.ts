import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/webmcp/bus.ts';
import { createSongReducer } from '../../src/song/reducer.ts';
import { loadExampleSong } from '../../src/song/serialise.ts';
import { createSongStore } from '../../src/song/store.ts';

const edit = (type: string, args: Record<string, unknown>): Command => ({
  type,
  args,
  source: 'human',
  why: 'The person changed it.',
});

describe('song store history integration', () => {
  it('undoes, redoes and pops to an activity revision with monotonic live revisions', () => {
    const songStore = createSongStore(loadExampleSong(), createSongReducer());
    songStore.dispatch(edit('set_tempo', { bpm: 100 }));
    songStore.dispatch(edit('set_mix', { track_id: 'bass', volume_db: -20 }));
    songStore.dispatch(edit('set_instrument', { track_id: 'bass', instrument: 'vcsl-strings' }));

    const undo = songStore.undoItem(2);
    expect(undo).toMatchObject({ revision: 4, edits: 2 });
    expect(songStore.getDocument()).toMatchObject({ revision: 4, bpm: 100 });
    expect(songStore.getDocument().tracks.find(({ id }) => id === 'bass')).toMatchObject({
      volume_db: -7,
      instrument: 'sub-bass',
    });

    expect(songStore.redo()).toMatchObject({ revision: 5, edits: 1 });
    expect(songStore.getDocument().tracks.find(({ id }) => id === 'bass')?.volume_db).toBe(-20);
    expect(songStore.undo()).toMatchObject({ revision: 6, edits: 1 });
  });

  it('reports empty history without creating an edit', () => {
    const songStore = createSongStore(loadExampleSong(), createSongReducer());
    expect(songStore.undo()).toBeNull();
    expect(songStore.redo()).toBeNull();
    expect(songStore.undoItem(99)).toBeNull();
    expect(songStore.getDocument().revision).toBe(0);
  });
});
