import { describe, expect, it, vi } from 'vitest';
import type { AudioInstrument, InstrumentLoadResult } from '../../src/audio/instruments.ts';
import type { ChannelNode, GraphNode } from '../../src/audio/reconciler.ts';
import {
  createCatalogueOfflineEngine,
  getRenderFallbacks,
  renderSong,
  type OfflineGraphFactory,
  type OfflineRenderEngine,
  type OfflineToneBoundary,
} from '../../src/audio/render.ts';
import { loadExampleSong } from '../../src/song/serialise.ts';
import type { Track } from '../../src/song/types.ts';

function audioBuffer(value = 0.25): AudioBuffer {
  const channels = [new Float32Array(16).fill(value), new Float32Array(16).fill(value)];
  return {
    duration: 16 / 48_000,
    length: 16,
    sampleRate: 48_000,
    numberOfChannels: 2,
    getChannelData: (channel: number) => channels[channel] ?? new Float32Array(),
  } as AudioBuffer;
}

describe('offline rendering', () => {
  it('preserves tracks and mix while clipping an inclusive bar range to seconds', async () => {
    const song = loadExampleSong();
    const output = audioBuffer();
    const engine: OfflineRenderEngine = {
      render: vi.fn(async () => ({ buffer: output, fallbacks: [] })),
    };
    const progress = vi.fn();
    const result = await renderSong(
      song,
      { start_bar: 1, end_bar: 2, tail_seconds: 1 },
      {
        engine,
        sample_rate: 48_000,
        samples_base_url: 'https://samples.example',
        onProgress: progress,
      },
    );
    expect(result).toBe(output);
    expect(engine.render).toHaveBeenCalledTimes(1);
    const request = vi.mocked(engine.render).mock.calls[0]?.[0];
    expect(request).toMatchObject({
      duration_seconds: (8 * 60) / song.bpm + 1,
      sample_rate: 48_000,
      channels: 2,
      samples_base_url: 'https://samples.example',
    });
    expect(request?.tracks.map(({ track }) => track.instrument)).toEqual(
      song.tracks.map(({ instrument }) => instrument),
    );
    expect(
      request?.tracks.find(({ track }) => track.id === 'melody')?.notes.length,
    ).toBeGreaterThan(0);
    expect(progress.mock.calls.flat()).toEqual([0, 5, 100]);
  });

  it('rejects invalid ranges and honours cancellation before and during rendering', async () => {
    const song = loadExampleSong();
    const engine: OfflineRenderEngine = { render: vi.fn() };
    await expect(renderSong(song, { start_bar: 0, end_bar: 2 }, { engine })).rejects.toThrow(
      'within bars',
    );
    const before = new AbortController();
    before.abort();
    await expect(
      renderSong(song, { start_bar: 1, end_bar: 2 }, { engine, signal: before.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(engine.render).not.toHaveBeenCalled();

    let release: ((value: InstrumentLoadResult) => void) | undefined;
    const pending = new Promise<InstrumentLoadResult>((resolve) => {
      release = resolve;
    });
    const midRender = createCatalogueOfflineEngine({
      boundary: fakeBoundary(audioBuffer()),
      instrumentLoader: () => pending,
    });
    const during = new AbortController();
    const rendering = renderSong(
      song,
      { start_bar: 1, end_bar: 2 },
      {
        engine: midRender,
        signal: during.signal,
      },
    );
    during.abort(new DOMException('Person cancelled.', 'AbortError'));
    await expect(rendering).rejects.toMatchObject({ name: 'AbortError' });
    release?.({ instrument: instrument('late'), loaded: true });
  });

  it('limits an over-full-scale buffer and keeps fallback notices with the encoded samples', async () => {
    const song = loadExampleSong();
    const output = audioBuffer(2.4);
    const engine: OfflineRenderEngine = {
      render: vi.fn(async () => ({
        buffer: output,
        fallbacks: ['Keys: remote failed; playing Grand piano instead.'],
      })),
    };

    expect(await renderSong(song, { start_bar: 1, end_bar: 2 }, { engine })).toBe(output);
    expect(output.getChannelData(0)[0]).toBeCloseTo(0.98, 5);
    expect(output.getChannelData(1)[0]).toBeCloseTo(0.98, 5);
    expect(getRenderFallbacks(output)).toEqual([
      'Keys: remote failed; playing Grand piano instead.',
    ]);
  });

  it('mirrors the live node set and renders notes through catalogue instruments', async () => {
    const song = loadExampleSong();
    const output = audioBuffer(0);
    const boundary = graphBoundary(output);
    const loaded: string[] = [];
    const triggered: number[] = [];
    const instrumentLoader = vi.fn(async (id: string): Promise<InstrumentLoadResult> => {
      loaded.push(id);
      return {
        instrument: {
          id,
          trigger(pitch) {
            triggered.push(pitch);
            output.getChannelData(0)[0] = 0.25;
            output.getChannelData(1)[0] = 0.25;
          },
          dispose: vi.fn(),
        },
        loaded: id !== 'electric-piano',
        ...(id === 'electric-piano'
          ? { reason: 'Electric piano needs R2; playing Grand piano instead.' }
          : {}),
      };
    });
    const engine = createCatalogueOfflineEngine({ boundary, instrumentLoader });

    const result = await renderSong(song, { start_bar: 1, end_bar: 2 }, { engine });

    expect(boundary.connections).toEqual(
      expect.arrayContaining([
        'master:compressor->master:limiter:-1',
        'master:limiter:-1->destination',
        'master:reverb->master:compressor',
        'channel:melody->master:compressor',
        'channel:melody->send:melody:0.2',
        'send:melody:0.2->master:reverb',
      ]),
    );
    expect(boundary.nodes).toEqual(
      expect.arrayContaining([
        'master:compressor',
        'master:limiter:-1',
        'master:reverb',
        'channel:melody',
        'send:melody:0.2',
      ]),
    );
    expect(boundary.channels.get('melody')).toMatchObject({
      volume_db: -3,
      pan: 0,
      mute: false,
      solo: false,
    });
    expect(loaded).toEqual(song.tracks.map(({ instrument: id }) => id));
    expect(triggered.length).toBeGreaterThan(0);
    expect(result.getChannelData(0).some((sample) => sample !== 0)).toBe(true);
    expect(getRenderFallbacks(result)).toEqual([
      'Chords: Electric piano needs R2; playing Grand piano instead.',
    ]);
  });
});

function instrument(id: string): AudioInstrument {
  return { id, trigger: vi.fn(), dispose: vi.fn() };
}

function fakeBoundary(buffer: AudioBuffer): OfflineToneBoundary {
  return {
    async render(_request, build) {
      await build({ destination: {} } as BaseAudioContext, graphFactory().factory);
      return buffer;
    },
  };
}

function graphBoundary(buffer: AudioBuffer): OfflineToneBoundary & {
  connections: string[];
  nodes: string[];
  channels: Map<string, Pick<Track, 'volume_db' | 'pan' | 'mute' | 'solo'>>;
} {
  const graph = graphFactory();
  return {
    ...graph,
    async render(_request, build) {
      await build({ destination: {} } as BaseAudioContext, graph.factory);
      return buffer;
    },
  };
}

function graphFactory(): {
  factory: OfflineGraphFactory;
  connections: string[];
  nodes: string[];
  channels: Map<string, Pick<Track, 'volume_db' | 'pan' | 'mute' | 'solo'>>;
} {
  const connections: string[] = [];
  const nodes: string[] = [];
  const channels = new Map<string, Pick<Track, 'volume_db' | 'pan' | 'mute' | 'solo'>>();
  const node = (label: string): GraphNode => {
    nodes.push(label);
    return {
      label,
      raw: { label },
      connect: (destination) => connections.push(`${label}->${destination.label}`),
      dispose: vi.fn(),
    };
  };
  return {
    connections,
    nodes,
    channels,
    factory: {
      destination: () => node('destination'),
      compressor: () => node('master:compressor'),
      limiter: (ceiling) => node(`master:limiter:${ceiling}`),
      reverb: () => node('master:reverb'),
      channel: (track): ChannelNode => {
        channels.set(track.id, track);
        return { ...node(`channel:${track.id}`), setMix: vi.fn() };
      },
      send: (gain, trackId) => node(`send:${trackId}:${gain}`),
    },
  };
}
