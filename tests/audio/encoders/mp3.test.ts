import { describe, expect, it, vi } from 'vitest';
import {
  encodeMp3,
  type Mp3WorkerLike,
  type Mp3WorkerRequest,
  type Mp3WorkerResponse,
} from '../../../src/audio/encoders/mp3.ts';

class FakeWorker implements Mp3WorkerLike {
  onmessage: ((event: MessageEvent<Mp3WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn((request: Mp3WorkerRequest) => {
    queueMicrotask(() =>
      this.onmessage?.({
        data: {
          type: 'complete',
          id: request.id,
          buffer: new Uint8Array([0x49, 0x44, 0x33]).buffer,
        },
      } as MessageEvent<Mp3WorkerResponse>),
    );
  });
  terminate = vi.fn();
}

function buffer(): AudioBuffer {
  const channels = [new Float32Array([0, 0.5, -0.5]), new Float32Array([0.1, 0.2, 0.3])];
  return {
    numberOfChannels: 2,
    length: 3,
    sampleRate: 44_100,
    getChannelData: (channel: number) => channels[channel] ?? new Float32Array(),
  } as AudioBuffer;
}

describe('MP3 worker client', () => {
  it('copies and transfers planar PCM to a dedicated worker', async () => {
    const worker = new FakeWorker();
    const result = await encodeMp3(buffer(), {
      createId: () => 'mp3-1',
      workerFactory: () => worker,
      bitrate: 128_000,
    });
    expect([...result]).toEqual([0x49, 0x44, 0x33]);
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.postMessage.mock.calls[0]?.[0]).toMatchObject({
      id: 'mp3-1',
      sampleRate: 44_100,
      frameCount: 3,
      bitrate: 128_000,
    });
    expect(worker.postMessage.mock.calls[0]?.[0].channels).toHaveLength(2);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates the worker when its job AbortController fires', async () => {
    const worker = new FakeWorker();
    worker.postMessage = vi.fn();
    const controller = new AbortController();
    const promise = encodeMp3(buffer(), {
      createId: () => 'mp3-2',
      workerFactory: () => worker,
      signal: controller.signal,
    });
    controller.abort(new DOMException('Person cancelled.', 'AbortError'));
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects worker construction and postMessage failures without leaking a worker', async () => {
    await expect(
      encodeMp3(buffer(), {
        workerFactory: () => {
          throw new DOMException('Workers are blocked.', 'SecurityError');
        },
      }),
    ).rejects.toMatchObject({ name: 'SecurityError' });

    const worker = new FakeWorker();
    worker.postMessage = vi.fn(() => {
      throw new DOMException('Transfer failed.', 'DataCloneError');
    });
    await expect(encodeMp3(buffer(), { workerFactory: () => worker })).rejects.toMatchObject({
      name: 'DataCloneError',
    });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('turns worker error events and encoded error messages into rejected jobs', async () => {
    const crashed = new FakeWorker();
    crashed.postMessage = vi.fn(() => {
      queueMicrotask(() => crashed.onerror?.(new ErrorEvent('error', { message: 'worker died' })));
    });
    await expect(encodeMp3(buffer(), { workerFactory: () => crashed })).rejects.toThrow(
      'worker died',
    );
    expect(crashed.terminate).toHaveBeenCalledOnce();

    const refused = new FakeWorker();
    refused.postMessage = vi.fn((request: Mp3WorkerRequest) => {
      queueMicrotask(() =>
        refused.onmessage?.({
          data: { type: 'error', id: request.id, error: 'encoder unavailable' },
        } as MessageEvent<Mp3WorkerResponse>),
      );
    });
    await expect(encodeMp3(buffer(), { workerFactory: () => refused })).rejects.toThrow(
      'encoder unavailable',
    );
    expect(refused.terminate).toHaveBeenCalledOnce();
  });
});
