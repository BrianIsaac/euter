import { describe, expect, it } from 'vitest';
import type { Note } from '../../../src/song/types.ts';
import {
  beatToX,
  createRollGeometry,
  cullNotes,
  hitTestNote,
  noteRectangle,
  pitchToY,
  snapBeat,
  xToBeat,
  yToPitch,
} from '../../../src/ui/roll/geometry.ts';

const geometry = createRollGeometry({ bars: 8, beatsPerBar: 4 });
const note = (p: number, s: number, d = 1): Note => ({ p, s, d, v: 0.8, source: 'human' });

describe('piano-roll geometry', () => {
  it('round-trips beat and pitch coordinate spaces', () => {
    expect(xToBeat(beatToX(5.25, geometry), geometry)).toBeCloseTo(5.25);
    expect(yToPitch(pitchToY(64, geometry) + geometry.rowHeight / 2, geometry)).toBe(64);
    expect(geometry.width).toBe(1594);
    expect(geometry.height).toBe(654);
  });

  it('builds note rectangles and hits the topmost overlapping note', () => {
    const notes = [note(60, 1, 0.5), note(60, 1, 1)];
    const rectangle = noteRectangle(notes[1] as Note, geometry);
    expect(rectangle).toMatchObject({ x: 106, width: 48, height: 10 });
    expect(hitTestNote(notes, geometry, rectangle.x + 2, rectangle.y + 2)?.index).toBe(1);
    expect(hitTestNote(notes, geometry, 0, 0)).toBeNull();
  });

  it('culls notes outside the horizontal viewport', () => {
    const notes = [note(60, 0), note(62, 8), note(64, 20)];
    expect(cullNotes(notes, geometry, beatToX(7, geometry), 150).map((item) => item.index)).toEqual(
      [1],
    );
  });

  it('snaps to sixteenths without going before beat zero', () => {
    expect(snapBeat(0.37)).toBe(0.25);
    expect(snapBeat(-2)).toBe(0);
  });
});
