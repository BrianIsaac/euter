/** Debounced local persistence and the original example song (plan Architecture item 1). */
import { z } from 'zod';
import type { SongDocument } from './types.ts';

export const SONG_STORAGE_KEY = 'euter.song.v1';

const noteSchema = z
  .object({
    p: z.number(),
    s: z.number(),
    d: z.number(),
    v: z.number(),
    s_raw: z.number().optional(),
    d_raw: z.number().optional(),
    source: z.enum(['human', 'agent', 'take']),
  })
  .strict();

const chordSchema = z.object({ bar: z.number().int(), symbol: z.string() }).strict();

export const persistedSongSchema: z.ZodType<SongDocument> = z
  .object({
    revision: z.number().int().nonnegative(),
    title: z.string(),
    bpm: z.number(),
    time_sig: z.tuple([z.number(), z.number()]),
    key: z
      .object({
        name: z.string(),
        confidence: z.number(),
        alternatives: z.array(z.object({ name: z.string(), confidence: z.number() }).strict()),
      })
      .strict(),
    bars: z.number().int().positive(),
    sections: z.array(
      z.object({ name: z.string(), bar_from: z.number().int(), bar_to: z.number().int() }).strict(),
    ),
    chords: z.array(chordSchema),
    tracks: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          kind: z.enum(['melody', 'chords', 'bass', 'drums']),
          instrument: z.string(),
          volume_db: z.number(),
          pan: z.number(),
          mute: z.boolean(),
          solo: z.boolean(),
          notes_rev: z.number().int().nonnegative(),
          notes: z.array(noteSchema),
        })
        .strict(),
    ),
    takes: z.array(
      z
        .object({
          id: z.string(),
          source: z.enum(['mic', 'import', 'keyboard', 'midi']),
          notes: z.array(noteSchema),
          pitch_track: z.array(
            z.object({ t: z.number(), hz: z.number(), clarity: z.number() }).strict(),
          ),
          duration_s: z.number(),
          voiced_ratio: z.number(),
          median_clarity: z.number(),
          pitch_range: z.tuple([z.number(), z.number()]),
          tempo_hint: z.number().nullable(),
          refining_job_id: z.string().optional(),
        })
        .strict(),
    ),
    notes_log: z.array(
      z
        .object({
          revision: z.number().int(),
          why: z.string(),
          bars: z.tuple([z.number().int(), z.number().int()]),
          track_id: z.string().nullable(),
          source: z.enum(['human', 'agent']),
        })
        .strict(),
    ),
    option_sets: z.array(
      z
        .object({
          id: z.string(),
          kind: z.enum(['chords', 'feel', 'part']),
          bar_from: z.number().int(),
          bar_to: z.number().int(),
          options: z.array(
            z
              .object({
                id: z.string(),
                label: z.string(),
                why: z.string(),
                chords: z.array(chordSchema).optional(),
                style: z.enum(['pop', 'soul', 'lofi']).optional(),
                track_id: z.string().optional(),
                notes: z.array(noteSchema).optional(),
              })
              .strict(),
          ),
          chosen_option_id: z.string().nullable(),
        })
        .strict(),
    ),
    take_request: z
      .object({
        id: z.string(),
        track_id: z.string(),
        bar_from: z.number().int(),
        bar_to: z.number().int(),
        prompt: z.string(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export interface SongStoreReader {
  getDocument(): SongDocument;
  subscribe(listener: () => void): () => void;
}

export interface SongPersistence {
  flush(): void;
  dispose(): void;
}

export interface PersistenceOptions {
  key?: string;
  delayMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

/**
 * Loads and validates a song. Malformed or stale values are ignored rather than crashing startup.
 *
 * @param storage - Usually `window.localStorage`.
 * @param key - Storage key.
 * @returns The saved song, or null when no valid value exists.
 */
export function loadSong(
  storage: Pick<Storage, 'getItem'>,
  key = SONG_STORAGE_KEY,
): SongDocument | null {
  const value = storage.getItem(key);
  if (value === null) return null;
  try {
    return persistedSongSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

/** Writes one validated, serialisable song value. */
export function saveSong(
  storage: Pick<Storage, 'setItem'>,
  song: SongDocument,
  key = SONG_STORAGE_KEY,
): void {
  storage.setItem(key, JSON.stringify(persistedSongSchema.parse(song)));
}

/**
 * Subscribes to a song store and persists changes after a short quiet period.
 *
 * @param store - The live song store.
 * @param storage - Usually `window.localStorage`.
 * @param options - Key, delay and timer injection for tests.
 * @returns Flush and disposal controls.
 */
export function createSongPersistence(
  store: SongStoreReader,
  storage: Pick<Storage, 'setItem'>,
  options: PersistenceOptions = {},
): SongPersistence {
  const key = options.key ?? SONG_STORAGE_KEY;
  const delayMs = options.delayMs ?? 250;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    if (timer !== undefined) {
      clearTimer(timer);
      timer = undefined;
    }
    saveSong(storage, store.getDocument(), key);
  };
  const unsubscribe = store.subscribe(() => {
    if (timer !== undefined) clearTimer(timer);
    timer = setTimer(flush, delayMs);
  });

  return {
    flush,
    dispose() {
      unsubscribe();
      if (timer !== undefined) flush();
    },
  };
}

/**
 * Loads the original example used when a person wants to explore without recording first.
 *
 * @returns An eight-bar C-major song with melody, chords, bass and drums.
 */
export function loadExampleSong(): SongDocument {
  const melody = [
    [64, 0, 1],
    [67, 1, 1],
    [69, 2, 1],
    [67, 3, 1],
    [65, 4, 2],
    [64, 6, 1],
    [62, 7, 1],
    [64, 8, 1],
    [67, 9, 1],
    [72, 10, 2],
    [69, 12, 1],
    [67, 13, 1],
    [65, 14, 2],
  ] as const;
  const chords = [
    { bar: 1, symbol: 'C' },
    { bar: 2, symbol: 'F' },
    { bar: 3, symbol: 'Am' },
    { bar: 4, symbol: 'G' },
    { bar: 5, symbol: 'C' },
    { bar: 6, symbol: 'F' },
    { bar: 7, symbol: 'Dm' },
    { bar: 8, symbol: 'G' },
  ];
  const bassRoots = [36, 41, 45, 43, 36, 41, 38, 43];
  const drumNotes = Array.from({ length: 8 }, (_, bar) =>
    Array.from({ length: 8 }, (_, step) => ({
      p: step % 4 === 0 ? 36 : step % 4 === 2 ? 38 : 42,
      s: bar * 4 + step * 0.5,
      d: 0.2,
      v: step % 4 === 0 ? 0.85 : 0.58,
      source: 'agent' as const,
    })),
  ).flat();

  return {
    revision: 0,
    title: 'First Light',
    bpm: 92,
    time_sig: [4, 4],
    key: {
      name: 'C major',
      confidence: 0.86,
      alternatives: [{ name: 'A minor', confidence: 0.62 }],
    },
    bars: 8,
    sections: [
      { name: 'Verse', bar_from: 1, bar_to: 4 },
      { name: 'Chorus', bar_from: 5, bar_to: 8 },
    ],
    chords,
    tracks: [
      {
        id: 'melody',
        name: 'Melody',
        kind: 'melody',
        instrument: 'grand-piano',
        volume_db: -3,
        pan: 0,
        mute: false,
        solo: false,
        notes_rev: 1,
        notes: melody.map(([p, s, d]) => ({ p, s, d, v: 0.78, source: 'human' })),
      },
      {
        id: 'chords',
        name: 'Chords',
        kind: 'chords',
        instrument: 'electric-piano',
        volume_db: -9,
        pan: 0.12,
        mute: false,
        solo: false,
        notes_rev: 1,
        notes: [],
      },
      {
        id: 'bass',
        name: 'Bass',
        kind: 'bass',
        instrument: 'sub-bass',
        volume_db: -7,
        pan: 0,
        mute: false,
        solo: false,
        notes_rev: 1,
        notes: bassRoots.map((p, bar) => ({
          p,
          s: bar * 4,
          d: 2,
          v: 0.72,
          source: 'agent',
        })),
      },
      {
        id: 'drums',
        name: 'Drums',
        kind: 'drums',
        instrument: 'studio-kit',
        volume_db: -8,
        pan: 0,
        mute: false,
        solo: false,
        notes_rev: 1,
        notes: drumNotes,
      },
    ],
    takes: [],
    notes_log: [],
    option_sets: [],
    take_request: null,
  };
}
