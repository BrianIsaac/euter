/** Reversible note quantisation (plan Decision 4; music §4.4). */
import type { Note } from '../song/types.ts';

export type QuantiseGrid = '8n' | '16n';

export interface QuantiseOptions {
  grid: QuantiseGrid;
  strength: number;
  /** Delays each odd grid division by up to half a division. */
  swing?: number;
  /** Optional exclusive song-end beat used by the document reducer. */
  maximumBeat?: number;
}

const GRID_BEATS: Record<QuantiseGrid, number> = {
  '8n': 0.5,
  '16n': 0.25,
};

function assertUnitInterval(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1`);
  }
}

function roundBeat(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Returns the length of a quantisation division in quarter-note beats. */
export function gridBeats(grid: QuantiseGrid): number {
  return GRID_BEATS[grid];
}

/**
 * Quantises from each note's raw timing, so strength zero always restores the performance.
 */
export function quantiseNotes(
  notes: readonly Note[],
  { grid, strength, swing = 0, maximumBeat }: QuantiseOptions,
): Note[] {
  assertUnitInterval(strength, 'strength');
  if (!Number.isFinite(swing) || swing < 0 || swing > 0.5) {
    throw new RangeError('swing must be between 0 and 0.5');
  }

  const division = gridBeats(grid);
  return notes.map((note) => {
    const rawStart = note.s_raw ?? note.s;
    const rawDuration = note.d_raw ?? note.d;
    const divisionIndex = Math.max(0, Math.round(rawStart / division));
    const swingOffset = divisionIndex % 2 === 1 ? division * swing : 0;
    const snappedStart = divisionIndex * division + swingOffset;
    const snappedDuration = Math.max(division, Math.round(rawDuration / division) * division);

    const interpolatedStart =
      strength === 0 ? rawStart : roundBeat(rawStart + (snappedStart - rawStart) * strength);
    const interpolatedDuration =
      strength === 0
        ? rawDuration
        : roundBeat(rawDuration + (snappedDuration - rawDuration) * strength);
    const start =
      maximumBeat === undefined
        ? interpolatedStart
        : Math.min(interpolatedStart, maximumBeat - 0.001);
    const duration =
      maximumBeat === undefined
        ? interpolatedDuration
        : Math.min(interpolatedDuration, maximumBeat - start);

    return {
      ...note,
      s: start,
      d: Math.max(0.001, duration),
      s_raw: rawStart,
      d_raw: rawDuration,
    };
  });
}

/** Lane A reducer-compatible spelling and positional signature. */
export function quantizeNotes(
  notes: readonly Note[],
  grid: QuantiseGrid,
  strength: number,
  swing = 0,
  maximumBeat?: number,
): Note[] {
  return quantiseNotes(notes, {
    grid,
    strength,
    swing,
    ...(maximumBeat === undefined ? {} : { maximumBeat }),
  });
}
