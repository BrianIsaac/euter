/** One honest preset table for the three supported feels (plan Decision 20). */
import type { StyleName } from '../song/types.ts';

export type BassDegree = 'root' | 'fifth' | 'octave';
export type DrumVoice = 'kick' | 'snare' | 'closed_hat' | 'open_hat';

export interface BassStep {
  beat: number;
  degree: BassDegree;
  duration: number;
  velocity: number;
}

export interface DrumStep {
  step: number;
  voice: DrumVoice;
  velocity: number;
}

export interface StylePreset {
  name: StyleName;
  tempo_range: [number, number];
  kit: string;
  swing: number;
  voicing: { range: [string, string]; duration: number; velocity: number };
  bass_pattern: readonly BassStep[];
  drum_pattern: readonly DrumStep[];
}

export const STYLE_PRESETS: Record<StyleName, StylePreset> = {
  pop: {
    name: 'pop',
    tempo_range: [92, 128],
    kit: 'studio-kit',
    swing: 0,
    voicing: { range: ['C3', 'C5'], duration: 3.7, velocity: 0.68 },
    bass_pattern: [
      { beat: 0, degree: 'root', duration: 1.5, velocity: 0.8 },
      { beat: 2, degree: 'fifth', duration: 1.5, velocity: 0.7 },
    ],
    drum_pattern: [
      { step: 0, voice: 'kick', velocity: 0.9 },
      { step: 4, voice: 'snare', velocity: 0.82 },
      { step: 6, voice: 'kick', velocity: 0.72 },
      { step: 12, voice: 'snare', velocity: 0.84 },
      ...Array.from({ length: 8 }, (_, index) => ({
        step: index * 2,
        voice: 'closed_hat' as const,
        velocity: index % 2 === 0 ? 0.56 : 0.46,
      })),
    ],
  },
  soul: {
    name: 'soul',
    tempo_range: [72, 104],
    kit: 'pocket-kit',
    swing: 0.12,
    voicing: { range: ['D3', 'E5'], duration: 3.8, velocity: 0.62 },
    bass_pattern: [
      { beat: 0, degree: 'root', duration: 1.25, velocity: 0.78 },
      { beat: 1.5, degree: 'fifth', duration: 0.5, velocity: 0.58 },
      { beat: 2.5, degree: 'octave', duration: 1, velocity: 0.68 },
    ],
    drum_pattern: [
      { step: 0, voice: 'kick', velocity: 0.82 },
      { step: 5, voice: 'snare', velocity: 0.76 },
      { step: 10, voice: 'kick', velocity: 0.58 },
      { step: 13, voice: 'snare', velocity: 0.8 },
      ...Array.from({ length: 8 }, (_, index) => ({
        step: index * 2,
        voice: index === 7 ? ('open_hat' as const) : ('closed_hat' as const),
        velocity: index % 2 === 0 ? 0.48 : 0.4,
      })),
    ],
  },
  lofi: {
    name: 'lofi',
    tempo_range: [70, 94],
    kit: 'dusty-kit',
    swing: 0.18,
    voicing: { range: ['C3', 'B4'], duration: 3.9, velocity: 0.54 },
    bass_pattern: [
      { beat: 0, degree: 'root', duration: 1.75, velocity: 0.66 },
      { beat: 2.75, degree: 'fifth', duration: 0.75, velocity: 0.52 },
    ],
    drum_pattern: [
      { step: 0, voice: 'kick', velocity: 0.72 },
      { step: 6, voice: 'snare', velocity: 0.68 },
      { step: 11, voice: 'kick', velocity: 0.48 },
      { step: 14, voice: 'snare', velocity: 0.7 },
      ...Array.from({ length: 8 }, (_, index) => ({
        step: index * 2,
        voice: 'closed_hat' as const,
        velocity: index % 2 === 0 ? 0.38 : 0.3,
      })),
    ],
  },
};

/** Returns the immutable preset for a supported style. */
export function getStylePreset(style: StyleName): StylePreset {
  return STYLE_PRESETS[style];
}
