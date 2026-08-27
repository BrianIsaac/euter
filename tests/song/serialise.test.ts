import { describe, expect, it, vi } from 'vitest';
import {
  createSongPersistence,
  loadExampleSong,
  loadSong,
  saveSong,
  SONG_STORAGE_KEY,
} from '../../src/song/serialise.ts';
import { createEmptySong } from '../../src/song/types.ts';

describe('song serialisation', () => {
  it('round-trips a validated document', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const song = loadExampleSong();
    saveSong(storage, song);
    expect(loadSong(storage)).toEqual(song);
    expect(values.has(SONG_STORAGE_KEY)).toBe(true);
  });

  it('ignores malformed storage values', () => {
    expect(loadSong({ getItem: () => '{no' })).toBeNull();
    expect(loadSong({ getItem: () => JSON.stringify({ title: 'half a song' }) })).toBeNull();
    const invalidNote = loadExampleSong();
    const firstNote = invalidNote.tracks[0]?.notes[0];
    if (firstNote) firstNote.p = 200;
    expect(loadSong({ getItem: () => JSON.stringify(invalidNote) })).toBeNull();
    const duplicateChord = loadExampleSong();
    duplicateChord.chords.push({ bar: 1, symbol: 'G' });
    expect(loadSong({ getItem: () => JSON.stringify(duplicateChord) })).toBeNull();
  });

  it('debounces store changes and flushes the latest song', () => {
    vi.useFakeTimers();
    let song = createEmptySong();
    const listeners = new Set<() => void>();
    const store = {
      getDocument: () => song,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const setItem = vi.fn();
    const persistence = createSongPersistence(store, { setItem }, { delayMs: 50 });
    song = { ...song, bpm: 100 };
    for (const listener of listeners) listener();
    song = { ...song, bpm: 110 };
    for (const listener of listeners) listener();
    vi.advanceTimersByTime(49);
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(JSON.parse(setItem.mock.calls[0]?.[1] as string)).toMatchObject({ bpm: 110 });
    persistence.dispose();
    expect(listeners.size).toBe(0);
    vi.useRealTimers();
  });

  it('loads an original, playable four-track example', () => {
    const song = loadExampleSong();
    expect(song.title).toBe('First Light');
    expect(song.tracks.map(({ kind }) => kind)).toEqual(['melody', 'chords', 'bass', 'drums']);
    expect(song.tracks.find(({ id }) => id === 'drums')?.notes.length).toBe(64);
  });
});
