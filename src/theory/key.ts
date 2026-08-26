/** Krumhansl-Schmuckler key detection over symbolic note durations (plan Decision 4). */
import { Note as TonalNote } from 'tonal';
import type { KeyEstimate, Note } from '../song/types.ts';

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export interface ParsedKey {
  tonic: string;
  mode: 'major' | 'minor';
}

export interface RankedKey extends ParsedKey {
  name: string;
  correlation: number;
  confidence: number;
}

/** Parses the product's `C major` / `A minor` key names. */
export function parseKeyName(name: string): ParsedKey | null {
  const match = /^([^\s]+)\s+(major|minor)$/iu.exec(name.trim());
  if (!match) return null;
  const note = TonalNote.get(match[1] ?? '');
  if (note.empty || !note.pc) return null;
  return { tonic: note.pc, mode: match[2]?.toLowerCase() === 'minor' ? 'minor' : 'major' };
}

/**
 * Ranks all 24 major and minor keys using Pearson correlation with the published profiles.
 *
 * @param notes - Symbolic notes; durations form the pitch-class histogram.
 * @returns Best key with three ranked alternatives.
 */
export function detectKey(notes: readonly Pick<Note, 'p' | 'd'>[]): KeyEstimate {
  const ranked = rankKeys(notes);
  const best = ranked[0];
  if (!best) {
    return { name: 'C major', confidence: 0, alternatives: [] };
  }
  return {
    name: best.name,
    confidence: best.confidence,
    alternatives: ranked.slice(1, 4).map(({ name, confidence }) => ({ name, confidence })),
  };
}

/** Returns every candidate, highest correlation first. */
export function rankKeys(notes: readonly Pick<Note, 'p' | 'd'>[]): RankedKey[] {
  const histogram = Array.from({ length: 12 }, () => 0);
  for (const note of notes) {
    const pitchClass = ((Math.round(note.p) % 12) + 12) % 12;
    histogram[pitchClass] = (histogram[pitchClass] ?? 0) + Math.max(0, note.d);
  }
  const total = histogram.reduce((sum, value) => sum + value, 0);
  if (total === 0) return [];

  const candidates = PITCH_CLASSES.flatMap((tonic, tonicIndex) =>
    (['major', 'minor'] as const).map((mode) => {
      const profile = mode === 'major' ? MAJOR_PROFILE : MINOR_PROFILE;
      const rotated = histogram.map(
        (_, pitchClass) => profile[mod(pitchClass - tonicIndex, 12)] ?? 0,
      );
      const correlation = pearson(histogram, rotated);
      return { tonic, mode, name: `${tonic} ${mode}`, correlation };
    }),
  ).sort((left, right) => right.correlation - left.correlation);

  const correlations = candidates.map(({ correlation }) => correlation);
  const minimum = Math.min(...correlations);
  const maximum = Math.max(...correlations);
  const span = Math.max(0.000_001, maximum - minimum);
  return candidates.map((candidate) => ({
    ...candidate,
    confidence: round((candidate.correlation - minimum) / span),
  }));
}

/** Returns the detected confidence assigned to a named key. */
export function keyFit(notes: readonly Pick<Note, 'p' | 'd'>[], name: string): number {
  return (
    rankKeys(notes).find((candidate) => candidate.name === canonicalKeyName(name))?.confidence ?? 0
  );
}

function canonicalKeyName(name: string): string {
  const parsed = parseKeyName(name);
  if (!parsed) return name;
  const midi = TonalNote.chroma(parsed.tonic);
  return `${PITCH_CLASSES[midi] ?? parsed.tonic} ${parsed.mode}`;
}

function pearson(left: readonly number[], right: readonly number[]): number {
  const leftMean = average(left);
  const rightMean = average(right);
  let numerator = 0;
  let leftSquare = 0;
  let rightSquare = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = (left[index] ?? 0) - leftMean;
    const rightDelta = (right[index] ?? 0) - rightMean;
    numerator += leftDelta * rightDelta;
    leftSquare += leftDelta * leftDelta;
    rightSquare += rightDelta * rightDelta;
  }
  return numerator / Math.sqrt(leftSquare * rightSquare || 1);
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
