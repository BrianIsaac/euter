import { describe, expect, it } from 'vitest';
import {
  PITCH_PROCESSOR_NAME,
  PITCH_WINDOW_SIZE,
  PitchFrameEngine,
  PitchWorkletProcessor,
} from '../../src/transcribe/pitch.worklet.ts';

function sine(hz: number, seconds: number, sampleRate: number): Float32Array {
  return Float32Array.from(
    { length: Math.round(seconds * sampleRate) },
    (_, index) => 0.5 * Math.sin((2 * Math.PI * hz * index) / sampleRate),
  );
}

describe('pitch worklet engine', () => {
  it('uses the named 2048-sample McLeod window', () => {
    expect(PITCH_PROCESSOR_NAME).toBe('euter-pitch');
    expect(PITCH_WINDOW_SIZE).toBe(2048);
  });

  it('emits a clear live line at about 20 Hz and accumulates the take PCM', () => {
    const sampleRate = 48_000;
    const pcm = sine(440, 1, sampleRate);
    const engine = new PitchFrameEngine(sampleRate);
    engine.start();
    const measurements = [];
    for (let start = 0; start < pcm.length; start += 128) {
      measurements.push(...engine.push(pcm.subarray(start, start + 128)));
    }
    const saved = engine.finish();

    expect(measurements.length).toBeGreaterThanOrEqual(19);
    expect(measurements.length).toBeLessThanOrEqual(20);
    expect(measurements.at(-1)?.hz).toBeCloseTo(440, 0);
    expect(measurements.at(-1)?.clarity).toBeGreaterThan(0.9);
    expect(measurements.at(-1)?.rms).toBeCloseTo(Math.SQRT1_2 / 2, 2);
    expect(saved).toEqual(pcm);
  });

  it('resets the accumulated PCM between takes', () => {
    const engine = new PitchFrameEngine(16_000);
    engine.push(new Float32Array([1, 2]));
    engine.start();
    engine.push(new Float32Array([3, 4, 5]));
    expect([...engine.finish()]).toEqual([3, 4, 5]);
    engine.reset();
    expect(engine.finish()).toHaveLength(0);
  });

  it('returns the AudioContext capture clock with the transferred PCM', () => {
    const processor = new PitchWorkletProcessor();
    const messages: unknown[] = [];
    processor.port.postMessage = (message) => messages.push(message);

    processor.port.onmessage?.({ data: { type: 'start' } } as MessageEvent);
    processor.process([[new Float32Array([0.1, 0.2])]]);
    processor.port.onmessage?.({ data: { type: 'stop' } } as MessageEvent);

    expect(messages.at(-1)).toMatchObject({
      type: 'take',
      sampleRate: 48_000,
      captureStartedAtContextTime: 0,
      pcm: new Float32Array([0.1, 0.2]),
    });
  });
});
