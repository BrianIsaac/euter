import { describe, expect, it, vi } from 'vitest';
import {
  RecorderController,
  encodePcm16Wav,
  type RecorderDependencies,
} from '../../src/input/recorder.ts';
import type { RecorderAudioContext, TransportPort } from '../../src/input/transportPort.ts';

function sine(hz: number, seconds: number, sampleRate: number): Float32Array {
  return Float32Array.from(
    { length: Math.round(seconds * sampleRate) },
    (_, index) => 0.25 * Math.sin((2 * Math.PI * hz * index) / sampleRate),
  );
}

function harness(contextState: AudioContextState = 'running') {
  const addModule = vi.fn(async () => undefined);
  const context: RecorderAudioContext = {
    state: contextState,
    sampleRate: 16_000,
    baseLatency: 0.01,
    outputLatency: 0.01,
    audioWorklet: { addModule },
  };
  const countIn = vi.fn<TransportPort['countIn']>(async () => ({ durationSeconds: 0.5 }));
  const transport: TransportPort = {
    getAudioContext: () => context,
    getBpm: () => 120,
    getTimeSignature: () => [4, 4],
    getPositionSeconds: () => 0,
    countIn,
  };
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  const disconnect = vi.fn();
  const port: {
    onmessage: ((event: MessageEvent) => void) | null;
    postMessage(message: unknown): void;
  } = {
    onmessage: null,
    postMessage: vi.fn((message: unknown) => {
      if ((message as { type?: string }).type === 'stop') {
        const pcm = sine(261.63, 1.3, 16_000);
        port.onmessage?.({ data: { type: 'take', pcm, sampleRate: 16_000 } } as MessageEvent);
      }
    }),
  };
  const dependencies: RecorderDependencies = {
    getUserMedia: vi.fn(async () => stream),
    connectWorklet: vi.fn(() => ({ port, disconnect })),
    makeTakeId: () => 'take-mic-1',
    captureTimeoutMs: 50,
  };
  return {
    context,
    addModule,
    countIn,
    transport,
    stream,
    stopTrack,
    port,
    disconnect,
    dependencies,
  };
}

describe('RecorderController', () => {
  it('returns AUDIO_LOCKED as data before asking for the microphone', async () => {
    const test = harness('suspended');
    const recorder = new RecorderController(test.transport, test.dependencies);
    await expect(recorder.start({ countInBars: 1, metronome: true })).resolves.toMatchObject({
      ok: false,
      code: 'AUDIO_LOCKED',
      recoverable: true,
    });
    expect(test.dependencies.getUserMedia).not.toHaveBeenCalled();
    expect(recorder.getSnapshot().status).toBe('error');
  });

  it('returns MIC_DENIED as data and suggests the other first-class inputs', async () => {
    const test = harness();
    test.dependencies.getUserMedia = vi.fn(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    const recorder = new RecorderController(test.transport, test.dependencies);
    const result = await recorder.start({ countInBars: 1, metronome: true });
    expect(result).toMatchObject({ ok: false, code: 'MIC_DENIED' });
    if (!result.ok) expect(result.message).toContain('Import or Keyboard');
  });

  it('returns MIC_DENIED when mediaDevices is absent', async () => {
    const test = harness();
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    try {
      const recorder = new RecorderController(test.transport);
      await expect(recorder.start({ countInBars: 1, metronome: true })).resolves.toMatchObject({
        ok: false,
        code: 'MIC_DENIED',
      });
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'mediaDevices', descriptor);
      else Reflect.deleteProperty(navigator, 'mediaDevices');
    }
  });

  it('stops the microphone stream when the worklet module cannot load', async () => {
    const test = harness();
    test.addModule.mockRejectedValueOnce(new DOMException('missing', 'AbortError'));
    const recorder = new RecorderController(test.transport, test.dependencies);

    await expect(recorder.start({ countInBars: 1, metronome: true })).resolves.toMatchObject({
      ok: false,
      code: 'CAPTURE_FAILED',
    });
    expect(test.dependencies.connectWorklet).not.toHaveBeenCalled();
    expect(test.stopTrack).toHaveBeenCalledOnce();
  });

  it('runs count-in, publishes the live line, transcribes target bars and saves a WAV', async () => {
    const test = harness();
    const recorder = new RecorderController(test.transport, test.dependencies);
    const snapshots: string[] = [];
    recorder.subscribe(() => snapshots.push(recorder.getSnapshot().status));
    const started = await recorder.start({
      trackId: 'bass',
      targetBars: { barFrom: 3, barTo: 4 },
      prompt: 'Hum a bassline for the chorus',
      countInBars: 1,
      metronome: true,
    });
    expect(started).toMatchObject({ ok: true });
    test.port.onmessage?.({ data: { hz: 261.63, clarity: 0.94, rms: 0.2 } } as MessageEvent);
    expect(recorder.getSnapshot().live?.hz).toBeCloseTo(261.63);

    const stopped = await recorder.stop();
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    expect(stopped.data.take.id).toBe('take-mic-1');
    expect(stopped.data.take.source).toBe('mic');
    expect(stopped.data.take.notes[0]).toMatchObject({ p: 60, source: 'take' });
    expect(stopped.data.take.notes[0]?.s).toBeGreaterThanOrEqual(8);
    expect(stopped.data.trackId).toBe('bass');
    expect(stopped.data.targetBars).toEqual({ barFrom: 3, barTo: 4 });
    expect(stopped.data.wav.type).toBe('audio/wav');
    const header = new TextDecoder().decode((await stopped.data.wav.arrayBuffer()).slice(0, 4));
    expect(header).toBe('RIFF');
    expect(test.countIn).toHaveBeenCalledWith({
      bars: 1,
      metronome: true,
      targetBar: 3,
      mutedTrackId: 'bass',
      signal: expect.any(AbortSignal),
    });
    expect(test.addModule).toHaveBeenCalledTimes(1);
    expect(test.disconnect).toHaveBeenCalledOnce();
    expect(test.stopTrack).toHaveBeenCalledOnce();
    expect(snapshots).toEqual(
      expect.arrayContaining(['requesting-mic', 'counting-in', 'recording', 'transcribing']),
    );
  });

  it('finishes the arranged backing when the take is cleaned up', async () => {
    const test = harness();
    const finish = vi.fn();
    test.countIn.mockResolvedValueOnce({ durationSeconds: 0.5, finish });
    const recorder = new RecorderController(test.transport, test.dependencies);
    await recorder.start({
      trackId: 'bass',
      targetBars: { barFrom: 5, barTo: 8 },
      countInBars: 1,
      metronome: true,
    });

    await recorder.stop();

    expect(finish).toHaveBeenCalledOnce();
  });

  it('stops backing before waiting for the worklet to finish a take', async () => {
    const test = harness();
    const finish = vi.fn();
    test.countIn.mockResolvedValueOnce({ durationSeconds: 0.5, finish });
    vi.mocked(test.port.postMessage).mockImplementation(() => undefined);
    const recorder = new RecorderController(test.transport, test.dependencies);
    await recorder.start({
      trackId: 'bass',
      targetBars: { barFrom: 5, barTo: 8 },
      countInBars: 1,
      metronome: true,
    });

    const stopping = recorder.stop();

    expect(finish).toHaveBeenCalledOnce();
    await expect(stopping).resolves.toMatchObject({ ok: false, code: 'CAPTURE_FAILED' });
    expect(finish).toHaveBeenCalledOnce();
  });

  it('aborts the arranged count-in immediately when disposed before recording begins', async () => {
    const test = harness();
    const finish = vi.fn();
    let observedSignal: AbortSignal | undefined;
    let release: ((value: { durationSeconds: number; finish: () => void }) => void) | undefined;
    test.countIn.mockImplementationOnce(
      (options) =>
        new Promise((resolve, reject) => {
          observedSignal = options.signal;
          release = resolve;
          options.signal?.addEventListener(
            'abort',
            () => {
              finish();
              reject(options.signal?.reason);
            },
            { once: true },
          );
        }),
    );
    const recorder = new RecorderController(test.transport, test.dependencies);
    const starting = recorder.start({
      trackId: 'bass',
      targetBars: { barFrom: 5, barTo: 8 },
      countInBars: 1,
      metronome: true,
    });
    await vi.waitFor(() => expect(test.countIn).toHaveBeenCalledOnce());

    recorder.dispose();
    release?.({ durationSeconds: 0.5, finish });
    await starting;

    expect(observedSignal?.aborted).toBe(true);
    expect(finish).toHaveBeenCalledOnce();
    expect(recorder.getSnapshot().status).toBe('idle');
  });

  it('refuses overlapping and absent recording operations', async () => {
    const test = harness();
    const recorder = new RecorderController(test.transport, test.dependencies);
    await recorder.start({ countInBars: 1, metronome: false });
    await expect(recorder.start({ countInBars: 2, metronome: true })).resolves.toMatchObject({
      ok: false,
      code: 'RECORDER_BUSY',
    });
    await recorder.stop();
    await expect(recorder.stop()).resolves.toMatchObject({ ok: false, code: 'NOT_RECORDING' });
  });

  it('disconnects the worklet and microphone stream when disposed mid-take', async () => {
    const test = harness();
    const recorder = new RecorderController(test.transport, test.dependencies);
    await recorder.start({ countInBars: 1, metronome: false });

    recorder.dispose();

    expect(test.disconnect).toHaveBeenCalledOnce();
    expect(test.stopTrack).toHaveBeenCalledOnce();
    expect(test.port.onmessage).toBeNull();
    expect(recorder.getSnapshot().status).toBe('idle');
  });
});

describe('encodePcm16Wav', () => {
  it('writes the RIFF length, mono format and saturated PCM16 samples', async () => {
    const bytes = new DataView(
      await encodePcm16Wav(new Float32Array([-2, 0, 2]), 48_000).arrayBuffer(),
    );
    expect(bytes.byteLength).toBe(50);
    expect(bytes.getUint32(24, true)).toBe(48_000);
    expect(bytes.getUint16(22, true)).toBe(1);
    expect(bytes.getInt16(44, true)).toBe(-32_768);
    expect(bytes.getInt16(48, true)).toBe(32_767);
  });
});
