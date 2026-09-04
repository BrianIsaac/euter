/**
 * The capture commands the shell needs on top of lane A's song reducer: a recorded, imported or
 * played take has to reach `document.takes` before `get_take` or `commit_take` can see it, and
 * lane A's command union has no command that puts one there. This wrapper owns those commands and
 * delegates every other command unchanged, so lane A keeps `src/song/reducer.ts`.
 */
import { songReducer } from '../song/reducer.ts';
import type { Note, SongDocument, Take } from '../song/types.ts';
import type { Reducer, ReducerResult } from './bus.ts';
import { ToolError } from './envelope.ts';

/**
 * The take shapes the capture path produces, validated before it enters the document. The
 * destination fields are checked here as well: persistence rejects an empty track id or an
 * unordered bar pair, and a take that cannot be saved would silently cost the person every later
 * edit.
 */
export function isTake(value: unknown): value is Take {
  if (typeof value !== 'object' || value === null) return false;
  const take = value as Partial<Take>;
  return (
    typeof take.id === 'string' &&
    take.id.length > 0 &&
    (take.source === 'mic' ||
      take.source === 'import' ||
      take.source === 'keyboard' ||
      take.source === 'midi') &&
    Array.isArray(take.notes) &&
    Array.isArray(take.pitch_track) &&
    typeof take.duration_s === 'number' &&
    typeof take.voiced_ratio === 'number' &&
    typeof take.median_clarity === 'number' &&
    Array.isArray(take.pitch_range) &&
    (typeof take.tempo_hint === 'number' || take.tempo_hint === null) &&
    isTakeAudio(take.audio) &&
    isTargetTrackId(take.target_track_id) &&
    isTargetBars(take.target_bars)
  );
}

function isTakeAudio(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const audio = value as Record<string, unknown>;
  return (
    audio.encoding === 'pcm16-base64' &&
    typeof audio.sample_rate === 'number' &&
    audio.sample_rate >= 8_000 &&
    audio.sample_rate <= 192_000 &&
    audio.channels === 1 &&
    typeof audio.samples === 'string' &&
    typeof audio.trim_start_s === 'number' &&
    audio.trim_start_s >= 0 &&
    typeof audio.start_beat === 'number' &&
    audio.start_beat >= 0 &&
    isTakeAudioAlignment(audio.alignment)
  );
}

function isTakeAudioAlignment(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const alignment = value as Record<string, unknown>;
  return (
    alignment.method === 'worklet-clock-and-browser-latency' &&
    [
      'capture_offset_s',
      'input_latency_s',
      'base_latency_s',
      'output_latency_s',
      'compensation_s',
    ].every(
      (key) =>
        typeof alignment[key] === 'number' &&
        Number.isFinite(alignment[key]) &&
        alignment[key] >= 0,
    )
  );
}

function isTargetTrackId(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && value.trim().length > 0);
}

function isTargetBars(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [from, to] = value as [unknown, unknown];
  return (
    typeof from === 'number' &&
    typeof to === 'number' &&
    Number.isInteger(from) &&
    Number.isInteger(to) &&
    from >= 1 &&
    to >= from
  );
}

/**
 * Wraps a song reducer with `add_take`.
 *
 * @param base - The song reducer to delegate to; defaults to lane A's.
 * @returns A reducer that also lands takes in the document.
 */
export function createCaptureReducer(
  base: Reducer<SongDocument> = songReducer,
): Reducer<SongDocument> {
  return (document, command) => {
    if (command.type !== 'add_take') return base(document, command);
    return addTake(document, command.args.take, command.why, command.source);
  };
}

function addTake(
  document: SongDocument,
  value: unknown,
  why: string | undefined,
  source: 'human' | 'agent',
): ReducerResult<SongDocument> {
  if (!isTake(value)) {
    throw new ToolError('INVALID_ARGUMENT', 'add_take needs a transcribed take.', false);
  }
  if (document.takes.some(({ id }) => id === value.id)) {
    throw new ToolError('INVALID_ARGUMENT', `Take "${value.id}" is already in the song.`, false);
  }
  const bars = takeBars(value.notes, document.time_sig[0], document.bars);
  const seconds = Math.round(value.duration_s * 10) / 10;
  const result: ReducerResult<SongDocument> = {
    document: {
      ...document,
      takes: [...document.takes, value],
      notes_log:
        why === undefined
          ? document.notes_log
          : [
              ...document.notes_log,
              {
                revision: document.revision + 1,
                why,
                bars,
                track_id: null,
                source,
              },
            ],
    },
    changed: why === undefined ? ['takes'] : ['takes', 'notes_log'],
    summary: `Captured ${value.source} take ${value.id} (${seconds}s, ${value.notes.length} notes)`,
    target_bars: bars,
  };
  return result;
}

function takeBars(notes: readonly Note[], beatsPerBar: number, songBars: number): [number, number] {
  if (notes.length === 0) return [1, Math.min(songBars, 1)];
  const first = Math.min(...notes.map(({ s }) => s));
  const last = Math.max(...notes.map(({ s, d }) => s + Math.max(0, d - 0.000_001)));
  return [
    Math.max(1, Math.floor(first / beatsPerBar) + 1),
    Math.max(1, Math.min(songBars, Math.floor(last / beatsPerBar) + 1)),
  ];
}
