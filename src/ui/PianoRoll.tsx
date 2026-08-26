import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type UIEvent,
} from 'react';
import type { Note, NoteSource, SongDocument, Take, Track } from '../song/types.ts';
import { hzToMidi } from '../transcribe/segment.ts';
import type { Command } from '../webmcp/bus.ts';
import type { CommandQueue } from '../webmcp/queue.ts';
import { humanNotesCommand } from './roll/editCommands.ts';
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
  type RollGeometry,
} from './roll/geometry.ts';
import './roll/lane-b.css';

export interface PianoRollProps {
  song: SongDocument;
  trackId: string;
  take?: Take | null;
  playheadBeat?: number | null;
  targetBars?: readonly [number, number] | null;
  gesture: Pick<CommandQueue, 'setGestureActive'>;
  onDispatch(command: Command): void;
}

interface DragState {
  index: number;
  originX: number;
  originY: number;
  original: Note;
  mode: 'move' | 'resize';
}

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const BLACK_CLASSES = new Set([1, 3, 6, 8, 10]);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function pitchName(pitch: number, keyName: string): string {
  const preferFlats = keyName.includes('♭') || /\b(F|Bb|Eb|Ab|Db|Gb)\b/.test(keyName);
  const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
  return `${names[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
}

export function noteColour(source: NoteSource): string {
  if (source === 'agent') return '#b48cff';
  if (source === 'take') return '#e8c26a';
  return '#7dd3c0';
}

function drawLine(
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  colour: string,
  width = 1,
): void {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.strokeStyle = colour;
  context.lineWidth = width;
  context.stroke();
}

interface DrawOptions {
  canvas: HTMLCanvasElement;
  geometry: RollGeometry;
  song: SongDocument;
  track: Track;
  take: Take | null;
  playheadBeat: number | null;
  targetBars: readonly [number, number] | null;
  scrollLeft: number;
  viewportWidth: number;
}

function drawPianoRoll({
  canvas,
  geometry,
  song,
  track,
  take,
  playheadBeat,
  targetBars,
  scrollLeft,
  viewportWidth,
}: DrawOptions): void {
  const context = canvas.getContext('2d');
  if (context === null) return;
  context.clearRect(0, 0, geometry.width, geometry.height);
  context.fillStyle = '#171a20';
  context.fillRect(0, 0, geometry.width, geometry.height);

  for (const section of song.sections) {
    const x = beatToX((section.bar_from - 1) * geometry.beatsPerBar, geometry);
    const width =
      (section.bar_to - section.bar_from + 1) * geometry.beatsPerBar * geometry.pixelsPerBeat;
    context.fillStyle = section.name.toLowerCase().includes('chorus') ? '#302642' : '#242b35';
    context.fillRect(x, 0, width, 22);
    context.fillStyle = '#e7e9ee';
    context.font = '11px system-ui';
    context.fillText(section.name, x + 6, 15);
  }

  if (targetBars !== null) {
    const x = beatToX((targetBars[0] - 1) * geometry.beatsPerBar, geometry);
    const width =
      (targetBars[1] - targetBars[0] + 1) * geometry.beatsPerBar * geometry.pixelsPerBeat;
    context.fillStyle = 'rgba(180, 140, 255, 0.12)';
    context.fillRect(x, 0, width, geometry.height);
  }

  context.fillStyle = '#1c1f26';
  context.fillRect(0, 0, geometry.labelWidth, geometry.height);
  context.fillRect(geometry.labelWidth, 22, geometry.width - geometry.labelWidth, 44);
  context.font = '10px system-ui';
  const keyRoot = (song.key.name.split(' ')[0] ?? '').replace('b', '♭').replace('#', '♯');
  for (let bar = 0; bar < geometry.bars; bar += 1) {
    const barBeat = bar * geometry.beatsPerBar;
    const x = beatToX(barBeat, geometry);
    drawLine(context, x, 22, x, geometry.height, '#505667');
    context.fillStyle = '#9aa3b2';
    context.fillText(String(bar + 1), x + 5, 37);
    const chord = song.chords.find((entry) => entry.bar === bar + 1);
    if (chord !== undefined) {
      context.fillStyle = '#e8c26a';
      context.fillText(chord.symbol, x + 5, 57);
    }
    for (let beat = 1; beat < geometry.beatsPerBar; beat += 1) {
      const beatX = beatToX(barBeat + beat, geometry);
      drawLine(context, beatX, geometry.headerHeight, beatX, geometry.height, '#2f3442');
    }
  }

  for (let pitch = geometry.pitchMin; pitch <= geometry.pitchMax; pitch += 1) {
    const y = pitchToY(pitch, geometry);
    const pitchClass = ((pitch % 12) + 12) % 12;
    if (BLACK_CLASSES.has(pitchClass)) {
      context.fillStyle = 'rgba(5, 7, 11, 0.38)';
      context.fillRect(
        geometry.labelWidth,
        y,
        geometry.width - geometry.labelWidth,
        geometry.rowHeight,
      );
    }
    drawLine(context, 0, y, geometry.width, y, '#252a35');
    const label = pitchName(pitch, song.key.name);
    if (pitchClass === 0 || label.replace(/-?\d+$/, '') === keyRoot) {
      context.fillStyle = pitchClass === 0 ? '#9aa3b2' : '#7dd3c0';
      context.fillText(label, 7, y + 10);
    }
  }

  if (take !== null && take.pitch_track.length > 1) {
    const bpm = take.tempo_hint ?? song.bpm;
    const startBeat =
      take.notes.length === 0 ? 0 : Math.min(...take.notes.map((note) => note.s_raw ?? note.s));
    context.beginPath();
    let drawing = false;
    for (const frame of take.pitch_track) {
      if (frame.hz <= 0 || frame.clarity < 0.4) {
        drawing = false;
        continue;
      }
      const x = beatToX(startBeat + frame.t * (bpm / 60), geometry);
      const y = pitchToY(hzToMidi(frame.hz), geometry) + geometry.rowHeight / 2;
      if (drawing) context.lineTo(x, y);
      else context.moveTo(x, y);
      drawing = true;
    }
    context.strokeStyle = 'rgba(232, 194, 106, 0.72)';
    context.lineWidth = 1.5;
    context.stroke();
  }

  for (const { note, rectangle } of cullNotes(
    track.notes,
    geometry,
    scrollLeft,
    viewportWidth || geometry.width,
  )) {
    context.fillStyle = noteColour(note.source);
    context.globalAlpha = note.source === 'agent' ? 0.82 : 0.9;
    context.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
    context.globalAlpha = 1;
  }

  if (playheadBeat !== null) {
    const x = beatToX(playheadBeat, geometry);
    drawLine(context, x, 0, x, geometry.height, '#ff7b7b', 2);
  }
}

export function PianoRoll({
  song,
  trackId,
  take = null,
  playheadBeat = null,
  targetBars = null,
  gesture,
  onDispatch,
}: PianoRollProps) {
  const track = song.tracks.find((candidate) => candidate.id === trackId);
  const beatsPerBar = song.time_sig[0];
  const geometry = useMemo(
    () =>
      createRollGeometry({
        bars: song.bars,
        beatsPerBar,
      }),
    [beatsPerBar, song.bars],
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [flashing, setFlashing] = useState(false);
  const targetFrom = targetBars?.[0] ?? null;
  const targetTo = targetBars?.[1] ?? null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || track === undefined) return;
    drawPianoRoll({
      canvas,
      geometry,
      song,
      track,
      take,
      playheadBeat,
      targetBars,
      scrollLeft,
      viewportWidth: scrollRef.current?.clientWidth ?? geometry.width,
    });
  }, [geometry, playheadBeat, scrollLeft, song, take, targetBars, track]);

  useEffect(() => {
    if (targetFrom === null || targetTo === null) return;
    const surface = scrollRef.current;
    if (surface === null) return;
    const left = Math.max(
      0,
      beatToX((targetFrom - 1) * geometry.beatsPerBar, geometry) - geometry.labelWidth,
    );
    surface.scrollLeft = left;
    setScrollLeft(left);
    setFlashing(true);
    const timer = setTimeout(() => setFlashing(false), 850);
    return () => clearTimeout(timer);
  }, [geometry, targetFrom, targetTo]);

  if (track === undefined) {
    return (
      <section className="piano-roll-panel" aria-label="Piano roll">
        <p className="input-error">Track {trackId} is not in the song.</p>
      </section>
    );
  }

  const canvasPoint = (event: PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rectangle = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
  };

  const noteBars = (note: Pick<Note, 's' | 'd'>): [number, number] => {
    const barFrom = Math.floor(note.s / geometry.beatsPerBar) + 1;
    return [barFrom, Math.max(barFrom, Math.ceil((note.s + note.d) / geometry.beatsPerBar))];
  };

  const dispatchNotes = (
    notes: Note[],
    summary: string,
    [barFrom, barTo]: readonly [number, number],
  ): void => {
    onDispatch(
      humanNotesCommand(track.id, notes, summary, {
        barFrom,
        barTo,
        beatsPerBar: geometry.beatsPerBar,
      }),
    );
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    const { x, y } = canvasPoint(event);
    if (y < geometry.headerHeight || x < geometry.labelWidth) return;
    const hit = hitTestNote(track.notes, geometry, x, y);
    if (hit === null) {
      gesture.setGestureActive(true);
      const note: Note = {
        p: clamp(yToPitch(y, geometry), 24, 96),
        s: snapBeat(xToBeat(x, geometry)),
        d: 0.5,
        v: 0.8,
        source: 'human',
      };
      const notes = [...track.notes, note].sort((a, b) => a.s - b.s || a.p - b.p);
      dispatchNotes(
        notes,
        `Added ${pitchName(note.p, song.key.name)} at beat ${note.s + 1}`,
        noteBars(note),
      );
      setSelectedIndex(notes.indexOf(note));
      gesture.setGestureActive(false);
      return;
    }
    setSelectedIndex(hit.index);
    gesture.setGestureActive(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      index: hit.index,
      originX: x,
      originY: y,
      original: { ...hit.note },
      mode: x >= hit.rectangle.x + hit.rectangle.width - 8 ? 'resize' : 'move',
    };
  };

  const finishDrag = (event: PointerEvent<HTMLCanvasElement>): void => {
    const drag = dragRef.current;
    if (drag === null) return;
    const { x, y } = canvasPoint(event);
    const beatDelta = (x - drag.originX) / geometry.pixelsPerBeat;
    const pitchDelta = yToPitch(y, geometry) - yToPitch(drag.originY, geometry);
    const songEnd = geometry.bars * geometry.beatsPerBar;
    const edited: Note = {
      ...drag.original,
      source: 'human',
      ...(drag.mode === 'move'
        ? {
            s: Math.min(songEnd - 0.25, snapBeat(drag.original.s + beatDelta)),
            p: clamp(drag.original.p + pitchDelta, 24, 96),
          }
        : {
            d: Math.min(
              songEnd - drag.original.s,
              Math.max(0.25, snapBeat(drag.original.d + beatDelta)),
            ),
          }),
    };
    const notes = track.notes.map((note, index) => (index === drag.index ? edited : note));
    const originalBars = noteBars(drag.original);
    const editedBars = noteBars(edited);
    dispatchNotes(
      notes,
      `${drag.mode === 'move' ? 'Moved' : 'Resized'} ${pitchName(edited.p, song.key.name)}`,
      [Math.min(originalBars[0], editedBars[0]), Math.max(originalBars[1], editedBars[1])],
    );
    dragRef.current = null;
    gesture.setGestureActive(false);
  };

  const cancelDrag = (): void => {
    if (dragRef.current === null) return;
    dragRef.current = null;
    gesture.setGestureActive(false);
  };

  const deleteSelected = (): void => {
    if (selectedIndex === null || track.notes[selectedIndex] === undefined) return;
    const removed = track.notes[selectedIndex];
    dispatchNotes(
      track.notes.filter((_, index) => index !== selectedIndex),
      `Deleted ${pitchName(removed.p, song.key.name)}`,
      noteBars(removed),
    );
    setSelectedIndex(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteSelected();
    }
  };

  const onScroll = (event: UIEvent<HTMLDivElement>): void => {
    setScrollLeft(event.currentTarget.scrollLeft);
  };

  const selected = selectedIndex === null ? undefined : track.notes[selectedIndex];
  const selectedRectangle = selected === undefined ? null : noteRectangle(selected, geometry);

  return (
    <section
      className="piano-roll-panel"
      aria-label="Piano roll"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <header className="roll-toolbar">
        <span>
          <strong>{track.name}</strong> <span className="muted">{song.key.name}</span>
        </span>
        <span className="muted">
          Click to add. Drag to move; drag the right edge to resize. Delete removes the selection.
        </span>
      </header>
      <div
        ref={scrollRef}
        className={`roll-scroll${flashing ? ' target-flash' : ''}`}
        onScroll={onScroll}
        data-testid="roll-scroll"
      >
        <div className="roll-stage" style={{ width: geometry.width, height: geometry.height }}>
          <canvas
            ref={canvasRef}
            className="roll-canvas"
            width={geometry.width}
            height={geometry.height}
            role="img"
            aria-label={`${track.name} notes across ${song.bars} bars`}
            onPointerDown={onPointerDown}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
          />
          {selectedRectangle === null || selected === undefined ? null : (
            <div
              className="selected-note-overlay"
              data-testid="selected-note"
              style={selectedRectangle}
              aria-label={`Selected ${pitchName(selected.p, song.key.name)}`}
            >
              {pitchName(selected.p, song.key.name)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
