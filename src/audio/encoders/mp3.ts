export interface Mp3WorkerRequest {
  type: 'encode';
  id: string;
  sampleRate: number;
  frameCount: number;
  channels: ArrayBuffer[];
  bitrate: number;
}

export type Mp3WorkerResponse =
  | { type: 'complete'; id: string; buffer: ArrayBuffer }
  | { type: 'error'; id: string; error: string };

export interface Mp3WorkerLike {
  onmessage: ((event: MessageEvent<Mp3WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: Mp3WorkerRequest, transfer: Transferable[]): void;
  terminate(): void;
}

export interface Mp3EncodeOptions {
  bitrate?: number | undefined;
  signal?: AbortSignal | undefined;
  createId?: (() => string) | undefined;
  workerFactory?: (() => Mp3WorkerLike) | undefined;
}

/** Sends PCM to the dedicated Mediabunny/LAME worker and returns a complete MP3 file. */
export function encodeMp3(
  audioBuffer: AudioBuffer,
  options: Mp3EncodeOptions = {},
): Promise<Uint8Array> {
  if (audioBuffer.numberOfChannels < 1 || audioBuffer.numberOfChannels > 2) {
    return Promise.reject(new RangeError('MP3 export supports one or two channels.'));
  }
  if (audioBuffer.length === 0)
    return Promise.reject(new RangeError('MP3 export needs audio frames.'));
  if (options.signal?.aborted) {
    return Promise.reject(
      options.signal.reason ?? new DOMException('MP3 export cancelled.', 'AbortError'),
    );
  }

  let worker: Mp3WorkerLike;
  try {
    worker = (options.workerFactory ?? createMp3Worker)();
  } catch (error) {
    return Promise.reject(error);
  }
  const id = (options.createId ?? (() => crypto.randomUUID()))();
  const channels = Array.from(
    { length: audioBuffer.numberOfChannels },
    (_, channel) => Float32Array.from(audioBuffer.getChannelData(channel)).buffer,
  );
  const request: Mp3WorkerRequest = {
    type: 'encode',
    id,
    sampleRate: audioBuffer.sampleRate,
    frameCount: audioBuffer.length,
    channels,
    bitrate: options.bitrate ?? 192_000,
  };

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      options.signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };
    const onAbort = (): void => {
      cleanup();
      reject(options.signal?.reason ?? new DOMException('MP3 export cancelled.', 'AbortError'));
    };
    worker.onmessage = ({ data }) => {
      if (data.id !== id) return;
      cleanup();
      if (data.type === 'error') reject(new Error(data.error));
      else resolve(new Uint8Array(data.buffer));
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || 'MP3 worker failed.'));
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      worker.postMessage(request, channels);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function createMp3Worker(): Mp3WorkerLike {
  return new Worker(new URL('./mp3.worker.ts', import.meta.url), { type: 'module' });
}
