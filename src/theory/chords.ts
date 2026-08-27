/** Tonal chord validation and per-bar weighted pitch-class scoring (plan Decision 4). */
import { Chord, Key, Note as TonalNote } from 'tonal';
import type { Note } from '../song/types.ts';
import { parseKeyName } from './key.ts';

export interface ChordScore {
  symbol: string;
  score: number;
  matched_weight: number;
  total_weight: number;
}

/** Returns a canonical symbol and pitch classes, or null for an unknown symbol. */
export function parseChord(
  symbol: string,
): { symbol: string; notes: string[]; tonic: string } | null {
  const chord = Chord.get(symbol.trim());
  if (chord.empty || !chord.tonic || chord.notes.length === 0) return null;
  return { symbol: chord.symbol, notes: chord.notes, tonic: chord.tonic };
}

/** True when tonal can interpret the whole chord symbol. */
export function isValidChord(symbol: string): boolean {
  return parseChord(symbol) !== null;
}

/** Returns the seven diatonic triads for a product key name. */
export function diatonicChords(keyName: string): string[] {
  const parsed = parseKeyName(keyName);
  if (!parsed) return [];
  return parsed.mode === 'major'
    ? [...Key.majorKey(parsed.tonic).triads]
    : [...Key.minorKey(parsed.tonic).natural.triads];
}

/**
 * Scores diatonic chords against one melody bar. Duration and strong beat position add weight.
 */
export function scoreChordsForBar(
  notes: readonly Note[],
  bar: number,
  keyName: string,
  beatsPerBar = 4,
): ChordScore[] {
  const start = (bar - 1) * beatsPerBar;
  const end = start + beatsPerBar;
  const weighted = notes
    .filter((note) => note.s < end && note.s + note.d > start)
    .map((note) => {
      const localStart = Math.max(start, note.s) - start;
      const duration = Math.min(end, note.s + note.d) - Math.max(start, note.s);
      const strongBeat = localStart < 0.01 ? 1.35 : Math.abs(localStart - 2) < 0.01 ? 1.15 : 1;
      return { pitchClass: mod(note.p, 12), weight: duration * strongBeat };
    });
  const totalWeight = weighted.reduce((sum, note) => sum + note.weight, 0);

  return diatonicChords(keyName)
    .map((symbol) => {
      const parsed = parseChord(symbol);
      const pitchClasses = new Set(
        parsed?.notes.map((name) => TonalNote.chroma(name)).filter((value) => value !== undefined),
      );
      const matched = weighted.reduce(
        (sum, note) => sum + (pitchClasses.has(note.pitchClass) ? note.weight : 0),
        0,
      );
      const tonicClass = parsed ? TonalNote.chroma(parsed.tonic) : undefined;
      const first = weighted[0];
      const rootBonus = first && first.pitchClass === tonicClass ? first.weight * 0.12 : 0;
      return {
        symbol,
        score: round(totalWeight === 0 ? 0 : Math.min(1, (matched + rootBonus) / totalWeight)),
        matched_weight: round(matched),
        total_weight: round(totalWeight),
      };
    })
    .sort((left, right) => right.score - left.score || left.symbol.localeCompare(right.symbol));
}

function mod(value: number, divisor: number): number {
  return ((Math.round(value) % divisor) + divisor) % divisor;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
