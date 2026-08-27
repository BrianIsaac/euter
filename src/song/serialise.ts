/** Debounced local persistence and the original example song (plan Architecture item 1). */
import { z } from 'zod';
import type { SongDocument } from './types.ts';

export const SONG_STORAGE_KEY = 'euter.song.v1';

const noteSchema = z
  .object({
    p: z.number().int().min(24).max(96),
    s: z.number().finite().nonnegative(),
    d: z.number().finite().positive(),
    v: z.number().finite().min(0).max(1),
    s_raw: z.number().finite().nonnegative().optional(),
    d_raw: z.number().finite().positive().optional(),
    source: z.enum(['human', 'agent', 'take']),
  })
  .strict();

const chordSchema = z
  .object({ bar: z.number().int().positive(), symbol: z.string().trim().min(1).max(24) })
  .strict();

export const persistedSongSchema: z.ZodType<SongDocument> = z
  .object({
    revision: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(120),
    bpm: z.number().finite().min(40).max(220),
    time_sig: z.tuple([z.literal(4), z.literal(4)]),
    key: z
      .object({
        name: z.string().trim().min(2).max(40),
        confidence: z.number().finite().min(0).max(1),
        alternatives: z
          .array(
            z
              .object({
                name: z.string().trim().min(2).max(40),
                confidence: z.number().finite().min(0).max(1),
              })
              .strict(),
          )
          .max(3),
      })
      .strict(),
    bars: z.number().int().positive().max(4096),
    sections: z.array(
      z
        .object({
          name: z.string().trim().min(1).max(80),
          bar_from: z.number().int().positive(),
          bar_to: z.number().int().positive(),
        })
        .strict(),
    ),
    chords: z.array(chordSchema),
    tracks: z.array(
      z
        .object({
          id: z.string().trim().min(1).max(64),
          name: z.string().trim().min(1).max(80),
          kind: z.enum(['melody', 'chords', 'bass', 'drums']),
          instrument: z.string().trim().min(1).max(80),
          volume_db: z.number().finite().min(-60).max(6),
          pan: z.number().finite().min(-1).max(1),
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
          id: z.string().trim().min(1).max(64),
          source: z.enum(['mic', 'import', 'keyboard', 'midi']),
          notes: z.array(noteSchema),
          pitch_track: z.array(
            z
              .object({
                t: z.number().finite().nonnegative(),
                hz: z.number().finite().nonnegative(),
                clarity: z.number().finite().min(0).max(1),
              })
              .strict(),
          ),
          duration_s: z.number().finite().nonnegative(),
          voiced_ratio: z.number().finite().min(0).max(1),
          median_clarity: z.number().finite().min(0).max(1),
          pitch_range: z.tuple([z.number().finite(), z.number().finite()]),
          tempo_hint: z.number().finite().positive().nullable(),
          refining_job_id: z.string().trim().min(1).max(64).optional(),
        })
        .strict(),
    ),
    notes_log: z.array(
      z
        .object({
          revision: z.number().int().nonnegative(),
          why: z.string().trim().min(1).max(200),
          bars: z.tuple([z.number().int().positive(), z.number().int().positive()]),
          track_id: z.string().trim().min(1).max(64).nullable(),
          source: z.enum(['human', 'agent']),
        })
        .strict(),
    ),
    option_sets: z.array(
      z
        .object({
          id: z.string().trim().min(1).max(64),
          kind: z.enum(['chords', 'feel', 'part']),
          bar_from: z.number().int().positive(),
          bar_to: z.number().int().positive(),
          options: z.array(
            z
              .object({
                id: z.string().trim().min(1).max(64),
                label: z.string().trim().min(1).max(80),
                why: z.string().trim().min(1).max(200),
                chords: z.array(chordSchema).optional(),
                style: z.enum(['pop', 'soul', 'lofi']).optional(),
                track_id: z.string().trim().min(1).max(64).optional(),
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
        id: z.string().trim().min(1).max(64),
        track_id: z.string().trim().min(1).max(64),
        bar_from: z.number().int().positive(),
        bar_to: z.number().int().positive(),
        prompt: z.string().trim().min(1).max(200),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((song, context) => {
    for (const section of song.sections) {
      if (section.bar_to < section.bar_from || section.bar_to > song.bars) {
        context.addIssue({
          code: 'custom',
          message: `Section "${section.name}" is outside the song.`,
        });
      }
    }
    const chordBars = new Set<number>();
    for (const chord of song.chords) {
      if (chord.bar > song.bars || chordBars.has(chord.bar)) {
        context.addIssue({
          code: 'custom',
          message: `Chord bar ${chord.bar} is invalid or duplicated.`,
        });
      }
      chordBars.add(chord.bar);
    }
    const songBeats = song.bars * song.time_sig[0];
    for (const track of song.tracks) {
      if (track.notes.some((note) => note.s >= songBeats || note.s + note.d > songBeats)) {
        context.addIssue({
          code: 'custom',
          message: `Track "${track.id}" has a note outside the song.`,
        });
      }
    }
  });

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
  lifecycle?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
}

function migratePersistedSong(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return {
    ...record,
    option_sets: Object.hasOwn(record, 'option_sets') ? record.option_sets : [],
    take_request: Object.hasOwn(record, 'take_request') ? record.take_request : null,
  };
}

/**
 * Loads, migrates and validates a song. Malformed values are ignored rather than crashing startup.
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
    return persistedSongSchema.parse(migratePersistedSong(JSON.parse(value)));
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
  const lifecycle =
    options.lifecycle === undefined
      ? typeof window === 'undefined'
        ? null
        : window
      : options.lifecycle;
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
  const onPageHide = (): void => flush();
  lifecycle?.addEventListener('pagehide', onPageHide);

  return {
    flush,
    dispose() {
      unsubscribe();
      lifecycle?.removeEventListener('pagehide', onPageHide);
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
