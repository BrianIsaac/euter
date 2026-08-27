/** One gesture-created AudioContext shared by recording, Tone and smplr (plan Decision 24). */
import { ToolError } from '../webmcp/envelope.ts';

export type AudioEngineState = 'uninitialised' | 'suspended' | 'running' | 'interrupted' | 'closed';

export interface AudioContextSnapshot {
  state: AudioEngineState;
  sample_rate: number | null;
  base_latency_s: number | null;
  output_latency_s: number | null;
}

export interface AudioContextManager {
  /** Call synchronously from the first Record, Play or keyboard click handler. */
  activateFromGesture(): Promise<AudioContext>;
  getContext(): AudioContext | null;
  getSnapshot(): AudioContextSnapshot;
  requireRunning(): AudioContext;
  subscribe(listener: () => void): () => void;
  close(): Promise<void>;
}

export interface AudioContextManagerOptions {
  createContext?: () => AudioContext;
  connectTone?: (context: AudioContext) => Promise<void>;
}

/** Creates the single-context owner. Construction itself creates no browser audio state. */
export function createAudioContextManager(
  options: AudioContextManagerOptions = {},
): AudioContextManager {
  const createContext = options.createContext ?? defaultCreateContext;
  const connectTone = options.connectTone ?? defaultConnectTone;
  let context: AudioContext | null = null;
  let activation: Promise<AudioContext> | null = null;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    activateFromGesture() {
      if (activation) return activation;
      context = createContext();
      notify();
      activation = (async () => {
        if (!context) throw new Error('Audio context construction failed.');
        await connectTone(context);
        if (context.state !== 'running') await context.resume();
        notify();
        return context;
      })();
      return activation;
    },
    getContext() {
      return context;
    },
    getSnapshot() {
      return snapshot(context);
    },
    requireRunning() {
      if (!context || context.state !== 'running') {
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
    async close() {
      if (!context || context.state === 'closed') return;
      await context.close();
      notify();
    },
  };
}

function defaultCreateContext(): AudioContext {
  const Constructor = globalThis.AudioContext;
  if (!Constructor) throw new Error('Web Audio is not available in this browser.');
  return new Constructor({ latencyHint: 'interactive' });
}

async function defaultConnectTone(context: AudioContext): Promise<void> {
  const tone = await import('tone');
  tone.setContext(new tone.Context(context));
}

function snapshot(context: AudioContext | null): AudioContextSnapshot {
  if (!context) {
    return {
      state: 'uninitialised',
      sample_rate: null,
      base_latency_s: null,
      output_latency_s: null,
    };
  }
  return {
    state: context.state,
    sample_rate: context.sampleRate,
    base_latency_s: context.baseLatency,
    output_latency_s: context.outputLatency,
  };
}
