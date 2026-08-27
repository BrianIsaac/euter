import { describe, expect, it } from 'vitest';
import { generateBass } from '../../../src/theory/generate/bass.ts';
import type { StyleName } from '../../../src/song/types.ts';

const chords = [
  { bar: 1, symbol: 'C' },
  { bar: 2, symbol: 'F' },
];
const tuple = ({ p, s, d, v }: { p: number; s: number; d: number; v: number }) => [p, s, d, v];

const GOLDEN: Record<StyleName, number[][]> = {
  pop: [
    [36, 0, 1.5, 0.8],
    [43, 2, 1.5, 0.7],
    [41, 4, 1.5, 0.8],
    [48, 6, 1.5, 0.7],
  ],
  soul: [
    [36, 0, 1.25, 0.78],
    [43, 1.5, 0.5, 0.58],
    [48, 2.5, 1, 0.68],
    [41, 4, 1.25, 0.78],
    [48, 5.5, 0.5, 0.58],
    [53, 6.5, 1, 0.68],
  ],
  lofi: [
    [36, 0, 1.75, 0.66],
    [43, 2.75, 0.75, 0.52],
    [41, 4, 1.75, 0.66],
    [48, 6.75, 0.75, 0.52],
  ],
};

describe('golden bass parts', () => {
  it.each(['pop', 'soul', 'lofi'] as const)('generates the original %s fixture', (style) => {
    expect(generateBass(chords, 'C major', style, 1, 2).map(tuple)).toEqual(GOLDEN[style]);
  });
});
