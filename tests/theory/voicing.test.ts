import { describe, expect, it } from 'vitest';
import { voiceLeadingDistance, voiceProgression, voicingToMidi } from '../../src/theory/voicing.ts';

describe('chord voicing', () => {
  it('uses tonal voicings and smooth top-note motion', () => {
    const voiced = voiceProgression(['Cmaj7', 'Am7', 'Fmaj7', 'G7'], 'pop');
    expect(voiced).toEqual([
      ['E3', 'G3', 'B3', 'D4'],
      ['G3', 'B3', 'C4', 'E4'],
      ['A3', 'C4', 'E4', 'G4'],
      ['B3', 'E4', 'F4', 'A4'],
    ]);
    expect(voiceLeadingDistance(voiced)).toBe(29);
  });

  it('converts note names to sorted MIDI and handles an empty progression', () => {
    expect(voicingToMidi(['G3', 'C3', 'E3'])).toEqual([48, 52, 55]);
    expect(voiceProgression([], 'lofi')).toEqual([]);
  });
});
