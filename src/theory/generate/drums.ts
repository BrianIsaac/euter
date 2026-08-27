/** Deterministic 16-step drum generation with the style preset's swing. */
import type { Note, StyleName } from '../../song/types.ts';
import { getStylePreset, type DrumVoice } from '../styles.ts';

const DRUM_MIDI: Record<DrumVoice, number> = {
  kick: 36,
  snare: 38,
  closed_hat: 42,
  open_hat: 46,
};

export function generateDrums(
  style: StyleName,
  barFrom: number,
  barTo: number,
  beatsPerBar = 4,
): Note[] {
  const preset = getStylePreset(style);
  const notes: Note[] = [];
  for (let bar = barFrom; bar <= barTo; bar += 1) {
    for (const step of preset.drum_pattern) {
      const swingOffset = step.step % 2 === 1 ? preset.swing * 0.25 : 0;
      notes.push({
        p: DRUM_MIDI[step.voice],
        s: round((bar - 1) * beatsPerBar + step.step * 0.25 + swingOffset),
        d: step.voice.includes('hat') ? 0.12 : 0.2,
        v: step.velocity,
        source: 'agent',
      });
    }
  }
  return notes.sort((left, right) => left.s - right.s || left.p - right.p);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
