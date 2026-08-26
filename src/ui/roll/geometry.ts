/** Coordinate spaces and viewport culling for the piano roll (plan Architecture item 7). */
import type { Note } from '../../song/types.ts';

export interface RollGeometryOptions {
  bars: number;
  beatsPerBar: number;
  pitchMin?: number;
  pitchMax?: number;
  pixelsPerBeat?: number;
  rowHeight?: number;
  labelWidth?: number;
  headerHeight?: number;
}

export interface RollGeometry {
  bars: number;
  beatsPerBar: number;
  pitchMin: number;
  pitchMax: number;
  pixelsPerBeat: number;
  rowHeight: number;
  labelWidth: number;
  headerHeight: number;
  width: number;
  height: number;
}

export interface NoteRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createRollGeometry({
  bars,
  beatsPerBar,
  pitchMin = 36,
  pitchMax = 84,
  pixelsPerBeat = 48,
  rowHeight = 12,
  labelWidth = 58,
  headerHeight = 66,
}: RollGeometryOptions): RollGeometry {
  if (bars < 1 || beatsPerBar < 1 || pitchMax < pitchMin) {
    throw new RangeError('Roll geometry needs positive bars/beats and an ordered pitch range');
  }
  return {
    bars,
    beatsPerBar,
    pitchMin,
    pitchMax,
    pixelsPerBeat,
    rowHeight,
    labelWidth,
    headerHeight,
    width: labelWidth + bars * beatsPerBar * pixelsPerBeat,
    height: headerHeight + (pitchMax - pitchMin + 1) * rowHeight,
  };
}

export function beatToX(beat: number, geometry: RollGeometry): number {
  return geometry.labelWidth + beat * geometry.pixelsPerBeat;
}

export function xToBeat(x: number, geometry: RollGeometry): number {
  return (x - geometry.labelWidth) / geometry.pixelsPerBeat;
}

export function pitchToY(pitch: number, geometry: RollGeometry): number {
  return geometry.headerHeight + (geometry.pitchMax - pitch) * geometry.rowHeight;
}

export function yToPitch(y: number, geometry: RollGeometry): number {
  return Math.round(geometry.pitchMax - (y - geometry.headerHeight) / geometry.rowHeight);
}

export function noteRectangle(
  note: Pick<Note, 'p' | 's' | 'd'>,
  geometry: RollGeometry,
): NoteRectangle {
  return {
    x: beatToX(note.s, geometry),
    y: pitchToY(note.p, geometry) + 1,
    width: Math.max(3, note.d * geometry.pixelsPerBeat),
    height: Math.max(3, geometry.rowHeight - 2),
  };
}

export function cullNotes(
  notes: readonly Note[],
  geometry: RollGeometry,
  scrollLeft: number,
  viewportWidth: number,
): Array<{ note: Note; index: number; rectangle: NoteRectangle }> {
  const viewportRight = scrollLeft + viewportWidth;
  const visible: Array<{ note: Note; index: number; rectangle: NoteRectangle }> = [];
  notes.forEach((note, index) => {
    const rectangle = noteRectangle(note, geometry);
    if (
      rectangle.x + rectangle.width >= scrollLeft &&
      rectangle.x <= viewportRight &&
      rectangle.y + rectangle.height >= geometry.headerHeight &&
      rectangle.y <= geometry.height
    ) {
      visible.push({ note, index, rectangle });
    }
  });
  return visible;
}

export function hitTestNote(
  notes: readonly Note[],
  geometry: RollGeometry,
  x: number,
  y: number,
): { note: Note; index: number; rectangle: NoteRectangle } | null {
  for (let index = notes.length - 1; index >= 0; index -= 1) {
    const note = notes[index];
    if (note === undefined) continue;
    const rectangle = noteRectangle(note, geometry);
    if (
      x >= rectangle.x &&
      x <= rectangle.x + rectangle.width &&
      y >= rectangle.y &&
      y <= rectangle.y + rectangle.height
    ) {
      return { note, index, rectangle };
    }
  }
  return null;
}

export function snapBeat(beat: number, division = 0.25): number {
  return Math.max(0, Math.round(beat / division) * division);
}
