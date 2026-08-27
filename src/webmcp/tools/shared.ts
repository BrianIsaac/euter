/**
 * What every tool file needs: one place to dispatch a command with `why` and `expected_revision`,
 * and the bounded payloads the reads return (plan Decisions 12, 13, 18).
 */
import type { Note, SongDocument, Take } from '../../song/types.ts';
import type { CommandResult } from '../bus.ts';
import { ToolError } from '../envelope.ts';
import type { ToolContext } from '../types.ts';

export interface WriteFields {
  why: string;
  expected_revision?: number | undefined;
}

/** Notes returned in one take payload before the rest are summarised away. */
export const TAKE_NOTE_LIMIT = 24;

export interface TakeData {
  take_id: string;
  source: Take['source'];
  notes: { p: number; s: number; d: number; v: number }[];
  notes_total: number;
  duration_s: number;
  voiced_ratio: number;
  median_clarity: number;
  pitch_range: [number, number];
  tempo_hint: number | null;
  refining_job_id?: string;
}

/**
 * Sends one command to the shared bus as the agent, carrying its reason.
 *
 * @param context - The tool context.
 * @param type - The command type lane A's reducer knows.
 * @param args - The command arguments.
 * @param fields - `why` and the optional `expected_revision` from the tool input.
 * @returns The reducer's result.
 */
export function dispatch(
  context: ToolContext,
  type: string,
  args: Record<string, unknown>,
  fields: WriteFields,
): CommandResult {
  return context.bus.dispatch({
    type,
    args,
    source: 'agent',
    why: fields.why,
    ...(fields.expected_revision === undefined
      ? {}
      : { expected_revision: fields.expected_revision }),
  });
}

/**
 * Adds `target_bars` to a tool payload when the reducer reported them.
 *
 * @param result - The reducer's result.
 * @returns An object to spread into the envelope's data.
 */
export function targetBars(result: CommandResult): { target_bars?: [number, number] } {
  return result.target_bars === undefined ? {} : { target_bars: result.target_bars };
}

/**
 * Finds a take or refuses with `TAKE_NOT_FOUND`.
 *
 * @param song - The current song.
 * @param takeId - The take id from the tool input.
 * @returns The take.
 */
export function requireTake(song: SongDocument, takeId: string): Take {
  const take = song.takes.find(({ id }) => id === takeId);
  if (!take) {
    throw new ToolError(
      'TAKE_NOT_FOUND',
      `Take "${takeId}" does not exist. Read get_song_state for the takes waiting.`,
      true,
    );
  }
  return take;
}

/**
 * Bounds a take for the model: the first notes, the counts and the quality readings.
 *
 * @param take - The take to describe.
 * @param beatsPerBar - The time signature numerator, for bar-relative starts.
 * @returns The payload `get_take` and `stop_recording` return.
 */
export function takeData(take: Take, beatsPerBar = 4): TakeData {
  const first = take.notes[0]?.s ?? 0;
  const offset = Math.floor(first / beatsPerBar) * beatsPerBar;
  const data: TakeData = {
    take_id: take.id,
    source: take.source,
    notes: take.notes.slice(0, TAKE_NOTE_LIMIT).map((note) => noteView(note, offset)),
    notes_total: take.notes.length,
    duration_s: round(take.duration_s),
    voiced_ratio: round(take.voiced_ratio),
    median_clarity: round(take.median_clarity),
    pitch_range: [Math.round(take.pitch_range[0]), Math.round(take.pitch_range[1])],
    tempo_hint: take.tempo_hint === null ? null : Math.round(take.tempo_hint),
  };
  if (take.refining_job_id !== undefined) {
    data.refining_job_id = take.refining_job_id;
  }
  return data;
}

function noteView(note: Note, offset: number): { p: number; s: number; d: number; v: number } {
  return { p: note.p, s: round(note.s - offset), d: round(note.d), v: round(note.v) };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
