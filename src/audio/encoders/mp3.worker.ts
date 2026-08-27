import { registerMp3Encoder } from '@mediabunny/mp3-encoder';
import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  canEncodeAudio,
  Mp3OutputFormat,
  Output,
  Quality,
} from 'mediabunny';
import type { Mp3WorkerRequest, Mp3WorkerResponse } from './mp3.ts';

export interface Mp3EncodingBackend {
  canEncode(request: Mp3WorkerRequest): Promise<boolean>;
  registerExtension(): void;
  encode(request: Mp3WorkerRequest): Promise<ArrayBuffer>;
}

/** Checks native support first, then registers the unmodified MPL-2.0 extension if needed. */
export async function encodePlanarMp3(
  request: Mp3WorkerRequest,
  backend: Mp3EncodingBackend = DEFAULT_BACKEND,
): Promise<ArrayBuffer> {
  validateRequest(request);
  if (!(await backend.canEncode(request))) backend.registerExtension();
  if (!(await backend.canEncode(request))) {
    throw new Error('MP3 encoding is unavailable in this browser.');
  }
  return backend.encode(request);
}

function validateRequest(request: Mp3WorkerRequest): void {
  if (request.channels.length < 1 || request.channels.length > 2) {
    throw new RangeError('MP3 worker supports one or two channels.');
  }
  if (request.frameCount < 1 || !Number.isInteger(request.frameCount)) {
    throw new RangeError('MP3 worker needs a positive frame count.');
  }
  for (const channel of request.channels) {
    if (channel.byteLength !== request.frameCount * Float32Array.BYTES_PER_ELEMENT) {
      throw new RangeError('MP3 channel length does not match the frame count.');
    }
  }
}

const DEFAULT_BACKEND: Mp3EncodingBackend = {
  canEncode: (request) =>
    canEncodeAudio('mp3', {
      numberOfChannels: request.channels.length,
      sampleRate: request.sampleRate,
      quality: new Quality({ bitrate: request.bitrate }),
    }),
  registerExtension: () => registerMp3Encoder(),
  async encode(request) {
    const target = new BufferTarget();
    const source = new AudioSampleSource({
      codec: 'mp3',
      quality: new Quality({ bitrate: request.bitrate }),
    });
    const output = new Output({ format: new Mp3OutputFormat(), target });
    output.addAudioTrack(source);
    await output.start();

    const planar = new Float32Array(request.frameCount * request.channels.length);
    request.channels.forEach((channel, index) => {
      planar.set(new Float32Array(channel), index * request.frameCount);
    });
    const sample = new AudioSample({
      data: planar,
      format: 'f32-planar',
      numberOfChannels: request.channels.length,
      sampleRate: request.sampleRate,
      timestamp: 0,
    });
    try {
      await source.add(sample);
    } finally {
      sample.close();
    }
    await output.finalize();
    if (!target.buffer) throw new Error('Mediabunny finalized without an MP3 buffer.');
    return target.buffer;
  },
};

interface WorkerScope {
  document?: unknown;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<Mp3WorkerRequest>) => void,
  ): void;
  postMessage(message: Mp3WorkerResponse, transfer: Transferable[]): void;
}

const workerScope = globalThis as unknown as WorkerScope;
if (workerScope.document === undefined && typeof workerScope.addEventListener === 'function') {
  workerScope.addEventListener('message', ({ data }) => {
    if (data.type !== 'encode') return;
    void encodePlanarMp3(data)
      .then((buffer) =>
        workerScope.postMessage({ type: 'complete', id: data.id, buffer }, [buffer]),
      )
      .catch((error: unknown) =>
        workerScope.postMessage(
          {
            type: 'error',
            id: data.id,
            error: error instanceof Error ? error.message : String(error),
          },
          [],
        ),
      );
  });
}
