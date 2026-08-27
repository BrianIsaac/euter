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
  it('saves a take whose pitch track has unvoiced frames', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const song = loadExampleSong();
    song.takes = [
      {
        id: 'take-1',
        source: 'mic',
        notes: [{ p: 60, s: 0, d: 1, v: 0.8, source: 'take' }],
        pitch_track: [
          { t: 0, hz: 0, clarity: 0 },
          { t: 0.05, hz: 261.6, clarity: 0.9 },
        ],
        duration_s: 1,
        voiced_ratio: 0.5,
        median_clarity: 0.9,
        pitch_range: [60, 60],
        tempo_hint: 92,
      },
    ];
    expect(() => saveSong(storage, song)).not.toThrow();
    expect(loadSong(storage)?.takes[0]?.pitch_track[0]?.hz).toBe(0);
  });

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

  it('migrates a saved song from before teaching options were added', () => {
    const older = loadExampleSong() as unknown as Record<string, unknown>;
    delete older.option_sets;
    delete older.take_request;
    expect(loadSong({ getItem: () => JSON.stringify(older) })).toMatchObject({
      title: 'First Light',
      option_sets: [],
      take_request: null,
    });
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

  it('flushes a pending edit before a page reload', () => {
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
    const lifecycle = new EventTarget();
    const persistence = createSongPersistence(store, { setItem }, { lifecycle });
    song = { ...song, bpm: 123 };
    for (const listener of listeners) listener();

    lifecycle.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(setItem.mock.calls[0]?.[1] as string)).toMatchObject({ bpm: 123 });
    vi.advanceTimersByTime(250);
    expect(setItem).toHaveBeenCalledTimes(1);
    persistence.dispose();
    vi.useRealTimers();
  });

  it('loads an original, playable four-track example', () => {
    const song = loadExampleSong();
    expect(song.title).toBe('First Light');
    expect(song.tracks.map(({ kind }) => kind)).toEqual(['melody', 'chords', 'bass', 'drums']);
    expect(song.tracks.find(({ id }) => id === 'drums')?.notes.length).toBe(64);
  });
});
