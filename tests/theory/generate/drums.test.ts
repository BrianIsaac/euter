import { describe, expect, it } from 'vitest';
import { generateDrums } from '../../../src/theory/generate/drums.ts';
import type { StyleName } from '../../../src/song/types.ts';

const tuple = ({ p, s, d, v }: { p: number; s: number; d: number; v: number }) => [p, s, d, v];

const GOLDEN: Record<StyleName, number[][]> = {
  pop: [
    [36, 0, 0.2, 0.9],
    [42, 0, 0.12, 0.56],
    [42, 0.5, 0.12, 0.46],
    [38, 1, 0.2, 0.82],
    [42, 1, 0.12, 0.56],
    [36, 1.5, 0.2, 0.72],
    [42, 1.5, 0.12, 0.46],
    [42, 2, 0.12, 0.56],
    [42, 2.5, 0.12, 0.46],
    [38, 3, 0.2, 0.84],
    [42, 3, 0.12, 0.56],
    [42, 3.5, 0.12, 0.46],
  ],
  soul: [
    [36, 0, 0.2, 0.82],
    [42, 0, 0.12, 0.48],
    [42, 0.5, 0.12, 0.4],
    [42, 1, 0.12, 0.48],
    [38, 1.28, 0.2, 0.76],
    [42, 1.5, 0.12, 0.4],
    [42, 2, 0.12, 0.48],
    [36, 2.5, 0.2, 0.58],
    [42, 2.5, 0.12, 0.4],
    [42, 3, 0.12, 0.48],
    [38, 3.28, 0.2, 0.8],
    [46, 3.5, 0.12, 0.4],
  ],
  lofi: [
    [36, 0, 0.2, 0.72],
    [42, 0, 0.12, 0.38],
    [42, 0.5, 0.12, 0.3],
    [42, 1, 0.12, 0.38],
    [38, 1.5, 0.2, 0.68],
    [42, 1.5, 0.12, 0.3],
    [42, 2, 0.12, 0.38],
    [42, 2.5, 0.12, 0.3],
    [36, 2.795, 0.2, 0.48],
    [42, 3, 0.12, 0.38],
    [38, 3.5, 0.2, 0.7],
    [42, 3.5, 0.12, 0.3],
  ],
};

describe('golden drum parts', () => {
  it.each(['pop', 'soul', 'lofi'] as const)('generates the original %s fixture', (style) => {
    expect(generateDrums(style, 1, 1).map(tuple)).toEqual(GOLDEN[style]);
  });
});
