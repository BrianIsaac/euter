import { describe, expect, it, vi } from 'vitest';
import { createAudioContextManager } from '../../src/audio/context.ts';
import { ToolError } from '../../src/webmcp/envelope.ts';

function fakeContext() {
  const context = {
    state: 'suspended',
    sampleRate: 48_000,
    baseLatency: 0.01,
    outputLatency: 0.02,
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    close: vi.fn(async () => {
      context.state = 'closed';
    }),
  };
  return context;
}

describe('audio context manager', () => {
  it('constructs exactly one context in the first gesture call', async () => {
    const context = fakeContext();
    const createContext = vi.fn(() => context as unknown as AudioContext);
    const connectTone = vi.fn(async () => undefined);
    const manager = createAudioContextManager({ createContext, connectTone });
    const listener = vi.fn();
    manager.subscribe(listener);

    expect(manager.getContext()).toBeNull();
    expect(manager.getSnapshot().state).toBe('uninitialised');
    const first = manager.activateFromGesture();
    const second = manager.activateFromGesture();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    await first;
    expect(connectTone).toHaveBeenCalledWith(context);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot()).toEqual({
      state: 'running',
      sample_rate: 48_000,
      base_latency_s: 0.01,
      output_latency_s: 0.02,
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('returns AUDIO_LOCKED until the context is running', async () => {
    const context = fakeContext();
    const manager = createAudioContextManager({
      createContext: () => context as unknown as AudioContext,
      connectTone: async () => undefined,
    });
    let thrown: unknown;
    try {
      manager.requireRunning();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ToolError);
    expect((thrown as ToolError).code).toBe('AUDIO_LOCKED');
    await manager.activateFromGesture();
    expect(manager.requireRunning()).toBe(context);
    await manager.close();
    expect(context.close).toHaveBeenCalledTimes(1);
  });
});
