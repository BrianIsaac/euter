import { describe, expect, it } from 'vitest';
import type { Note } from '../../src/song/types.ts';
import { gridBeats, quantiseNotes, quantizeNotes } from '../../src/theory/quantise.ts';

const performed: Note = {
  p: 60,
  s: 0.18,
  d: 0.42,
  v: 0.8,
  source: 'take',
};

describe('quantiseNotes', () => {
  it('fully snaps starts and durations while preserving raw timing', () => {
    expect(quantiseNotes([performed], { grid: '16n', strength: 1 })).toEqual([
      {
        ...performed,
        s: 0.25,
        d: 0.5,
        s_raw: 0.18,
        d_raw: 0.42,
      },
    ]);
  });

  it('restores the original performance at strength zero after re-quantising', () => {
    const snapped = quantiseNotes([performed], { grid: '8n', strength: 1 });
    const restored = quantiseNotes(snapped, { grid: '16n', strength: 0, swing: 0.5 });
    expect(restored[0]).toMatchObject({ s: 0.18, d: 0.42, s_raw: 0.18, d_raw: 0.42 });
  });

  it('interpolates strength and delays odd divisions with swing', () => {
    const [note] = quantiseNotes([{ ...performed, s: 0.26 }], {
      grid: '16n',
      strength: 0.5,
      swing: 0.4,
    });
    expect(note?.s).toBeCloseTo(0.305);
    expect(note?.d).toBeCloseTo(0.46);
  });

  it('reports grid lengths and refuses unsafe controls', () => {
    expect(gridBeats('8n')).toBe(0.5);
    expect(gridBeats('16n')).toBe(0.25);
    expect(() => quantiseNotes([performed], { grid: '16n', strength: 1.1 })).toThrow('strength');
    expect(() => quantiseNotes([performed], { grid: '16n', strength: 1, swing: 0.6 })).toThrow(
      'swing',
    );
  });

  it('supports Lane A reducer spelling without changing reversibility', () => {
    expect(quantizeNotes([performed], '16n', 1, 0)[0]).toMatchObject({
      s: 0.25,
      d: 0.5,
      s_raw: 0.18,
      d_raw: 0.42,
    });
  });

  it('clips a swung note inside an optional song boundary', () => {
    const [note] = quantizeNotes([{ ...performed, s: 31.9, d: 0.2 }], '8n', 1, 0.5, 32);
    expect((note?.s ?? 0) + (note?.d ?? 0)).toBeLessThanOrEqual(32);
  });
});
