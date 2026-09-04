/**
 * The serialisable song document (plan Architecture item 1; Decision 11).
 *
 * Notes use MIDI pitches and absolute beat positions within the song. Tool inputs and bounded
 * selectors translate those positions to and from the requested starting bar. Raw timing is kept
 * on recorded notes so quantisation remains reversible (music section 4.4).
 */

export type TrackKind = 'melody' | 'chords' | 'bass' | 'drums' | 'vocal';
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
  /** Bumped whenever `clips` changes so the audio reconciler rebuilds its clip Part. */
  clips_rev: number;
  clips: AudioClip[];
}

/** A serialisable reference from a track timeline to audio retained by a take. */
export interface AudioClip {
  id: string;
  take_id: string;
  /** Absolute start in beats from the beginning of the song. */
  s: number;
  /** 0 preserves performed pitch; 1 moves voiced grains fully onto notes in the song key. */
  tuning_strength?: number | undefined;
  /** Audio-warp settings written by the same set_quantize control as symbolic notes. */
  timing_grid?: '8n' | '16n' | undefined;
  timing_strength?: number | undefined;
  timing_swing?: number | undefined;
}

/** Mono PCM kept in JSON-safe form so history and persistence retain the person's voice. */
export interface TakeAudio {
  encoding: 'pcm16-base64';
  sample_rate: number;
  channels: 1;
  samples: string;
  /** Leading capture time (count-in and measured Web Audio latency) omitted during playback. */
  trim_start_s: number;
  /** Song position represented by the first audible sample after trimming. */
  start_beat: number;
  /** Evidence behind automatic placement for microphone takes; absent on legacy/imported audio. */
  alignment?: TakeAudioAlignment | undefined;
}

export interface TakeAudioAlignment {
  method: 'worklet-clock-and-browser-latency';
  /** Worklet-clock interval from capture start to the arranged recording boundary. */
  capture_offset_s: number;
  /** MediaStreamTrack latency reported for the active microphone device. */
  input_latency_s: number;
  /** Web Audio processing and hardware-output estimates read for this take. */
  base_latency_s: number;
  output_latency_s: number;
  /** Sum actually removed from the front of retained PCM. */
  compensation_s: number;
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
  /** Destination captured with the take, when recording was armed on a track. */
  target_track_id?: string | undefined;
  /** Requested or inferred bars the performance belongs to. */
  target_bars?: [number, number] | undefined;
  notes: Note[];
  pitch_track: PitchFrame[];
  duration_s: number;
  voiced_ratio: number;
  median_clarity: number;
  pitch_range: [number, number];
  tempo_hint: number | null;
  /** Absent on legacy, keyboard and MIDI takes, which never carried recorded audio. */
  audio?: TakeAudio | undefined;
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

export type TeachingOptionKind = 'chords' | 'feel' | 'part' | 'take';

export interface TeachingOption {
  id: string;
  label: string;
  why: string;
  chords?: ChordEntry[] | undefined;
  style?: StyleName | undefined;
  track_id?: string | undefined;
  notes?: Note[] | undefined;
  /** True only for the raw escape card added by a take proposal. */
  raw_take?: boolean | undefined;
}

export interface TeachingOptionSet {
  id: string;
  kind: TeachingOptionKind;
  bar_from: number;
  bar_to: number;
  take_id?: string | undefined;
  track_id?: string | undefined;
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
export const DEFAULT_BPM = 92;
export const DEFAULT_BARS = 8;

/**
 * Creates an empty song at revision 0.
 *
 * @param title - The title shown in the header.
 * @returns A song with eight empty bars and one empty melody track ready for capture.
 */
export function createEmptySong(title = 'Untitled'): SongDocument {
  return {
    revision: 0,
    title,
    bpm: DEFAULT_BPM,
    time_sig: [...DEFAULT_TIME_SIGNATURE],
    key: { name: 'C major', confidence: 0, alternatives: [] },
    bars: DEFAULT_BARS,
    sections: [],
    chords: [],
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
        notes_rev: 0,
        notes: [],
        clips_rev: 0,
        clips: [],
      },
    ],
    takes: [],
    notes_log: [],
    option_sets: [],
    take_request: null,
  };
}

/** Returns whether a document is exactly the untouched new-song session, ignoring revision. */
export function isEmptySong(song: SongDocument): boolean {
  const track = song.tracks[0];
  return (
    song.title === 'Untitled' &&
    song.bpm === DEFAULT_BPM &&
    song.time_sig[0] === DEFAULT_TIME_SIGNATURE[0] &&
    song.time_sig[1] === DEFAULT_TIME_SIGNATURE[1] &&
    song.key.name === 'C major' &&
    song.key.confidence === 0 &&
    song.key.alternatives.length === 0 &&
    song.bars === DEFAULT_BARS &&
    song.sections.length === 0 &&
    song.chords.length === 0 &&
    song.tracks.length === 1 &&
    track?.id === 'melody' &&
    track.name === 'Melody' &&
    track.kind === 'melody' &&
    track.instrument === 'grand-piano' &&
    track.volume_db === -3 &&
    track.pan === 0 &&
    !track.mute &&
    !track.solo &&
    track.notes_rev === 0 &&
    track.notes.length === 0 &&
    track.clips_rev === 0 &&
    track.clips.length === 0 &&
    song.takes.length === 0 &&
    song.notes_log.length === 0 &&
    song.option_sets.length === 0 &&
    song.take_request === null
  );
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
