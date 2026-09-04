/** Live McLeod pitch tracking AudioWorklet (plan Decision 5; music §2.5). */
import { PitchDetector } from 'pitchy';

export const PITCH_PROCESSOR_NAME = 'euter-pitch';
export const PITCH_WINDOW_SIZE = 2048;

export interface LivePitchMeasurement {
  hz: number;
  clarity: number;
  rms: number;
}

type WorkletControl = { type: 'start' | 'stop' | 'reset' };

interface WorkletPort {
  onmessage: ((event: MessageEvent<WorkletControl>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

interface WorkletProcessorShape {
  readonly port: WorkletPort;
}

type WorkletProcessorConstructor = new () => WorkletProcessorShape;

const globalScope = globalThis as typeof globalThis & {
  AudioWorkletProcessor?: WorkletProcessorConstructor;
  registerProcessor?: (name: string, processor: WorkletProcessorConstructor) => void;
  sampleRate?: number;
  currentTime?: number;
};

const ProcessorBase: WorkletProcessorConstructor =
  globalScope.AudioWorkletProcessor ??
  class implements WorkletProcessorShape {
    readonly port: WorkletPort = { onmessage: null, postMessage: () => undefined };
  };

function calculateRms(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    sum += sample * sample;
  }
  return samples.length === 0 ? 0 : Math.sqrt(sum / samples.length);
}

/** Allocation-light ring-buffer engine, exported so the worklet DSP is unit-testable. */
export class PitchFrameEngine {
  readonly sampleRate: number;
  readonly #detector = PitchDetector.forFloat32Array(PITCH_WINDOW_SIZE);
  readonly #ring = new Float32Array(PITCH_WINDOW_SIZE);
  readonly #window = new Float32Array(PITCH_WINDOW_SIZE);
  readonly #postIntervalSamples: number;
  readonly #pcmChunks: Float32Array[] = [];
  #writeIndex = 0;
  #ringCount = 0;
  #samplesUntilPost: number;
  #capturing = true;

  constructor(sampleRate: number, postsPerSecond = 20) {
    this.sampleRate = sampleRate;
    this.#postIntervalSamples = Math.max(1, Math.round(sampleRate / postsPerSecond));
    this.#samplesUntilPost = this.#postIntervalSamples;
    this.#detector.clarityThreshold = 0.8;
    this.#detector.minVolumeAbsolute = 0.003;
  }

  start(): void {
    this.#pcmChunks.length = 0;
    this.#capturing = true;
  }

  reset(): void {
    this.#pcmChunks.length = 0;
    this.#writeIndex = 0;
    this.#ringCount = 0;
    this.#samplesUntilPost = this.#postIntervalSamples;
  }

  push(block: Float32Array): LivePitchMeasurement[] {
    if (this.#capturing) this.#pcmChunks.push(block.slice());
    for (let index = 0; index < block.length; index += 1) {
      this.#ring[this.#writeIndex] = block[index] ?? 0;
      this.#writeIndex = (this.#writeIndex + 1) % PITCH_WINDOW_SIZE;
      this.#ringCount = Math.min(PITCH_WINDOW_SIZE, this.#ringCount + 1);
    }

    this.#samplesUntilPost -= block.length;
    if (this.#samplesUntilPost > 0 || this.#ringCount < PITCH_WINDOW_SIZE) return [];
    while (this.#samplesUntilPost <= 0) this.#samplesUntilPost += this.#postIntervalSamples;

    for (let index = 0; index < PITCH_WINDOW_SIZE; index += 1) {
      this.#window[index] = this.#ring[(this.#writeIndex + index) % PITCH_WINDOW_SIZE] ?? 0;
    }
    const [hz, clarity] = this.#detector.findPitch(this.#window, this.sampleRate);
    return [{ hz, clarity, rms: calculateRms(this.#window) }];
  }

  finish(): Float32Array {
    this.#capturing = false;
    const length = this.#pcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const pcm = new Float32Array(length);
    let offset = 0;
    for (const chunk of this.#pcmChunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    return pcm;
  }
}

export class PitchWorkletProcessor extends ProcessorBase {
  readonly #engine = new PitchFrameEngine(globalScope.sampleRate ?? 48_000);
  #captureStartedAtContextTime = 0;

  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      if (data.type === 'start') {
        this.#captureStartedAtContextTime = globalScope.currentTime ?? 0;
        this.#engine.start();
      }
      if (data.type === 'reset') this.#engine.reset();
      if (data.type === 'stop') {
        const pcm = this.#engine.finish();
        this.port.postMessage(
          {
            type: 'take',
            pcm,
            sampleRate: this.#engine.sampleRate,
            captureStartedAtContextTime: this.#captureStartedAtContextTime,
          },
          [pcm.buffer],
        );
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (input !== undefined) {
      for (const measurement of this.#engine.push(input)) this.port.postMessage(measurement);
    }
    return true;
  }
}

globalScope.registerProcessor?.(PITCH_PROCESSOR_NAME, PitchWorkletProcessor);
