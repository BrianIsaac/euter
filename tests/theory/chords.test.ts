import { describe, expect, it } from 'vitest';
import {
  diatonicChords,
  isValidChord,
  parseChord,
  scoreChordsForBar,
} from '../../src/theory/chords.ts';
import type { Note } from '../../src/song/types.ts';

describe('chord theory', () => {
  it('parses tonal symbols including slash chords and rejects prose', () => {
    expect(parseChord('Cmaj7')?.notes).toEqual(['C', 'E', 'G', 'B']);
    expect(parseChord('G/B')?.tonic).toBe('G');
    expect(isValidChord('Am7')).toBe(true);
    expect(isValidChord('a warm chord')).toBe(false);
  });

  it('returns the natural diatonic triads for major and minor keys', () => {
    expect(diatonicChords('C major')).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(diatonicChords('A minor')).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(diatonicChords('unknown')).toEqual([]);
  });

  it('weights duration and the first beat when scoring an original melody bar', () => {
    const melody: Note[] = [
      { p: 60, s: 0, d: 2, v: 0.8, source: 'human' },
      { p: 64, s: 2, d: 1, v: 0.8, source: 'human' },
      { p: 67, s: 3, d: 1, v: 0.8, source: 'human' },
    ];
    const scores = scoreChordsForBar(melody, 1, 'C major');
    expect(scores[0]?.symbol).toBe('C');
    expect(scores[0]?.score).toBe(1);
    expect(scores.find(({ symbol }) => symbol === 'Am')?.score).toBeLessThan(1);
  });

  it('returns zero fit for an empty bar', () => {
    expect(scoreChordsForBar([], 2, 'C major').every(({ score }) => score === 0)).toBe(true);
  });
});
