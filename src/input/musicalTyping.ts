/** GarageBand Musical Typing and transport-timestamped keyboard takes (plan Decision 10). */
import type { Note, Take, TakeSource } from '../song/types.ts';
import type { TransportPort } from './transportPort.ts';

export const WHITE_KEY_MAP = {
  a: 0,
  s: 2,
  d: 4,
  f: 5,
  g: 7,
  h: 9,
  j: 11,
  k: 12,
} as const;

export const BLACK_KEY_MAP = {
  w: 1,
  e: 3,
  t: 6,
  y: 8,
  u: 10,
} as const;

const NOTE_OFF_EPSILON_BEATS = 0.02;

export interface PlayedNoteSink {
  noteOn(pitch: number, velocity: number): void;
  noteOff(pitch: number): void;
}

export interface MusicalTypingSnapshot {
  octave: number;
  velocity: number;
  activePitches: readonly number[];
  recording: boolean;
}

export interface StartPlayedTakeOptions {
  id: string;
  bpm?: number;
  startBeat?: number;
  source?: Extract<TakeSource, 'keyboard' | 'midi'>;
}

interface ActiveNote {
  pitch: number;
  startedAtSeconds: number;
  velocity: number;
}

interface TakeCapture {
  options: Required<StartPlayedTakeOptions>;
  startedAtSeconds: number;
  notes: Note[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Converts the GarageBand letter map into MIDI at the displayed octave. */
export function typingKeyToPitch(key: string, octave: number): number | null {
  const normalised = key.toLowerCase();
  const offset =
    WHITE_KEY_MAP[normalised as keyof typeof WHITE_KEY_MAP] ??
    BLACK_KEY_MAP[normalised as keyof typeof BLACK_KEY_MAP];
  return offset === undefined ? null : (octave + 1) * 12 + offset;
}

/** Records computer-keyboard, on-screen and MIDI notes against the transport clock. */
export class PlayedNoteRecorder implements PlayedNoteSink {
  readonly #listeners = new Set<() => void>();
  readonly #activeByKey = new Map<string, ActiveNote>();
  readonly #sink: PlayedNoteSink;
  readonly transport: TransportPort;
  #octave = 4;
  #velocity = 0.8;
  #capture: TakeCapture | null = null;
  #snapshot: MusicalTypingSnapshot = {
    octave: 4,
    velocity: 0.8,
    activePitches: [],
    recording: false,
  };

  constructor(transport: TransportPort, sink: PlayedNoteSink = { noteOn() {}, noteOff() {} }) {
    this.transport = transport;
    this.#sink = sink;
  }

  readonly getSnapshot = (): MusicalTypingSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #publish(): void {
    this.#snapshot = {
      octave: this.#octave,
      velocity: this.#velocity,
      activePitches: [...this.#activeByKey.values()].map((note) => note.pitch),
      recording: this.#capture !== null,
    };
    for (const listener of this.#listeners) listener();
  }

  startTake(options: StartPlayedTakeOptions): void {
    this.#capture = {
      options: {
        id: options.id,
        bpm: options.bpm ?? this.transport.getBpm(),
        startBeat: options.startBeat ?? 0,
        source: options.source ?? 'keyboard',
      },
      startedAtSeconds: this.transport.getPositionSeconds(),
      notes: [],
    };
    this.#publish();
  }

  stopTake(): Take {
    const capture = this.#capture;
    if (capture === null) throw new Error('No played take is recording');
    for (const key of [...this.#activeByKey.keys()]) this.releaseKey(key);
    const endedAt = this.transport.getPositionSeconds();
    this.#capture = null;
    this.#publish();
    const pitches = capture.notes.map((note) => note.p);
    return {
      id: capture.options.id,
      source: capture.options.source,
      notes: capture.notes,
      pitch_track: [],
      duration_s: round(Math.max(0, endedAt - capture.startedAtSeconds)),
      voiced_ratio: capture.notes.length === 0 ? 0 : 1,
      median_clarity: capture.notes.length === 0 ? 0 : 1,
      pitch_range: pitches.length === 0 ? [0, 0] : [Math.min(...pitches), Math.max(...pitches)],
      tempo_hint: capture.options.bpm,
    };
  }

  pressKey(key: string, repeat = false): boolean {
    const normalised = key.toLowerCase();
    if (repeat || this.#activeByKey.has(normalised)) return false;
    if (normalised === 'z' || normalised === 'x') {
      this.#octave = clamp(this.#octave + (normalised === 'z' ? -1 : 1), 0, 8);
      this.#publish();
      return true;
    }
    if (normalised === 'c' || normalised === 'v') {
      this.#velocity = round(clamp(this.#velocity + (normalised === 'c' ? -0.1 : 0.1), 0.1, 1));
      this.#publish();
      return true;
    }
    const pitch = typingKeyToPitch(normalised, this.#octave);
    if (pitch === null) return false;
    this.#activeByKey.set(normalised, {
      pitch,
      velocity: this.#velocity,
      startedAtSeconds: this.transport.getPositionSeconds(),
    });
    this.#sink.noteOn(pitch, this.#velocity);
    this.#publish();
    return true;
  }

  releaseKey(key: string): boolean {
    const normalised = key.toLowerCase();
    const active = this.#activeByKey.get(normalised);
    if (active === undefined) return false;
    this.#activeByKey.delete(normalised);
    this.#sink.noteOff(active.pitch);
    this.#finishNote(active);
    this.#publish();
    return true;
  }

  noteOn(pitch: number, velocity: number): void {
    const key = `midi:${pitch}`;
    if (this.#activeByKey.has(key)) return;
    this.#activeByKey.set(key, {
      pitch,
      velocity: clamp(velocity, 0, 1),
      startedAtSeconds: this.transport.getPositionSeconds(),
    });
    this.#sink.noteOn(pitch, velocity);
    this.#publish();
  }

  noteOff(pitch: number): void {
    this.releaseKey(`midi:${pitch}`);
  }

  #finishNote(active: ActiveNote): void {
    const capture = this.#capture;
    if (capture === null) return;
    const beatsPerSecond = capture.options.bpm / 60;
    const start =
      capture.options.startBeat +
      (active.startedAtSeconds - capture.startedAtSeconds) * beatsPerSecond;
    const duration = Math.max(
      NOTE_OFF_EPSILON_BEATS,
      (this.transport.getPositionSeconds() - active.startedAtSeconds) * beatsPerSecond,
    );
    capture.notes.push({
      p: active.pitch,
      s: round(start),
      d: round(duration),
      v: active.velocity,
      s_raw: round(start),
      d_raw: round(duration),
      source: 'take',
    });
  }
}
