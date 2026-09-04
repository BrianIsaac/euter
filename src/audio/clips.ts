/** JSON-safe recorded-audio storage and Web Audio decoding. */
import { Note as TonalNote } from 'tonal';
import type { AudioClip, PitchFrame, Take, TakeAudio } from '../song/types.ts';
import { gridBeats } from '../theory/quantise.ts';

const BASE64_CHUNK_BYTES = 0x8000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(start, start + BASE64_CHUNK_BYTES));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Encodes mono float PCM as compact PCM16 without losing it at the take boundary. */
export function encodeTakeAudio(
  pcm: Float32Array,
  sampleRate: number,
  trimStartSeconds = 0,
  startBeat = 0,
): TakeAudio {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('Audio sample rate must be greater than zero.');
  }
  if (!Number.isFinite(trimStartSeconds) || trimStartSeconds < 0) {
    throw new RangeError('Audio trim start must not be negative.');
  }
  if (!Number.isFinite(startBeat) || startBeat < 0) {
    throw new RangeError('Audio start beat must not be negative.');
  }
  const bytes = new Uint8Array(pcm.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < pcm.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, pcm[index] ?? 0));
    view.setInt16(index * 2, sample < 0 ? sample * 32_768 : sample * 32_767, true);
  }
  return {
    encoding: 'pcm16-base64',
    sample_rate: sampleRate,
    channels: 1,
    samples: bytesToBase64(bytes),
    trim_start_s: trimStartSeconds,
    start_beat: startBeat,
  };
}

/** Rehydrates retained mono PCM into the caller's live or offline audio context. */
export function decodeTakeAudio(
  audio: TakeAudio,
  context: Pick<BaseAudioContext, 'createBuffer'>,
): AudioBuffer {
  const bytes = base64ToBytes(audio.samples);
  if (bytes.byteLength % 2 !== 0) throw new RangeError('PCM16 audio has an odd byte length.');
  const samples = bytes.byteLength / 2;
  const buffer = context.createBuffer(1, samples, audio.sample_rate);
  const output = buffer.getChannelData(0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < samples; index += 1) {
    const value = view.getInt16(index * 2, true);
    output[index] = value < 0 ? value / 32_768 : value / 32_767;
  }
  return buffer;
}

export interface VocalScheduleRequest {
  context: BaseAudioContext;
  destination: unknown;
  buffer: AudioBuffer;
  take: Take;
  clip: AudioClip;
  keyName: string;
  bpm: number;
  whenSeconds: number;
  /** Position on the clip timeline represented by `whenSeconds`. */
  clipElapsedSeconds: number;
  durationSeconds: number;
}

const SCALE_INTERVALS = {
  major: new Set([0, 2, 4, 5, 7, 9, 11]),
  minor: new Set([0, 2, 3, 5, 7, 8, 10]),
} as const;
const GRAIN_SECONDS = 0.06;
const GRAIN_HOP_SECONDS = GRAIN_SECONDS / 2;

/** Schedules a clean source or time-preserving grains when vocal processing is active. */
export function scheduleVocalAudio(request: VocalScheduleRequest): number {
  const tune = request.clip.tuning_strength ?? 0;
  const timing = request.clip.timing_strength ?? 0;
  if (tune === 0 && timing === 0) {
    const source = request.context.createBufferSource();
    source.buffer = request.buffer;
    source.connect(nativeAudioInput(request.destination));
    const offset = (request.take.audio?.trim_start_s ?? 0) + request.clipElapsedSeconds;
    source.start(request.whenSeconds, offset, request.durationSeconds);
    return 1;
  }

  const destination = nativeAudioInput(request.destination);
  const trim = request.take.audio?.trim_start_s ?? 0;
  let grains = 0;
  for (
    let outputOffset = 0;
    outputOffset < request.durationSeconds;
    outputOffset += GRAIN_HOP_SECONDS
  ) {
    const outputDuration = Math.min(GRAIN_SECONDS, request.durationSeconds - outputOffset);
    const outputElapsed = request.clipElapsedSeconds + outputOffset;
    const sourceElapsed = sourceTimeAt(outputElapsed, request.take, request.clip, request.bpm);
    const cents = correctionCentsAt(sourceElapsed, request.take.pitch_track, request.keyName, tune);
    const rate = 2 ** (cents / 1200);
    const sourceOffset = trim + sourceElapsed;
    const sourceDuration = Math.min(
      outputDuration * rate,
      Math.max(0, request.buffer.duration - sourceOffset),
    );
    if (sourceDuration <= 0) continue;
    const actualOutputDuration = sourceDuration / rate;
    const when = request.whenSeconds + outputOffset;
    const source = request.context.createBufferSource();
    const envelope = request.context.createGain();
    source.buffer = request.buffer;
    source.playbackRate.value = rate;
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(1, when + actualOutputDuration / 2);
    envelope.gain.linearRampToValueAtTime(0, when + actualOutputDuration);
    source.connect(envelope);
    envelope.connect(destination);
    source.start(when, sourceOffset, sourceDuration);
    grains += 1;
  }
  return grains;
}

function sourceTimeAt(outputSeconds: number, take: Take, clip: AudioClip, bpm: number): number {
  const strength = clip.timing_strength ?? 0;
  const audio = take.audio;
  if (strength === 0 || clip.timing_grid === undefined || audio === undefined) {
    return outputSeconds;
  }
  const secondsPerBeat = 60 / bpm;
  const division = gridBeats(clip.timing_grid);
  const swing = clip.timing_swing ?? 0;
  const anchors = [
    { source: 0, target: 0 },
    ...take.notes.map((note) => {
      const rawBeat = note.s_raw ?? note.s;
      const relativeBeat = rawBeat - audio.start_beat;
      const absoluteBeat = clip.s + relativeBeat;
      const divisionIndex = Math.max(0, Math.round(absoluteBeat / division));
      const swingOffset = divisionIndex % 2 === 1 ? division * swing : 0;
      const snappedBeat = divisionIndex * division + swingOffset;
      const targetBeat = absoluteBeat + (snappedBeat - absoluteBeat) * strength;
      return {
        source: Math.max(0, relativeBeat * secondsPerBeat),
        target: Math.max(0, (targetBeat - clip.s) * secondsPerBeat),
      };
    }),
    { source: take.duration_s, target: take.duration_s },
  ]
    .filter((anchor) => anchor.source <= take.duration_s)
    .sort((left, right) => left.source - right.source)
    .reduce<{ source: number; target: number }[]>((ordered, anchor) => {
      const previous = ordered.at(-1);
      if (previous?.source === anchor.source) return ordered;
      const target =
        previous === undefined ? anchor.target : Math.max(previous.target + 0.001, anchor.target);
      ordered.push({ source: anchor.source, target: Math.min(take.duration_s, target) });
      return ordered;
    }, []);
  const after = anchors.findIndex(({ target }) => target >= outputSeconds);
  if (after < 0) return take.duration_s;
  if (after === 0) return Math.max(0, Math.min(take.duration_s, outputSeconds));
  const right = anchors[after];
  const left = anchors[after - 1];
  if (!left || !right || right.target <= left.target) return right?.source ?? outputSeconds;
  const progress = (outputSeconds - left.target) / (right.target - left.target);
  return left.source + (right.source - left.source) * progress;
}

function correctionCentsAt(
  seconds: number,
  frames: readonly PitchFrame[],
  keyName: string,
  strength: number,
): number {
  if (strength === 0) return 0;
  const voiced = frames.filter((frame) => frame.hz > 0 && frame.clarity >= 0.6);
  let frame = voiced[0];
  for (const candidate of voiced) {
    if (frame === undefined || Math.abs(candidate.t - seconds) < Math.abs(frame.t - seconds)) {
      frame = candidate;
    }
  }
  if (frame === undefined) return 0;
  const match = /^([A-G](?:#|b)?)\s+(major|minor)$/iu.exec(keyName.trim());
  const tonic = TonalNote.chroma(match?.[1] ?? '');
  const mode = match?.[2]?.toLowerCase() === 'minor' ? 'minor' : 'major';
  if (tonic < 0) return 0;
  const midi = 69 + 12 * Math.log2(frame.hz / 440);
  let target = Math.round(midi);
  let distance = Number.POSITIVE_INFINITY;
  for (let candidate = Math.floor(midi) - 3; candidate <= Math.ceil(midi) + 3; candidate += 1) {
    const pitchClass = (((candidate - tonic) % 12) + 12) % 12;
    if (!SCALE_INTERVALS[mode].has(pitchClass)) continue;
    const candidateDistance = Math.abs(candidate - midi);
    if (candidateDistance < distance) {
      target = candidate;
      distance = candidateDistance;
    }
  }
  return (target - midi) * 100 * strength;
}

function nativeAudioInput(value: unknown): AudioNode {
  let current = value;
  const seen = new Set<unknown>();
  while (
    typeof current === 'object' &&
    current !== null &&
    'input' in current &&
    !seen.has(current)
  ) {
    seen.add(current);
    const input = (current as { input?: unknown }).input;
    if (input === undefined || input === current) break;
    current = input;
  }
  return current as AudioNode;
}
