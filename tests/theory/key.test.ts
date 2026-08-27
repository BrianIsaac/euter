import { describe, expect, it } from 'vitest';
import { detectKey, keyFit, parseKeyName, rankKeys } from '../../src/theory/key.ts';
import type { Note } from '../../src/song/types.ts';

const notes = (pitches: number[]): Note[] =>
  pitches.map((p, index) => ({ p, s: index, d: index % 4 === 0 ? 2 : 1, v: 0.8, source: 'human' }));

describe('Krumhansl-Schmuckler key detection', () => {
  it('ranks an original tonic-led major melody as C major', () => {
    const melody = notes([60, 64, 67, 71, 72, 67, 65, 64, 62, 67, 71, 72, 60]);
    const result = detectKey(melody);
    expect(result.name).toBe('C major');
    expect(result.confidence).toBe(1);
    expect(result.alternatives).toHaveLength(3);
  });

  it('ranks an original minor melody and exposes all 24 candidates', () => {
    const melody = notes([57, 60, 64, 68, 69, 64, 62, 60, 59, 64, 68, 69, 57]);
    const ranked = rankKeys(melody);
    expect(ranked).toHaveLength(24);
    expect(ranked[0]?.name).toBe('A minor');
    expect(keyFit(melody, 'A minor')).toBe(1);
  });

  it('returns an honest empty estimate and parses flat tonic names', () => {
    expect(detectKey([])).toEqual({ name: 'C major', confidence: 0, alternatives: [] });
    expect(parseKeyName('Bb minor')).toEqual({ tonic: 'Bb', mode: 'minor' });
    expect(parseKeyName('not a key')).toBeNull();
  });

  it('rejects octave notes and compound accidentals that tonal parses as pitches', () => {
    expect(parseKeyName('C4 major')).toBeNull();
    expect(parseKeyName('C## major')).toBeNull();
    expect(parseKeyName('Fx minor')).toBeNull();
    expect(parseKeyName('Bb minor')).toEqual({ tonic: 'Bb', mode: 'minor' });
    expect(parseKeyName('F# major')).toEqual({ tonic: 'F#', mode: 'major' });
  });
});
