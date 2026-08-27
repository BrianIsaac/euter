/**
 * The serialisable song document (plan Architecture item 1; Decision 11).
 *
 * Notes use MIDI pitches and absolute beat positions within the song. Tool inputs and bounded
 * selectors translate those positions to and from the requested starting bar. Raw timing is kept
 * on recorded notes so quantisation remains reversible (music section 4.4).
 */

export type TrackKind = 'melody' | 'chords' | 'bass' | 'drums';
export type NoteSource = 'human' | 'agent' | 'take';
export type TakeSource = 'mic' | 'import' | 'keyboard' | 'midi';
export type CommandSource = 'human' | 'agent';
export type StyleName = 'pop' | 'soul' | 'lofi';
export type PartRole = 'bass' | 'chords' | 'drums';

export interface Note {
  /** MIDI pitch. */
  p: number;
  /** Absolute start in beats from the beginning of the song. */
  s: number;
  /** Duration in beats. */
  d: number;
  /** Velocity from 0 to 1. */
  v: number;
  /** Recorded start before quantisation, in absolute beats. */
  s_raw?: number | undefined;
  /** Recorded duration before quantisation, in beats. */
  d_raw?: number | undefined;
  source: NoteSource;
}

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  instrument: string;
  volume_db: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  /** Bumped whenever `notes` changes so the audio reconciler rebuilds its Part. */
  notes_rev: number;
  notes: Note[];
}

export interface PitchFrame {
  /** Seconds from the start of the take. */
  t: number;
  hz: number;
  clarity: number;
}

export interface Take {
  id: string;
  source: TakeSource;
  notes: Note[];
  pitch_track: PitchFrame[];
  duration_s: number;
  voiced_ratio: number;
  median_clarity: number;
  pitch_range: [number, number];
  tempo_hint: number | null;
  refining_job_id?: string | undefined;
}

export interface Section {
  name: string;
  bar_from: number;
  bar_to: number;
}

export interface ChordEntry {
  bar: number;
  symbol: string;
}

export interface KeyAlternative {
  name: string;
  confidence: number;
}

export interface KeyEstimate {
  name: string;
  confidence: number;
  alternatives: KeyAlternative[];
}

export interface NotesLogEntry {
  revision: number;
  why: string;
  bars: [number, number];
  track_id: string | null;
  source: CommandSource;
}

export type TeachingOptionKind = 'chords' | 'feel' | 'part';

export interface TeachingOption {
  id: string;
  label: string;
  why: string;
  chords?: ChordEntry[] | undefined;
  style?: StyleName | undefined;
  track_id?: string | undefined;
  notes?: Note[] | undefined;
}

export interface TeachingOptionSet {
  id: string;
  kind: TeachingOptionKind;
  bar_from: number;
  bar_to: number;
  options: TeachingOption[];
  chosen_option_id: string | null;
}

export interface TakeRequest {
  id: string;
  track_id: string;
  bar_from: number;
  bar_to: number;
  prompt: string;
}

export interface SongDocument {
  /** Monotonic; every edit bumps it, while playback and view do not. */
  revision: number;
  title: string;
  bpm: number;
  time_sig: [4, 4];
  key: KeyEstimate;
  bars: number;
  sections: Section[];
  chords: ChordEntry[];
  tracks: Track[];
  takes: Take[];
  notes_log: NotesLogEntry[];
  /** Alternatives shown as cards until the person chooses one. */
  option_sets: TeachingOptionSet[];
  /** A visible, armed invitation for the person to supply a part. */
  take_request: TakeRequest | null;
}

/** The immutable time signature used by the first-song product. */
export const DEFAULT_TIME_SIGNATURE: [4, 4] = [4, 4];

/**
 * Creates an empty song at revision 0.
 *
 * @param title - The title shown in the header.
 * @returns A song with eight empty bars.
 */
export function createEmptySong(title = 'Untitled'): SongDocument {
  return {
    revision: 0,
    title,
    bpm: 90,
    time_sig: [...DEFAULT_TIME_SIGNATURE],
    key: { name: 'C major', confidence: 0, alternatives: [] },
    bars: 8,
    sections: [],
    chords: [],
    tracks: [],
    takes: [],
    notes_log: [],
    option_sets: [],
    take_request: null,
  };
}

/**
 * Produces a detached document snapshot suitable for history and persistence.
 *
 * @param song - The song to clone.
 * @returns A deep clone containing only serialisable data.
 */
export function cloneSong(song: SongDocument): SongDocument {
  return structuredClone(song);
}
