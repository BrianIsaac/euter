/** SwiftF0-style pitch-track segmentation (plan Decision 5; music §2.3). */
import type { PitchFrame } from '../song/types.ts';

export interface SegmentedNote {
  /** Rounded MIDI pitch. */
  p: number;
  /** Start in quarter-note beats from the known recording grid. */
  s: number;
  /** Duration in quarter-note beats. */
  d: number;
  /** Velocity derived from median clarity. */
  v: number;
}

export interface SegmentOptions {
  bpm: number;
  startBeat?: number;
  clarityThreshold?: number;
  splitSemitones?: number;
  unvoicedGraceSeconds?: number;
  minNoteSeconds?: number;
  octaveGuardSeconds?: number;
  minHz?: number;
  maxHz?: number;
}

interface RawSegment {
  frames: PitchFrame[];
  start: number;
  end: number;
  midi: number;
  clarity: number;
}

const DEFAULT_FRAME_SECONDS = 0.02;

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  const lower = sorted[Math.max(0, middle - 1)] ?? upper;
  return sorted.length % 2 === 0 ? (lower + upper) / 2 : upper;
}

function typicalFrameStep(frames: readonly PitchFrame[]): number {
  const steps: number[] = [];
  for (let index = 1; index < frames.length; index += 1) {
    const step = (frames[index]?.t ?? 0) - (frames[index - 1]?.t ?? 0);
    if (step > 0 && Number.isFinite(step)) steps.push(step);
  }
  return median(steps) || DEFAULT_FRAME_SECONDS;
}

function makeRawSegment(frames: PitchFrame[], frameStep: number): RawSegment | null {
  if (frames.length === 0) return null;
  const first = frames[0];
  const last = frames.at(-1);
  if (first === undefined || last === undefined) return null;
  return {
    frames,
    start: first.t,
    end: last.t + frameStep,
    midi: median(frames.map((frame) => hzToMidi(frame.hz))),
    clarity: median(frames.map((frame) => frame.clarity)),
  };
}

function mergeSamePitch(segments: readonly RawSegment[], grace: number): RawSegment[] {
  const merged: RawSegment[] = [];
  for (const segment of segments) {
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      Math.round(previous.midi) === Math.round(segment.midi) &&
      segment.start - previous.end <= grace
    ) {
      const frames = [...previous.frames, ...segment.frames];
      previous.frames = frames;
      previous.end = segment.end;
      previous.midi = median(frames.map((frame) => hzToMidi(frame.hz)));
      previous.clarity = median(frames.map((frame) => frame.clarity));
    } else {
      merged.push({ ...segment, frames: [...segment.frames] });
    }
  }
  return merged;
}

function foldOctaveBlips(segments: RawSegment[], maxSeconds: number): RawSegment[] {
  const guarded = segments.map((segment) => ({ ...segment, frames: [...segment.frames] }));
  for (let index = 1; index < guarded.length - 1; index += 1) {
    const previous = guarded[index - 1];
    const current = guarded[index];
    const next = guarded[index + 1];
    if (previous === undefined || current === undefined || next === undefined) continue;
    const neighboursAgree = Math.abs(previous.midi - next.midi) < 0.8;
    const octaveFromPrevious = Math.abs(Math.abs(current.midi - previous.midi) - 12) < 0.8;
    if (neighboursAgree && octaveFromPrevious && current.end - current.start <= maxSeconds) {
      current.midi = (previous.midi + next.midi) / 2;
      current.frames = current.frames.map((frame) => ({
        ...frame,
        hz: frame.hz * 2 ** ((current.midi - hzToMidi(frame.hz)) / 12),
      }));
    }
  }
  return guarded;
}

/**
 * Groups voiced frames, bridges a 20 ms breath, rejects short/noisy tails and folds isolated
 * octave mistakes before converting seconds to the known beat grid.
 */
export function segmentPitchTrack(
  inputFrames: readonly PitchFrame[],
  options: SegmentOptions,
): SegmentedNote[] {
  if (!Number.isFinite(options.bpm) || options.bpm <= 0) {
    throw new RangeError('bpm must be greater than zero');
  }
  const startBeat = options.startBeat ?? 0;
  const clarityThreshold = options.clarityThreshold ?? 0.6;
  const splitSemitones = options.splitSemitones ?? 0.8;
  const grace = options.unvoicedGraceSeconds ?? 0.02;
  const minSeconds = options.minNoteSeconds ?? 0.05;
  const octaveGuardSeconds = options.octaveGuardSeconds ?? 0.12;
  const minHz = options.minHz ?? 46.875;
  const maxHz = options.maxHz ?? 2093.75;
  const frames = [...inputFrames].sort((a, b) => a.t - b.t);
  const frameStep = typicalFrameStep(frames);
  const rawSegments: RawSegment[] = [];
  let current: PitchFrame[] = [];
  let lastVoiced: PitchFrame | undefined;

  const closeCurrent = (): void => {
    const segment = makeRawSegment(current, frameStep);
    if (segment !== null && segment.end - segment.start + 1e-9 >= minSeconds) {
      rawSegments.push(segment);
    }
    current = [];
    lastVoiced = undefined;
  };

  for (const frame of frames) {
    const voiced =
      Number.isFinite(frame.hz) &&
      frame.hz >= minHz &&
      frame.hz <= maxHz &&
      Number.isFinite(frame.clarity) &&
      frame.clarity >= clarityThreshold;
    if (!voiced) continue;

    if (lastVoiced !== undefined) {
      const unvoicedGap = Math.max(0, frame.t - lastVoiced.t - frameStep);
      if (unvoicedGap > grace + 1e-9) closeCurrent();
    }

    if (current.length > 0) {
      const centre = median(current.map((item) => hzToMidi(item.hz)));
      if (Math.abs(hzToMidi(frame.hz) - centre) > splitSemitones) closeCurrent();
    }

    current.push(frame);
    lastVoiced = frame;
  }
  closeCurrent();

  const guarded = foldOctaveBlips(rawSegments, octaveGuardSeconds);
  const merged = mergeSamePitch(guarded, grace + frameStep);
  const beatsPerSecond = options.bpm / 60;
  return merged.map((segment) => ({
    p: Math.round(segment.midi),
    s: startBeat + segment.start * beatsPerSecond,
    d: Math.max((segment.end - segment.start) * beatsPerSecond, minSeconds * beatsPerSecond),
    v: Math.min(1, Math.max(0.2, 0.25 + segment.clarity * 0.75)),
  }));
}
