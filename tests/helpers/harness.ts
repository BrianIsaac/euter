/**
 * The shared engine harness: fake audio, transport, metronome, recorder, reconciler and exporters
 * so tool and shell tests exercise the real store, registry and envelope without Web Audio.
 */
import { vi } from 'vitest';
import type { AudioContextManager, AudioContextSnapshot } from '../../src/audio/context.ts';
import type { AudioReconciler } from '../../src/audio/reconciler.ts';
import type { Metronome } from '../../src/audio/metronome.ts';
import type { PlayOptions, SongTransport, TransportSnapshot } from '../../src/audio/transport.ts';
import type { RecordedTake, RecorderSnapshot } from '../../src/input/recorder.ts';
import { loadExampleSong } from '../../src/song/serialise.ts';
import type { Note, SongDocument, Take } from '../../src/song/types.ts';
import {
  createEngine,
  type Engine,
  type EngineOptions,
  type RecorderPort,
} from '../../src/webmcp/engine.ts';
import { ToolError } from '../../src/webmcp/envelope.ts';
import { createRuntime, type Runtime, type RuntimeOptions } from '../../src/webmcp/runtime.ts';
import { createFakeContext } from './fakeContext.ts';

export interface FakeAudio extends AudioContextManager {
  setState(state: AudioContextSnapshot['state']): void;
  activations: number;
}

/**
 * Creates an audio manager with no Web Audio behind it.
 *
 * @param state - The state to report; `uninitialised` makes `requireRunning` throw AUDIO_LOCKED.
 * @returns The fake.
 */
export function fakeAudio(state: AudioContextSnapshot['state'] = 'running'): FakeAudio {
  let current = state;
  let activations = 0;
  const listeners = new Set<() => void>();
  const context = {
    currentTime: 0,
    sampleRate: 48_000,
    state: 'running',
    decodeAudioData: vi.fn(),
  } as unknown as AudioContext;
  return {
    activateFromGesture() {
      activations += 1;
      current = 'running';
      for (const listener of listeners) listener();
      return Promise.resolve(context);
    },
    getContext: () => (current === 'uninitialised' ? null : context),
    getSnapshot: () => ({
      state: current,
      sample_rate: 48_000,
      base_latency_s: 0.01,
      output_latency_s: 0.02,
    }),
    requireRunning() {
      if (current !== 'running') {
        throw new ToolError(
          'AUDIO_LOCKED',
          'Audio is locked. Ask the person to press Play, Record or a key once.',
          true,
        );
      }
      return context;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => Promise.resolve(),
    setState(next) {
      current = next;
      for (const listener of listeners) listener();
    },
    get activations() {
      return activations;
    },
  };
}

export interface FakeTransport extends SongTransport {
  readonly calls: { play: PlayOptions[]; stop: number };
}

/**
 * Creates a transport that records its calls and never touches Tone.
 *
 * @param audio - The audio manager whose lock it honours.
 * @returns The fake.
 */
export function fakeTransport(audio: AudioContextManager): FakeTransport {
  const calls = { play: [] as PlayOptions[], stop: 0 };
  let snapshot: TransportSnapshot = { playing: false, position_bar: 1, loop: null, bpm: 90 };
  return {
    play(song: SongDocument, options: PlayOptions = {}) {
      audio.requireRunning();
      if ((options.from_bar ?? 1) > song.bars) {
        throw new ToolError('OUT_OF_RANGE', `Choose a bar from 1 to ${song.bars}.`, true);
      }
      calls.play.push(options);
      snapshot = {
        playing: true,
        position_bar: options.from_bar ?? 1,
        loop: options.loop ? { ...options.loop } : null,
        bpm: song.bpm,
      };
      return Promise.resolve(snapshot);
    },
    stop() {
      calls.stop += 1;
      snapshot = { ...snapshot, playing: false };
      return Promise.resolve(snapshot);
    },
    syncTempo() {
      return Promise.resolve();
    },
    getSnapshot: () => snapshot,
    get calls() {
      return calls;
    },
  };
}

export interface FakeRecorder extends RecorderPort {
  /** The take `stop` resolves with. */
  nextTake: Take | null;
  failStart: RecorderSnapshot | null;
}

/**
 * Creates a recorder whose state machine is observable without a microphone.
 *
 * @param take - The take `stop()` returns.
 * @returns The fake.
 */
export function fakeRecorder(take: Take | null = null): FakeRecorder {
  const listeners = new Set<() => void>();
  const initialSnapshot: RecorderSnapshot = {
    status: 'idle',
    live: null,
    targetBars: null,
    trackId: null,
    prompt: null,
    error: null,
  };
  let snapshot: RecorderSnapshot = initialSnapshot;
  const publish = (next: RecorderSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const fake: FakeRecorder = {
    nextTake: take,
    failStart: null,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start(options) {
      if (fake.failStart) {
        publish(fake.failStart);
        return Promise.resolve({
          ok: false as const,
          code: 'MIC_DENIED' as const,
          message: 'Microphone access was not granted.',
          recoverable: true,
        });
      }
      publish({
        status: 'recording',
        live: null,
        targetBars: options.targetBars ?? null,
        trackId: options.trackId ?? null,
        prompt: options.prompt ?? null,
        error: null,
      });
      return Promise.resolve({ ok: true as const, data: snapshot });
    },
    stop() {
      if (snapshot.status !== 'recording') {
        return Promise.resolve({
          ok: false as const,
          code: 'NOT_RECORDING' as const,
          message: 'No take is currently recording.',
          recoverable: true,
        });
      }
      const trackId = snapshot.trackId;
      const targetBars = snapshot.targetBars;
      publish({
        status: 'idle',
        live: null,
        targetBars: null,
        trackId: null,
        prompt: null,
        error: null,
      });
      if (!fake.nextTake) {
        return Promise.resolve({
          ok: false as const,
          code: 'CAPTURE_FAILED' as const,
          message: 'The recorded audio did not arrive from the worklet.',
          recoverable: true,
        });
      }
      const recorded: RecordedTake = {
        take: fake.nextTake,
        wav: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' }),
        trackId,
        targetBars,
      };
      return Promise.resolve({ ok: true as const, data: recorded });
    },
    dispose() {
      publish(initialSnapshot);
      listeners.clear();
    },
  };
  return fake;
}

/**
 * Creates a take with sung notes in the first bars.
 *
 * @param id - The take id.
 * @param notes - Notes in absolute beats; defaults to four crotchets.
 * @returns The take.
 */
export function makeTake(id = 'take-1', notes?: Note[]): Take {
  const takeNotes: Note[] =
    notes ??
    [60, 62, 64, 65].map((p, index) => ({
      p,
      s: index,
      d: 0.9,
      v: 0.8,
      s_raw: index + 0.06,
      d_raw: 0.9,
      source: 'take' as const,
    }));
  return {
    id,
    source: 'mic',
    notes: takeNotes,
    pitch_track: [{ t: 0, hz: 261.6, clarity: 0.9 }],
    duration_s: 4,
    voiced_ratio: 0.8,
    median_clarity: 0.82,
    pitch_range: [60, 65],
    tempo_hint: 92,
  };
}

/** A metronome that completes its count-in immediately. */
export function fakeMetronome(): Metronome {
  return {
    scheduleCountIn(options) {
      options.onComplete?.();
      return Promise.resolve({ duration_s: 2, cancel: () => undefined });
    },
    stop: () => undefined,
    dispose: () => undefined,
  };
}

/** A reconciler that records how often the graph was asked to catch up. */
export function fakeReconciler(): AudioReconciler & { reconciles: number } {
  let reconciles = 0;
  return {
    ready: () => Promise.resolve(),
    reconcile() {
      reconciles += 1;
    },
    getSnapshot: () => ({ ready: true, nodes: [], parts: {}, loading: {}, fallbacks: {} }),
    subscribe: () => () => undefined,
    dispose: () => undefined,
    get reconciles() {
      return reconciles;
    },
  };
}

/**
 * Creates an AudioBuffer-shaped object the loudness and encoder seams accept.
 *
 * @param seconds - Buffer length.
 * @returns The fake buffer.
 */
export function fakeAudioBuffer(seconds = 1): AudioBuffer {
  const sampleRate = 44_100;
  const length = Math.round(seconds * sampleRate);
  const channels = [new Float32Array(length).fill(0.25), new Float32Array(length).fill(0.25)];
  return {
    duration: seconds,
    length,
    numberOfChannels: channels.length,
    sampleRate,
    getChannelData: (channel: number) => channels[channel] ?? channels[0],
  } as unknown as AudioBuffer;
}

export interface TestEngineOptions extends EngineOptions {
  audio?: FakeAudio;
  transport?: FakeTransport;
  recorder?: FakeRecorder;
}

/**
 * Creates an engine wired to the fakes above.
 *
 * @param options - Overrides; `document` defaults to the example song.
 * @returns The engine and the fakes it uses.
 */
export function createTestEngine(options: TestEngineOptions = {}): {
  engine: Engine;
  audio: FakeAudio;
  transport: FakeTransport;
  recorder: FakeRecorder;
} {
  const audio = options.audio ?? fakeAudio();
  const transport = options.transport ?? fakeTransport(audio);
  const recorder = options.recorder ?? fakeRecorder(makeTake());
  let urls = 0;
  const counts = new Map<string, number>();
  const makeId = (prefix: string): string => {
    const next = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, next);
    return `${prefix}-${next}`;
  };
  const engine = createEngine({
    document: options.document ?? loadExampleSong(),
    storage: null,
    audio,
    transport,
    recorder,
    metronome: fakeMetronome(),
    keyboardInstrument: null,
    createReconciler: fakeReconciler,
    createObjectUrl: () => `blob:euter/${(urls += 1)}`,
    revokeObjectUrl: () => undefined,
    makeId,
    delay: () => Promise.resolve(),
    exporters: {
      render: () => Promise.resolve(fakeAudioBuffer()),
      wav: () => new Uint8Array([82, 73, 70, 70]),
      mp3: () => Promise.resolve(new Uint8Array([255, 251])),
      midi: () => new Uint8Array([77, 84, 104, 100]),
    },
    ...options,
  });
  return { engine, audio, transport, recorder };
}

export interface Harness {
  runtime: Runtime;
  engine: Engine;
  audio: FakeAudio;
  transport: FakeTransport;
  recorder: FakeRecorder;
  invoke(name: string, input?: unknown, signal?: AbortSignal): Promise<unknown>;
}

/**
 * Creates a runtime over the test engine with a fake model context.
 *
 * @param options - Engine and runtime overrides.
 * @returns The harness.
 */
export function createHarness(
  options: { engine?: TestEngineOptions; runtime?: RuntimeOptions } = {},
): Harness {
  const built = createTestEngine(options.engine ?? {});
  const runtime = createRuntime({
    engine: built.engine,
    contexts: () => [createFakeContext()],
    ...options.runtime,
  });
  return {
    runtime,
    engine: built.engine,
    audio: built.audio,
    transport: built.transport,
    recorder: built.recorder,
    invoke: (name, input, signal) => runtime.registry.invoke(name, input ?? {}, signal),
  };
}
