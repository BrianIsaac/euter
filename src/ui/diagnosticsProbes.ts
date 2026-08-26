/**
 * The browser probes behind the diagnostics panel's buttons (plan Day-one checks 1-3): a probe
 * `AudioContext` read before and after the first click, a one-second test tone, a microphone
 * level meter and a WebMIDI request. Plain functions over injected globals so they run in jsdom.
 */
import type { AudioReading } from '../webmcp/environment.ts';

/**
 * Names a thrown value as `Name: message`, working for DOMExceptions from any realm.
 *
 * @param error - The thrown value.
 * @returns The error name, with the message when there is one.
 */
export function describeError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const { name, message } = error as { name?: unknown; message?: unknown };
    const label = typeof name === 'string' && name !== '' ? name : 'UnknownError';
    return typeof message === 'string' && message !== '' ? `${label}: ${message}` : label;
  }
  return 'UnknownError';
}

/**
 * Reads the state of an audio context.
 *
 * @param context - The context.
 * @returns State, sample rate and latencies.
 */
export function readAudio(context: AudioContext): AudioReading {
  return {
    state: context.state,
    sampleRate: context.sampleRate,
    baseLatency: typeof context.baseLatency === 'number' ? context.baseLatency : null,
    outputLatency: typeof context.outputLatency === 'number' ? context.outputLatency : null,
  };
}

/**
 * Creates the probe context, expected `suspended` before any gesture (music §1.5).
 *
 * @param win - The window; defaults to the global.
 * @returns The context, or null where Web Audio is missing.
 */
export function createProbeContext(win: Window = window): AudioContext | null {
  const Ctor = (win as Window & { AudioContext?: typeof AudioContext }).AudioContext;
  if (typeof Ctor !== 'function') {
    return null;
  }
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/**
 * Resumes the context inside a click and plays a 440 Hz sine for one second.
 *
 * @param context - The probe context.
 * @param durationS - Tone length in seconds.
 * @returns The reading after `resume()`.
 */
export async function playTestTone(context: AudioContext, durationS = 1): Promise<AudioReading> {
  await context.resume();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = 440;
  gain.gain.value = 0.2;
  oscillator.connect(gain);
  gain.connect(context.destination);
  const start = context.currentTime;
  oscillator.start(start);
  oscillator.stop(start + durationS);
  return readAudio(context);
}

export type MicrophoneResult =
  { ok: true; label: string; stop: () => void } | { ok: false; error: string };

export interface MicrophoneDeps {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  context: AudioContext;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (handle: number) => void;
}

/**
 * Opens the microphone and drives a level meter from an analyser.
 *
 * @param deps - `getUserMedia`, the context, and the frame scheduler (defaults to rAF).
 * @param onLevel - Receives the RMS level 0-1 every frame.
 * @returns The track label and a stop function, or the error name.
 */
export async function testMicrophone(
  deps: MicrophoneDeps,
  onLevel: (level: number) => void,
): Promise<MicrophoneResult> {
  let stream: MediaStream;
  try {
    stream = await deps.getUserMedia({ audio: true });
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
  await deps.context.resume().catch(() => undefined);
  const source = deps.context.createMediaStreamSource(stream);
  const analyser = deps.context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const requestFrame = deps.requestFrame ?? ((callback) => requestAnimationFrame(callback));
  const cancelFrame = deps.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));
  const buffer = new Float32Array(analyser.fftSize);
  let handle = 0;
  let stopped = false;
  const tick = (): void => {
    if (stopped) {
      return;
    }
    analyser.getFloatTimeDomainData(buffer);
    onLevel(rms(buffer));
    handle = requestFrame(tick);
  };
  handle = requestFrame(tick);
  const label = stream.getAudioTracks()[0]?.label ?? 'microphone';
  return {
    ok: true,
    label,
    stop: () => {
      stopped = true;
      cancelFrame(handle);
      source.disconnect();
      for (const track of stream.getTracks()) {
        track.stop();
      }
    },
  };
}

/**
 * Root mean square of a PCM buffer.
 *
 * @param samples - Float samples in -1..1.
 * @returns The RMS, 0-1.
 */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

export type MidiResult =
  { ok: true; inputs: string[]; outputs: number; sysex: boolean } | { ok: false; error: string };

interface MidiNavigator {
  requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MIDIAccess>;
}

/**
 * Calls `requestMIDIAccess()` and lists the inputs (music §5).
 *
 * @param nav - The navigator; defaults to the global.
 * @returns Input names and output count, or the error name.
 */
export async function testMidi(nav: Navigator = navigator): Promise<MidiResult> {
  const request = (nav as Navigator & MidiNavigator).requestMIDIAccess;
  if (typeof request !== 'function') {
    return { ok: false, error: 'NotSupportedError: requestMIDIAccess is not defined' };
  }
  try {
    const access = await request.call(nav, { sysex: false });
    const inputs = [...access.inputs.values()].map((input) =>
      `${input.manufacturer ?? ''} ${input.name ?? 'input'}`.trim(),
    );
    return { ok: true, inputs, outputs: access.outputs.size, sysex: access.sysexEnabled };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
