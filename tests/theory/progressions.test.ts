import { describe, expect, it } from 'vitest';
import { loadExampleSong } from '../../src/song/serialise.ts';
import {
  cadenceForStyle,
  progressionForStyle,
  progressionPreferences,
  suggestChordProgression,
} from '../../src/theory/progressions.ts';

describe('style progression preferences', () => {
  it('maps the original pop preference through the selected tonic', () => {
    expect(progressionForStyle('C major', 'pop', 6)).toEqual(['C', 'G', 'Am', 'F', 'C', 'G']);
    expect(progressionForStyle('A minor', 'pop', 4)).toEqual(['Am', 'F', 'C', 'G']);
  });

  it('keeps distinct cadences for pop, soul and lofi', () => {
    expect(cadenceForStyle('C major', 'pop')).toEqual(['G', 'C']);
    expect(cadenceForStyle('C major', 'soul')).toEqual(['Dm7', 'G7', 'Cmaj7']);
    expect(cadenceForStyle('A minor', 'lofi')).toEqual(['Fmaj7', 'E7', 'Am7']);
  });

  it('returns detached preferences and rejects unusable key names', () => {
    const preferences = progressionPreferences();
    preferences.pop.major[0] = 'changed';
    expect(progressionPreferences().pop.major[0]).toBe('I');
    expect(progressionForStyle('unknown', 'pop', 4)).toEqual([]);
    expect(cadenceForStyle('unknown', 'pop')).toEqual([]);
  });

  it('uses a phrase-ending cadence in a deterministic proposal', () => {
    expect(suggestChordProgression([], 'C major', 'pop', 1, 4)).toEqual([
      { bar: 1, symbol: 'C', fit: 0 },
      { bar: 2, symbol: 'G', fit: 0 },
      { bar: 3, symbol: 'G', fit: 0 },
      { bar: 4, symbol: 'C', fit: 0 },
    ]);
  });

  it('keeps the beginner pop preference when the melody fit is a near tie', () => {
    const song = loadExampleSong();
    const melody = song.tracks.find(({ id }) => id === 'melody')?.notes ?? [];
    expect(suggestChordProgression(melody, 'C major', 'pop', 1, 4)[1]).toMatchObject({
      bar: 2,
      symbol: 'F',
    });
  });
});
