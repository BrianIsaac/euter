import { describe, expect, it } from 'vitest';
import { generateChords } from '../../../src/theory/generate/chords.ts';
import type { StyleName } from '../../../src/song/types.ts';

const chords = [
  { bar: 1, symbol: 'C' },
  { bar: 2, symbol: 'F' },
];
const tuple = ({ p, s, d, v }: { p: number; s: number; d: number; v: number }) => [p, s, d, v];

const GOLDEN: Record<StyleName, number[][]> = {
  pop: [
    [48, 0, 3.7, 0.68],
    [52, 0, 3.7, 0.68],
    [55, 0, 3.7, 0.68],
    [48, 4, 3.7, 0.68],
    [53, 4, 3.7, 0.68],
    [57, 4, 3.7, 0.68],
  ],
  soul: [
    [60, 0, 3.8, 0.62],
    [64, 0, 3.8, 0.62],
    [67, 0, 3.8, 0.62],
    [57, 4, 3.8, 0.62],
    [60, 4, 3.8, 0.62],
    [65, 4, 3.8, 0.62],
  ],
  lofi: [
    [48, 0, 3.9, 0.54],
    [52, 0, 3.9, 0.54],
    [55, 0, 3.9, 0.54],
    [48, 4, 3.9, 0.54],
    [53, 4, 3.9, 0.54],
    [57, 4, 3.9, 0.54],
  ],
};

describe('golden chord parts', () => {
  it.each(['pop', 'soul', 'lofi'] as const)('generates the original %s fixture', (style) => {
    expect(generateChords(chords, 'C major', style, 1, 2).map(tuple)).toEqual(GOLDEN[style]);
  });
});
