/** Microphone recorder and WAV handoff (plan Decisions 10 and 24; Architecture item 5). */
import pitchWorkletUrl from '../transcribe/pitch.worklet.ts?worker&url';
import { encodeTakeAudio } from '../audio/clips.ts';
import type { Take } from '../song/types.ts';
import type { LivePitchMeasurement } from '../transcribe/pitch.worklet.ts';
import { transcribePcmToTake } from '../transcribe/takes.ts';
import type { RecorderAudioContext, TransportPort } from './transportPort.ts';

export type RecorderErrorCode =
  'AUDIO_LOCKED' | 'MIC_DENIED' | 'RECORDER_BUSY' | 'NOT_RECORDING' | 'CAPTURE_FAILED';

export interface RecorderFailure {
  ok: false;
  code: RecorderErrorCode;
  message: string;
  recoverable: boolean;
}

export interface RecorderSuccess<T> {
  ok: true;
  data: T;
}

export type RecorderResult<T> = RecorderSuccess<T> | RecorderFailure;

export interface BarRange {
  barFrom: number;
  barTo: number;
}

export interface StartRecordingOptions {
  trackId?: string;
  targetBars?: BarRange;
  prompt?: string;
  countInBars: 1 | 2;
  metronome: boolean;
  /** Routes the microphone to the output; headphones are required to avoid feedback. */
  monitorInput?: boolean;
}

export interface RecordedTake {
  take: Take;
  wav: Blob;
  trackId: string | null;
  targetBars: BarRange | null;
}

export interface RecorderSnapshot {
  status: 'idle' | 'requesting-mic' | 'counting-in' | 'recording' | 'transcribing' | 'error';
  live: LivePitchMeasurement | null;
  targetBars: BarRange | null;
  trackId: string | null;
  prompt: string | null;
  monitoring: RecorderMonitoring | null;
  error: RecorderFailure | null;
}

export interface RecorderMonitoring {
  backing: 'arrangement' | 'click';
  input: boolean;
  input_latency_s: number;
  base_latency_s: number;
  output_latency_s: number;
}

interface WorkletTakeMessage {
  type: 'take';
  pcm: Float32Array;
  sampleRate: number;
  captureStartedAtContextTime: number;
}

interface WorkletPort {
  onmessage: ((event: MessageEvent<LivePitchMeasurement | WorkletTakeMessage>) => void) | null;
  postMessage(message: unknown): void;
}

interface CaptureGraph {
  readonly port: WorkletPort;
  disconnect(): void;
}

export interface RecorderDependencies {
  getUserMedia?: () => Promise<MediaStream>;
  connectWorklet?: (
    context: RecorderAudioContext,
    stream: MediaStream,
    monitorInput: boolean,
  ) => CaptureGraph;
  makeTakeId?: () => string;
  captureTimeoutMs?: number;
}

interface ActiveCapture {
  stream: MediaStream;
  graph: CaptureGraph;
  pcm: Promise<WorkletTakeMessage>;
  options: StartRecordingOptions;
  inputLatencySeconds: number;
  baseLatencySeconds: number;
  outputLatencySeconds: number;
  recordingStartContextTime: number | null;
  countInController: AbortController;
  finishBacking: (() => void) | null;
}

const INITIAL_SNAPSHOT: RecorderSnapshot = {
  status: 'idle',
  live: null,
  targetBars: null,
  trackId: null,
  prompt: null,
  monitoring: null,
  error: null,
};

function failure(code: RecorderErrorCode, message: string, recoverable = true): RecorderFailure {
  return { ok: false, code, message, recoverable };
}

function defaultGetUserMedia(): Promise<MediaStream> {
  const audio: MediaTrackConstraints & { latency: { ideal: number } } = {
    channelCount: { ideal: 1 },
    latency: { ideal: 0 },
  };
  return navigator.mediaDevices.getUserMedia({
    audio,
  });
}

function defaultConnectWorklet(
  contextPort: RecorderAudioContext,
  stream: MediaStream,
  monitorInput = false,
): CaptureGraph {
  const context = contextPort as AudioContext;
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'euter-pitch', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
  });
  source.connect(node);
  if (monitorInput) source.connect(context.destination);
  return {
    port: node.port,
    disconnect() {
      source.disconnect();
      node.disconnect();
    },
  };
}

function reportedInputLatency(stream: MediaStream): number | null {
  const settings = stream.getAudioTracks()[0]?.getSettings() as
    (MediaTrackSettings & { latency?: number }) | undefined;
  const latency = settings?.latency;
  return typeof latency === 'number' && Number.isFinite(latency) && latency >= 0 ? latency : null;
}

function isWorkletTake(
  value: LivePitchMeasurement | WorkletTakeMessage,
): value is WorkletTakeMessage {
  return 'type' in value && value.type === 'take';
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/** Encodes mono float PCM into a small, widely-decodable PCM16 WAV blob. */
export function encodePcm16Wav(pcm: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for (let index = 0; index < pcm.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, pcm[index] ?? 0));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 32_768 : sample * 32_767, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Owns permission, count-in, worklet capture, transcription and cleanup as one state machine. */
export class RecorderController {
  readonly transport: TransportPort;
  readonly #listeners = new Set<() => void>();
  readonly #getUserMedia: () => Promise<MediaStream>;
  readonly #connectWorklet: NonNullable<RecorderDependencies['connectWorklet']>;
  readonly #makeTakeId: () => string;
  readonly #captureTimeoutMs: number;
  #snapshot = INITIAL_SNAPSHOT;
  #active: ActiveCapture | null = null;

  constructor(transport: TransportPort, dependencies: RecorderDependencies = {}) {
    this.transport = transport;
    this.#getUserMedia = dependencies.getUserMedia ?? defaultGetUserMedia;
    this.#connectWorklet = dependencies.connectWorklet ?? defaultConnectWorklet;
    this.#makeTakeId = dependencies.makeTakeId ?? (() => crypto.randomUUID());
    this.#captureTimeoutMs = dependencies.captureTimeoutMs ?? 5_000;
  }

  readonly getSnapshot = (): RecorderSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #publish(next: RecorderSnapshot): void {
    this.#snapshot = next;
    for (const listener of this.#listeners) listener();
  }

  #publishFailure(value: RecorderFailure): void {
    this.#publish({ ...this.#snapshot, status: 'error', error: value });
  }

  async start(options: StartRecordingOptions): Promise<RecorderResult<RecorderSnapshot>> {
    if (this.#active !== null) {
      return failure(
        'RECORDER_BUSY',
        'A take is already being recorded. Stop it before starting another.',
      );
    }
    const context = this.transport.getAudioContext();
    if (context === null || context.state !== 'running') {
      const locked = failure(
        'AUDIO_LOCKED',
        'Press Record, Play or a key in the app once to unlock audio, then try again.',
      );
      this.#publishFailure(locked);
      return locked;
    }

    this.#publish({
      status: 'requesting-mic',
      live: null,
      targetBars: options.targetBars ?? null,
      trackId: options.trackId ?? null,
      prompt: options.prompt ?? null,
      monitoring: null,
      error: null,
    });
    let stream: MediaStream;
    try {
      stream = await this.#getUserMedia();
    } catch {
      const denied = failure(
        'MIC_DENIED',
        'Microphone access was not granted. Choose Import or Keyboard, or allow the microphone and retry.',
      );
      this.#publishFailure(denied);
      return denied;
    }

    const inputLatencySeconds = reportedInputLatency(stream);
    if (inputLatencySeconds === null) {
      stopStream(stream);
      const unavailable = failure(
        'CAPTURE_FAILED',
        'This browser did not report microphone latency, so Euterpe cannot align the take honestly. Import a voice memo or use a browser and device that report audio latency.',
      );
      this.#publishFailure(unavailable);
      return unavailable;
    }

    let capture: ActiveCapture | null = null;
    try {
      await context.audioWorklet.addModule(pitchWorkletUrl);
      const graph = this.#connectWorklet(context, stream, options.monitorInput ?? false);
      let resolvePcm: (message: WorkletTakeMessage) => void = () => undefined;
      const pcm = new Promise<WorkletTakeMessage>((resolve) => {
        resolvePcm = resolve;
      });
      graph.port.onmessage = ({ data }) => {
        if (isWorkletTake(data)) {
          resolvePcm(data);
        } else {
          this.#publish({ ...this.#snapshot, live: data });
        }
      };
      graph.port.postMessage({ type: 'start' });
      capture = {
        stream,
        graph,
        pcm,
        options,
        inputLatencySeconds,
        baseLatencySeconds: context.baseLatency,
        outputLatencySeconds: context.outputLatency,
        recordingStartContextTime: null,
        countInController: new AbortController(),
        finishBacking: null,
      };
      this.#active = capture;
      this.#publish({
        ...this.#snapshot,
        status: 'counting-in',
        monitoring: {
          backing: options.targetBars === undefined ? 'click' : 'arrangement',
          input: options.monitorInput ?? false,
          input_latency_s: inputLatencySeconds,
          base_latency_s: context.baseLatency,
          output_latency_s: context.outputLatency,
        },
      });
      const countInOptions = {
        bars: options.countInBars,
        metronome: options.metronome,
        ...(options.targetBars === undefined ? {} : { targetBar: options.targetBars.barFrom }),
        ...(options.trackId === undefined ? {} : { mutedTrackId: options.trackId }),
        signal: capture.countInController.signal,
      };
      const countIn = await this.transport.countIn(countInOptions);
      if (this.#active !== capture) {
        countIn.finish?.();
        return failure('CAPTURE_FAILED', 'The take ended during the count-in.');
      }
      capture.recordingStartContextTime = countIn.recordingStartContextTime;
      capture.baseLatencySeconds = context.baseLatency;
      capture.outputLatencySeconds = context.outputLatency;
      capture.finishBacking = countIn.finish ?? null;
      this.#publish({
        ...this.#snapshot,
        status: 'recording',
        monitoring: {
          backing: options.targetBars === undefined ? 'click' : 'arrangement',
          input: options.monitorInput ?? false,
          input_latency_s: inputLatencySeconds,
          base_latency_s: capture.baseLatencySeconds,
          output_latency_s: capture.outputLatencySeconds,
        },
      });
      return { ok: true, data: this.#snapshot };
    } catch {
      const interrupted = capture !== null && this.#active !== capture;
      if (capture !== null && this.#active === capture) {
        this.#cleanup(capture);
      } else if (capture === null) {
        stopStream(stream);
      }
      if (interrupted) {
        return failure('CAPTURE_FAILED', 'The take ended during the count-in.');
      }
      const failed = failure('CAPTURE_FAILED', 'The microphone capture graph could not start.');
      this.#publishFailure(failed);
      return failed;
    }
  }

  async stop(): Promise<RecorderResult<RecordedTake>> {
    const active = this.#active;
    if (active === null) return failure('NOT_RECORDING', 'No take is currently recording.');
    this.#publish({ ...this.#snapshot, status: 'transcribing' });
    this.#finishCountIn(active);
    active.graph.port.postMessage({ type: 'stop' });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let failureMessage =
      'The recorded audio did not arrive from the worklet. The take was not committed.';
    try {
      const message = await Promise.race([
        active.pcm,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('capture timeout')), this.#captureTimeoutMs);
        }),
      ]);
      const bpm = this.transport.getBpm();
      const beatsPerBar = this.transport.getTimeSignature()[0];
      const startBeat = active.options.targetBars
        ? (active.options.targetBars.barFrom - 1) * beatsPerBar
        : 0;
      if (
        active.recordingStartContextTime === null ||
        !Number.isFinite(message.captureStartedAtContextTime)
      ) {
        failureMessage =
          'The shared audio clock did not report the take boundary. The take was not committed.';
        throw new Error('capture clock unavailable');
      }
      const captureOffsetSeconds =
        active.recordingStartContextTime - message.captureStartedAtContextTime;
      if (!Number.isFinite(captureOffsetSeconds) || captureOffsetSeconds < 0) {
        failureMessage =
          'The capture and arrangement clocks could not be aligned. The take was not committed.';
        throw new Error('capture clock is not monotonic');
      }
      const trimStartSeconds =
        captureOffsetSeconds +
        active.inputLatencySeconds +
        active.baseLatencySeconds +
        active.outputLatencySeconds;
      const take = transcribePcmToTake(message.pcm, message.sampleRate, {
        id: this.#makeTakeId(),
        source: 'mic',
        bpm,
        inputLatency: active.inputLatencySeconds,
        baseLatency: active.baseLatencySeconds,
        outputLatency: active.outputLatencySeconds,
        captureOffsetSeconds,
        startBeat,
      });
      take.audio = encodeTakeAudio(message.pcm, message.sampleRate, trimStartSeconds, startBeat, {
        method: 'worklet-clock-and-browser-latency',
        capture_offset_s: captureOffsetSeconds,
        input_latency_s: active.inputLatencySeconds,
        base_latency_s: active.baseLatencySeconds,
        output_latency_s: active.outputLatencySeconds,
        compensation_s: trimStartSeconds,
      });
      const result: RecordedTake = {
        take,
        wav: encodePcm16Wav(message.pcm, message.sampleRate),
        trackId: active.options.trackId ?? null,
        targetBars: active.options.targetBars ?? null,
      };
      this.#cleanup(active);
      this.#publish(INITIAL_SNAPSHOT);
      return { ok: true, data: result };
    } catch {
      const failed = failure('CAPTURE_FAILED', failureMessage);
      this.#cleanup(active);
      this.#publishFailure(failed);
      return failed;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  dispose(): void {
    if (this.#active) {
      this.#active.graph.port.onmessage = null;
      this.#cleanup(this.#active);
    }
    this.#snapshot = INITIAL_SNAPSHOT;
    this.#listeners.clear();
  }

  #cleanup(active: ActiveCapture): void {
    if (this.#active !== active) return;
    this.#finishCountIn(active);
    active.graph.disconnect();
    stopStream(active.stream);
    this.#active = null;
  }

  #finishCountIn(active: ActiveCapture): void {
    active.countInController.abort(new DOMException('Take stopped.', 'AbortError'));
    const finish = active.finishBacking;
    active.finishBacking = null;
    finish?.();
  }
}
