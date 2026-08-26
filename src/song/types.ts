/**
 * The song document (plan: Architecture item 1). Lane A owns this file from 12:00 on 27 Aug;
 * this first version carries the shape the reads serialise and nothing more.
 *
 * Notes are in beats from the bar start, pitches are MIDI numbers, and raw timing is kept so
 * quantisation is reversible (music §4.4).
 */

export type TrackKind = 'melody' | 'chords' | 'bass' | 'drums';

export type NoteSource = 'human' | 'agent' | 'take';

export type TakeSource = 'mic' | 'import' | 'keyboard' | 'midi';

export type CommandSource = 'human' | 'agent';

export interface Note {
  /** MIDI pitch. */
  p: number;
  /** Start in beats from the bar start. */
  s: number;
  /** Duration in beats. */
  d: number;
  /** Velocity 0-1. */
  v: number;
  /** Recorded start before quantisation, in beats. */
  s_raw?: number;
  /** Recorded duration before quantisation, in beats. */
  d_raw?: number;
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
  /** Bumped whenever `notes` changes so the audio reconciler rebuilds the part. */
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
  refining_job_id?: string;
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

export interface SongDocument {
  /** Monotonic; bumped by every document-mutating command and never by playback or view. */
  revision: number;
  title: string;
  bpm: number;
  time_sig: [number, number];
  key: KeyEstimate;
  bars: number;
  sections: Section[];
  chords: ChordEntry[];
  tracks: Track[];
  takes: Take[];
  notes_log: NotesLogEntry[];
}

/**
 * Creates an empty song at revision 0.
 *
 * @param title - The title shown in the header.
 * @returns A song with no tracks, takes, chords or sections.
 */
export function createEmptySong(title = 'Untitled'): SongDocument {
  return {
    revision: 0,
    title,
    bpm: 90,
    time_sig: [4, 4],
    key: { name: 'C major', confidence: 0, alternatives: [] },
    bars: 8,
    sections: [],
    chords: [],
    tracks: [],
    takes: [],
    notes_log: [],
  };
}
