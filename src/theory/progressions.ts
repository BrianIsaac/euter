/** Style preferences and phrase cadences for rule-based chord proposals (plan Decision 19). */
import { Chord, Progression } from 'tonal';
import type { Note, StyleName } from '../song/types.ts';
import { scoreChordsForBar } from './chords.ts';
import { parseKeyName } from './key.ts';

const PREFERENCES: Record<StyleName, { major: string[]; minor: string[] }> = {
  pop: { major: ['I', 'V', 'VIm', 'IV'], minor: ['Im', 'bVI', 'bIII', 'bVII'] },
  soul: {
    major: ['Imaj7', 'VIm7', 'IIm7', 'V7'],
    minor: ['Im7', 'IVm7', 'bVImaj7', 'V7'],
  },
  lofi: {
    major: ['Imaj7', 'IIIm7', 'IVmaj7', 'IIm7'],
    minor: ['Im7', 'bIIImaj7', 'IVm7', 'bVImaj7'],
  },
};

const CADENCES: Record<StyleName, { major: string[]; minor: string[] }> = {
  pop: { major: ['V', 'I'], minor: ['V', 'Im'] },
  soul: { major: ['IIm7', 'V7', 'Imaj7'], minor: ['IIm7b5', 'V7', 'Im7'] },
  lofi: { major: ['IVmaj7', 'V7', 'Imaj7'], minor: ['bVImaj7', 'V7', 'Im7'] },
};

export interface SuggestedChord {
  bar: number;
  symbol: string;
  fit: number;
}

/** Returns a deterministic, repeating preference progression. */
export function progressionForStyle(keyName: string, style: StyleName, bars: number): string[] {
  const parsed = parseKeyName(keyName);
  if (!parsed || bars < 1) return [];
  const roman = PREFERENCES[style][parsed.mode];
  const symbols = Progression.fromRomanNumerals(parsed.tonic, roman);
  return Array.from(
    { length: bars },
    (_, index) => symbols[index % symbols.length] ?? parsed.tonic,
  );
}

/** Returns a two- or three-chord cadence for the style and mode. */
export function cadenceForStyle(keyName: string, style: StyleName): string[] {
  const parsed = parseKeyName(keyName);
  if (!parsed) return [];
  return Progression.fromRomanNumerals(parsed.tonic, CADENCES[style][parsed.mode]);
}

/**
 * Proposes one chord per bar, favouring the style table when it remains close to the melody fit.
 */
export function suggestChordProgression(
  notes: readonly Note[],
  keyName: string,
  style: StyleName,
  barFrom: number,
  barTo: number,
  beatsPerBar = 4,
): SuggestedChord[] {
  if (barFrom < 1 || barTo < barFrom) return [];
  const preferred = progressionForStyle(keyName, style, barTo - barFrom + 1);
  const result = Array.from({ length: barTo - barFrom + 1 }, (_, offset) => {
    const bar = barFrom + offset;
    const scores = scoreChordsForBar(notes, bar, keyName, beatsPerBar);
    const best = scores[0];
    const preferredSymbol = preferred[offset] ?? best?.symbol ?? 'C';
    const preferredTonic = Chord.get(preferredSymbol).tonic;
    const preferredScore =
      scores.find(({ symbol }) => Chord.get(symbol).tonic === preferredTonic)?.score ?? 0;
    const usePreferred = !best || preferredScore >= best.score - 0.2;
    return {
      bar,
      symbol: usePreferred ? preferredSymbol : best.symbol,
      fit: usePreferred ? preferredScore : best.score,
    };
  });

  const cadence = cadenceForStyle(keyName, style);
  if (result.length >= cadence.length) {
    for (let index = 0; index < cadence.length; index += 1) {
      const target = result[result.length - cadence.length + index];
      const symbol = cadence[index];
      if (target && symbol) target.symbol = symbol;
    }
  }
  return result;
}

/** Exposes the preference table as detached data for agent-readable documentation. */
export function progressionPreferences(): typeof PREFERENCES {
  return structuredClone(PREFERENCES);
}
