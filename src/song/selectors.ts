/** Bounded, agent-readable views of the song (plan Architecture item 3). */
import { Progression } from 'tonal';
import { ToolError } from '../webmcp/envelope.ts';
import type { ChordEntry, Note, SongDocument, Track } from './types.ts';

export const SONG_STATE_BUDGET = 1200;
export const NOTE_PAGE_MAX_BARS = 8;

export interface SongStateContext {
  instrument_names?: readonly string[];
  transport?: { playing: boolean; position_bar: number; loop?: [number, number] };
  audio?: { state: 'running' | 'locked'; microphone: string };
  jobs?: readonly { id: string; kind: string; state: string; progress_pct: number }[];
}

export interface NoteView {
  p: number;
  s: number;
  d: number;
  v: number;
}

export interface NoteBarView {
  bar: number;
  notes: NoteView[];
}

export interface ChordView extends ChordEntry {
  roman: string;
}

/**
 * Returns the compact song orientation JSON kept below Chrome's 1,200-character working budget.
 *
 * @param song - Current document.
 * @param context - Transient engine state kept outside the document.
 * @returns Valid JSON no longer than 1,200 characters.
 */
export function selectSongState(song: SongDocument, context: SongStateContext = {}): string {
  const state = {
    revision: song.revision,
    title: song.title,
    bpm: song.bpm,
    time_sig: song.time_sig,
    key: song.key,
    bars: song.bars,
    sections: song.sections,
    tracks: song.tracks.map((track) => selectTrackSummary(track, song.time_sig[0])),
    takes: song.takes.map((take) => ({ id: take.id, source: take.source })),
    options: song.option_sets.map((set) => ({ id: set.id, kind: set.kind })),
    take_request: song.take_request,
    instruments: [...(context.instrument_names ?? [])],
    styles: ['pop', 'soul', 'lofi'],
    transport: context.transport ?? { playing: false, position_bar: 1 },
    audio: context.audio ?? { state: 'locked', microphone: 'unknown' },
    jobs: [...(context.jobs ?? [])],
  };

  let serialised = JSON.stringify(state);
  while (serialised.length > SONG_STATE_BUDGET && state.instruments.length > 0) {
    state.instruments.pop();
    serialised = JSON.stringify(state);
  }
  while (serialised.length > SONG_STATE_BUDGET && state.jobs.length > 0) {
    state.jobs.pop();
    serialised = JSON.stringify(state);
  }
  while (serialised.length > SONG_STATE_BUDGET && state.takes.length > 0) {
    state.takes.pop();
    serialised = JSON.stringify(state);
  }
  while (serialised.length > SONG_STATE_BUDGET && state.tracks.length > 0) {
    state.tracks.pop();
    serialised = JSON.stringify(state);
  }
  if (serialised.length <= SONG_STATE_BUDGET) return serialised;

  return JSON.stringify({
    revision: song.revision,
    title: song.title.slice(0, 80),
    bpm: song.bpm,
    time_sig: song.time_sig,
    key: song.key,
    bars: song.bars,
    truncated: true,
  });
}

/**
 * Reads one track for at most eight bars and makes each onset relative to its own bar.
 *
 * @param song - Current document.
 * @param trackId - Stable track id.
 * @param barFrom - First bar, one-based and inclusive.
 * @param barTo - Last bar, one-based and inclusive.
 * @returns One entry per requested bar.
 */
export function selectTrackNotes(
  song: SongDocument,
  trackId: string,
  barFrom: number,
  barTo: number,
): NoteBarView[] {
  validateBarRange(song, barFrom, barTo, NOTE_PAGE_MAX_BARS);
  const track = song.tracks.find(({ id }) => id === trackId);
  if (!track) {
    throw new ToolError('TRACK_NOT_FOUND', `Track "${trackId}" does not exist.`, true);
  }
  const beatsPerBar = song.time_sig[0];
  return Array.from({ length: barTo - barFrom + 1 }, (_, offset) => {
    const bar = barFrom + offset;
    const start = (bar - 1) * beatsPerBar;
    const end = start + beatsPerBar;
    return {
      bar,
      notes: track.notes
        .filter((note) => note.s >= start && note.s < end)
        .map((note) => ({ p: note.p, s: round(note.s - start), d: note.d, v: note.v })),
    };
  });
}

/**
 * Produces the compact per-track line used by `get_song_state`.
 *
 * @param track - A song track.
 * @param beatsPerBar - Numerator of the time signature.
 * @returns A one-line density and pitch summary.
 */
export function selectTrackSummary(track: Track, beatsPerBar = 4): string {
  if (track.notes.length === 0 && track.clips.length === 0) {
    return `${track.id} ${track.kind}/${track.instrument}: empty`;
  }
  if (track.kind === 'vocal') {
    const bars = track.clips.map((clip) => Math.floor(clip.s / beatsPerBar) + 1);
    const span = bars.length === 0 ? 'no audio' : `bars ${Math.min(...bars)}-${Math.max(...bars)}`;
    return `${track.id} ${span}: vocal ${vocalClipSummary(track)}; retained voice`;
  }
  if (track.notes.length === 0) {
    const bars = track.clips.map((clip) => Math.floor(clip.s / beatsPerBar) + 1);
    return `${track.id} bars ${Math.min(...bars)}-${Math.max(...bars)}: ${track.kind} 0 notes + ${vocalClipSummary(track)}; ${track.instrument}`;
  }
  const bars = track.notes.map((note) => Math.floor(note.s / beatsPerBar) + 1);
  const pitches = track.notes.map(({ p }) => p);
  const barFrom = Math.min(...bars);
  const barTo = Math.max(...bars);
  const noun = track.kind === 'drums' ? 'hits' : 'notes';
  const pitch = track.kind === 'drums' ? '' : ` ${Math.min(...pitches)}-${Math.max(...pitches)}`;
  const clips = track.clips.length === 0 ? '' : ` + ${vocalClipSummary(track)}`;
  return `${track.id} bars ${barFrom}-${barTo}: ${track.kind}${pitch} ${track.notes.length} ${noun}${clips}; ${track.instrument}`;
}

function vocalClipSummary(track: Track): string {
  const clip = track.clips[0];
  const count = `${track.clips.length} voice clip${track.clips.length === 1 ? '' : 's'}`;
  if (!clip) return count;
  const tune = Math.round((clip.tuning_strength ?? 0) * 100);
  const timing =
    clip.timing_grid === undefined
      ? ''
      : `, ${clip.timing_grid} ${Math.round((clip.timing_strength ?? 0) * 100)}%`;
  return `${count}, tune ${tune}%${timing}`;
}

/**
 * Reads chord symbols with Roman numerals in the current key.
 *
 * @param song - Current document.
 * @param barFrom - Optional first bar.
 * @param barTo - Optional last bar.
 * @returns Sorted chord views.
 */
export function selectChords(song: SongDocument, barFrom = 1, barTo = song.bars): ChordView[] {
  validateBarRange(song, barFrom, barTo);
  const tonic = song.key.name.split(/\s+/u)[0] ?? 'C';
  return song.chords
    .filter(({ bar }) => bar >= barFrom && bar <= barTo)
    .sort((left, right) => left.bar - right.bar)
    .map((chord) => ({
      ...chord,
      roman: Progression.toRomanNumerals(tonic, [chord.symbol])[0] ?? '?',
    }));
}

/** Returns the one-based bar containing a note onset. */
export function barForNote(note: Pick<Note, 's'>, beatsPerBar = 4): number {
  return Math.floor(note.s / beatsPerBar) + 1;
}

function validateBarRange(
  song: SongDocument,
  barFrom: number,
  barTo: number,
  maximum = song.bars,
): void {
  if (!Number.isInteger(barFrom) || !Number.isInteger(barTo) || barFrom < 1 || barTo < barFrom) {
    throw new ToolError('INVALID_ARGUMENT', 'Give an ordered, one-based bar range.', true);
  }
  if (barTo > song.bars) {
    throw new ToolError('OUT_OF_RANGE', `The song has ${song.bars} bars.`, true);
  }
  if (barTo - barFrom + 1 > maximum) {
    throw new ToolError('RESULT_TOO_LARGE', `Read at most ${maximum} bars at once.`, true);
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
