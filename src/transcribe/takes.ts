/** Pitch-track and take construction (plan Architecture item 5; Decisions 5, 6 and 10). */
import { PitchDetector } from 'pitchy';
import type { Note, PitchFrame, Take, TakeSource } from '../song/types.ts';
import { quantiseNotes, type QuantiseGrid } from '../theory/quantise.ts';
import { hzToMidi, segmentPitchTrack } from './segment.ts';

export interface AnalysePcmOptions {
  windowSize?: number;
  hopSize?: number;
  minRms?: number;
}

export interface TakeAlignment {
  inputLatency?: number;
  baseLatency?: number;
  outputLatency?: number;
  captureOffsetSeconds?: number;
}

export interface CreateTakeOptions extends TakeAlignment {
  id: string;
  source: TakeSource;
  bpm: number;
  durationSeconds: number;
  grid?: QuantiseGrid;
  quantiseStrength?: number;
  swing?: number;
  clarityThreshold?: number;
  startBeat?: number;
}

function rms(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    sum += sample * sample;
  }
  return samples.length === 0 ? 0 : Math.sqrt(sum / samples.length);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  const lower = sorted[Math.max(0, middle - 1)] ?? upper;
  return sorted.length % 2 === 0 ? (lower + upper) / 2 : upper;
}

function roundSecond(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Runs McLeod over a mono PCM buffer at a fine enough hop for note segmentation. */
export function analysePcm(
  pcm: Float32Array,
  sampleRate: number,
  { windowSize = 2048, hopSize = 512, minRms = 0.003 }: AnalysePcmOptions = {},
): PitchFrame[] {
  if (sampleRate <= 0 || windowSize <= 0 || hopSize <= 0) {
    throw new RangeError('sampleRate, windowSize and hopSize must be greater than zero');
  }
  if (pcm.length < windowSize) return [];
  const detector = PitchDetector.forFloat32Array(windowSize);
  detector.clarityThreshold = 0.8;
  detector.minVolumeAbsolute = minRms;
  const frames: PitchFrame[] = [];
  for (let start = 0; start + windowSize <= pcm.length; start += hopSize) {
    const window = pcm.subarray(start, start + windowSize);
    const [hz, clarity] = detector.findPitch(window, sampleRate);
    const windowRms = rms(window);
    frames.push({
      t: (start + windowSize / 2) / sampleRate,
      hz: windowRms >= minRms ? hz : 0,
      clarity: windowRms >= minRms ? clarity : 0,
    });
  }
  return frames;
}

/** Aligns capture-clock frames from measured clock and browser-reported device latency. */
export function alignPitchTrack(
  frames: readonly PitchFrame[],
  { inputLatency = 0, baseLatency = 0, outputLatency = 0, captureOffsetSeconds = 0 }: TakeAlignment,
): PitchFrame[] {
  const offset = inputLatency + baseLatency + outputLatency + captureOffsetSeconds;
  return frames
    .filter((frame) => frame.t + 1e-9 >= offset)
    .map((frame) => ({ ...frame, t: roundSecond(Math.max(0, frame.t - offset)) }));
}

/** Builds the shared `Take` shape used by microphone and imported audio. */
export function createTakeFromPitchTrack(
  pitchTrack: readonly PitchFrame[],
  options: CreateTakeOptions,
): Take {
  const clarityThreshold = options.clarityThreshold ?? 0.6;
  const aligned = alignPitchTrack(pitchTrack, options);
  const segmented = segmentPitchTrack(aligned, {
    bpm: options.bpm,
    clarityThreshold,
    startBeat: options.startBeat ?? 0,
  });
  const rawNotes: Note[] = segmented.map((note) => ({
    ...note,
    s_raw: note.s,
    d_raw: note.d,
    source: 'take',
  }));
  const notes = quantiseNotes(rawNotes, {
    grid: options.grid ?? '16n',
    strength: options.quantiseStrength ?? 0,
    swing: options.swing ?? 0,
  });
  const voiced = aligned.filter((frame) => frame.hz > 0 && frame.clarity >= clarityThreshold);
  const pitches = voiced.map((frame) => hzToMidi(frame.hz));
  const offset =
    (options.inputLatency ?? 0) +
    (options.baseLatency ?? 0) +
    (options.outputLatency ?? 0) +
    (options.captureOffsetSeconds ?? 0);
  const pitchRange: [number, number] =
    pitches.length === 0
      ? [0, 0]
      : [Math.floor(Math.min(...pitches)), Math.ceil(Math.max(...pitches))];

  return {
    id: options.id,
    source: options.source,
    notes,
    pitch_track: aligned,
    duration_s: roundSecond(Math.max(0, options.durationSeconds - offset)),
    voiced_ratio: aligned.length === 0 ? 0 : voiced.length / aligned.length,
    median_clarity: median(voiced.map((frame) => frame.clarity)),
    pitch_range: pitchRange,
    tempo_hint: Number.isFinite(options.bpm) && options.bpm > 0 ? options.bpm : null,
  };
}

/** Analyses PCM and returns a take through the same path used for file import. */
export function transcribePcmToTake(
  pcm: Float32Array,
  sampleRate: number,
  options: Omit<CreateTakeOptions, 'durationSeconds'>,
): Take {
  return createTakeFromPitchTrack(analysePcm(pcm, sampleRate), {
    ...options,
    durationSeconds: pcm.length / sampleRate,
  });
}
