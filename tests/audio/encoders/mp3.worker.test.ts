import { describe, expect, it, vi } from 'vitest';
import {
  encodePlanarMp3,
  type Mp3EncodingBackend,
} from '../../../src/audio/encoders/mp3.worker.ts';
import type { Mp3WorkerRequest } from '../../../src/audio/encoders/mp3.ts';

function request(): Mp3WorkerRequest {
  return {
    type: 'encode',
    id: 'worker-1',
    sampleRate: 44_100,
    frameCount: 2,
    channels: [new Float32Array([0, 0.5]).buffer],
    bitrate: 192_000,
  };
}

describe('Mediabunny MP3 worker', () => {
  it('checks canEncodeAudio, registers the extension only when needed and encodes', async () => {
    const backend: Mp3EncodingBackend = {
      canEncode: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
      registerExtension: vi.fn(),
      encode: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
    };
    expect(new Uint8Array(await encodePlanarMp3(request(), backend))).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(backend.canEncode).toHaveBeenCalledTimes(2);
    expect(backend.registerExtension).toHaveBeenCalledOnce();
    expect(backend.encode).toHaveBeenCalledOnce();
  });

  it('fails plainly when capability remains unavailable or PCM is malformed', async () => {
    const backend: Mp3EncodingBackend = {
      canEncode: vi.fn(async () => false),
      registerExtension: vi.fn(),
      encode: vi.fn(),
    };
    await expect(encodePlanarMp3(request(), backend)).rejects.toThrow('unavailable');
    await expect(encodePlanarMp3({ ...request(), frameCount: 3 }, backend)).rejects.toThrow(
      'does not match',
    );
    expect(backend.encode).not.toHaveBeenCalled();
  });
});
