/** Deterministic bass generation from the chord roots and one style preset. */
import { Chord, Midi } from 'tonal';
import type { ChordEntry, Note, StyleName } from '../../song/types.ts';
import { parseKeyName } from '../key.ts';
import { getStylePreset, type BassDegree } from '../styles.ts';

export function generateBass(
  chords: readonly ChordEntry[],
  keyName: string,
  style: StyleName,
  barFrom: number,
  barTo: number,
  beatsPerBar = 4,
): Note[] {
  const preset = getStylePreset(style);
  const tonic = parseKeyName(keyName)?.tonic ?? 'C';
  const notes: Note[] = [];
  for (let bar = barFrom; bar <= barTo; bar += 1) {
    const symbol = chordAt(chords, bar) ?? tonic;
    const chord = Chord.get(symbol);
    const root = chord.tonic ?? tonic;
    const rootMidi = normaliseBassMidi(Midi.toMidi(`${root}2`) ?? 36);
    for (const step of preset.bass_pattern) {
      notes.push({
        p: degreePitch(rootMidi, step.degree),
        s: (bar - 1) * beatsPerBar + step.beat,
        d: Math.min(step.duration, beatsPerBar - step.beat),
        v: step.velocity,
        source: 'agent',
      });
    }
  }
  return notes;
}

function chordAt(chords: readonly ChordEntry[], bar: number): string | undefined {
  return [...chords]
    .filter((chord) => chord.bar <= bar)
    .sort((left, right) => right.bar - left.bar)[0]?.symbol;
}

function degreePitch(root: number, degree: BassDegree): number {
  if (degree === 'fifth') return root + 7;
  if (degree === 'octave') return root + 12;
  return root;
}

function normaliseBassMidi(midi: number): number {
  let result = midi;
  while (result < 32) result += 12;
  while (result > 47) result -= 12;
  return result;
}
