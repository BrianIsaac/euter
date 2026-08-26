import { describe, expect, it, vi } from 'vitest';
import {
  createProbeContext,
  playTestTone,
  readAudio,
  rms,
  testMicrophone,
  testMidi,
} from '../../src/ui/diagnosticsProbes.ts';

function fakeAudioContext(state = 'suspended') {
  const oscillator = {
    type: '',
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const gain = { gain: { value: 0 }, connect: vi.fn() };
  const analyser = {
    fftSize: 0,
    getFloatTimeDomainData: vi.fn((buffer: Float32Array) => {
      buffer.fill(0.5);
    }),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    state,
    sampleRate: 48000,
    baseLatency: 0.005,
    outputLatency: 0.02,
    currentTime: 1,
    destination: {},
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    close: vi.fn(async () => undefined),
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
    createAnalyser: vi.fn(() => analyser),
    createMediaStreamSource: vi.fn(() => source),
  };
  return { context: context as unknown as AudioContext, oscillator, gain, analyser, source };
}

describe('diagnostics probes', () => {
  it('reads the context state and latencies', () => {
    const { context } = fakeAudioContext();
    expect(readAudio(context)).toEqual({
      state: 'suspended',
      sampleRate: 48000,
      baseLatency: 0.005,
      outputLatency: 0.02,
    });
  });

  it('returns null where AudioContext is missing and constructs it where present', () => {
    expect(createProbeContext({} as Window)).toBeNull();
    class Fake {
      state = 'suspended';
    }
    const created = createProbeContext({ AudioContext: Fake } as unknown as Window);
    expect(created).toBeInstanceOf(Fake);
    const Throwing = function () {
      throw new Error('no audio');
    };
    expect(createProbeContext({ AudioContext: Throwing } as unknown as Window)).toBeNull();
  });

  it('resumes and plays a one-second 440 Hz sine', async () => {
    const { context, oscillator, gain } = fakeAudioContext();
    const after = await playTestTone(context);
    expect(after.state).toBe('running');
    expect(oscillator.frequency.value).toBe(440);
    expect(oscillator.type).toBe('sine');
    expect(gain.gain.value).toBe(0.2);
    expect(oscillator.start).toHaveBeenCalledWith(1);
    expect(oscillator.stop).toHaveBeenCalledWith(2);
  });

  it('computes rms', () => {
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rms(new Float32Array())).toBe(0);
  });

  it('opens the microphone, drives the meter and stops cleanly', async () => {
    const { context, source } = fakeAudioContext();
    const track = { label: 'Built-in mic', stop: vi.fn() };
    const stream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
    const frames: (() => void)[] = [];
    const onLevel = vi.fn();
    const result = await testMicrophone(
      {
        getUserMedia: vi.fn(async () => stream),
        context,
        requestFrame: (callback) => {
          frames.push(callback);
          return frames.length;
        },
        cancelFrame: vi.fn(),
      },
      onLevel,
    );
    expect(result).toMatchObject({ ok: true, label: 'Built-in mic' });
    frames[0]?.();
    expect(onLevel).toHaveBeenCalledWith(0.5);
    if (result.ok) {
      result.stop();
    }
    expect(track.stop).toHaveBeenCalled();
    expect(source.disconnect).toHaveBeenCalled();
    const before = onLevel.mock.calls.length;
    frames.at(-1)?.();
    expect(onLevel.mock.calls.length).toBe(before);
  });

  it('reports the error name when the microphone is refused', async () => {
    const { context } = fakeAudioContext();
    const result = await testMicrophone(
      {
        getUserMedia: vi.fn(async () => {
          throw new DOMException('Permission denied', 'NotAllowedError');
        }),
        context,
      },
      vi.fn(),
    );
    expect(result).toEqual({ ok: false, error: 'NotAllowedError: Permission denied' });
  });

  it('lists MIDI inputs, reports refusal and reports absence', async () => {
    const access = {
      inputs: new Map([['a', { manufacturer: 'Korg', name: 'nanoKEY' }]]),
      outputs: new Map(),
      sysexEnabled: false,
    };
    const nav = { requestMIDIAccess: vi.fn(async () => access) } as unknown as Navigator;
    expect(await testMidi(nav)).toEqual({
      ok: true,
      inputs: ['Korg nanoKEY'],
      outputs: 0,
      sysex: false,
    });
    const refusing = {
      requestMIDIAccess: vi.fn(async () => {
        throw new DOMException('denied', 'SecurityError');
      }),
    } as unknown as Navigator;
    expect(await testMidi(refusing)).toEqual({ ok: false, error: 'SecurityError: denied' });
    expect(await testMidi({} as Navigator)).toMatchObject({
      ok: false,
      error: expect.stringContaining('NotSupportedError'),
    });
  });
});
