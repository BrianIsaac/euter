/** Chord voicing with tonal's voicing dictionary and top-note voice leading. */
import { Chord, Midi, VoiceLeading, Voicing } from 'tonal';
import type { StyleName } from '../song/types.ts';
import { getStylePreset } from './styles.ts';

/** Returns note names for a smoothly voiced progression in the style's register. */
export function voiceProgression(chords: readonly string[], style: StyleName): string[][] {
  if (chords.length === 0) return [];
  const range = getStylePreset(style).voicing.range;
  const voiced = Voicing.sequence([...chords], range, undefined, VoiceLeading.topNoteDiff);
  return voiced.map((notes, index) =>
    notes.length > 0 ? notes : fallbackVoicing(chords[index] ?? '', range[0]),
  );
}

/** Converts a note-name voicing to sorted MIDI pitches. */
export function voicingToMidi(voicing: readonly string[]): number[] {
  return voicing
    .map((name) => Midi.toMidi(name))
    .filter((midi): midi is number => midi !== null)
    .sort((left, right) => left - right);
}

/** Total semitone travel between adjacent, index-aligned voices. */
export function voiceLeadingDistance(voicings: readonly (readonly string[])[]): number {
  let distance = 0;
  for (let index = 1; index < voicings.length; index += 1) {
    const previous = voicingToMidi(voicings[index - 1] ?? []);
    const current = voicingToMidi(voicings[index] ?? []);
    for (let voice = 0; voice < Math.min(previous.length, current.length); voice += 1) {
      distance += Math.abs((current[voice] ?? 0) - (previous[voice] ?? 0));
    }
  }
  return distance;
}

function fallbackVoicing(symbol: string, bottom: string): string[] {
  const octave = /(-?\d+)$/u.exec(bottom)?.[1] ?? '3';
  return Chord.get(symbol).notes.map((pitchClass) => `${pitchClass}${octave}`);
}
