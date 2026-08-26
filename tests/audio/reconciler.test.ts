import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  beatPosition,
  createAudioReconciler,
  type ChannelNode,
  type GraphNode,
  type PartEvent,
  type PartNode,
  type ToneGraphFactory,
} from '../../src/audio/reconciler.ts';
import type { AudioContextManager } from '../../src/audio/context.ts';
import type { AudioInstrument, InstrumentLoadResult } from '../../src/audio/instruments.ts';
import { createSongReducer } from '../../src/song/reducer.ts';
import { loadExampleSong } from '../../src/song/serialise.ts';
import { createSongStore } from '../../src/song/store.ts';

interface FakePart extends PartNode {
  callback: (time: number, event: PartEvent) => void;
  dispose: Mock<() => void>;
}

function graphFactory() {
  const connections: string[] = [];
  const parts: FakePart[] = [];
  const nodes: GraphNode[] = [];
  const node = (label: string): GraphNode => {
    const value: GraphNode = {
      label,
      raw: { label },
      connect: (destination) => connections.push(`${label}->${destination.label}`),
      dispose: vi.fn(),
    };
    nodes.push(value);
    return value;
  };
  const channels = new Map<string, ChannelNode & { setMix: ReturnType<typeof vi.fn> }>();
  const factory: ToneGraphFactory = {
    destination: () => node('destination'),
    compressor: () => node('master:compressor'),
    limiter: () => node('master:limiter'),
    reverb: () => node('master:reverb'),
    channel: (track) => {
      const value = { ...node(`channel:${track.id}`), setMix: vi.fn() };
      channels.set(track.id, value);
      return value;
    },
    send: (_gain, trackId) => node(`send:${trackId}`),
    part: (trackId, events, callback) => {
      const part: FakePart = {
        label: `part:${trackId}`,
        events,
        callback,
        start: vi.fn(),
        dispose: vi.fn<() => void>(),
      };
      parts.push(part);
      return part;
    },
    setTransportBpm: vi.fn(),
  };
  return { factory, connections, parts, nodes, channels };
}

function audio(): AudioContextManager {
  return {
    activateFromGesture: vi.fn(),
    getContext: () => ({}) as AudioContext,
    getSnapshot: () => ({
      state: 'running',
      sample_rate: 48_000,
      base_latency_s: 0,
      output_latency_s: 0,
    }),
    requireRunning: () => ({}) as AudioContext,
    subscribe: () => () => undefined,
    close: vi.fn(),
  };
}

describe('audio graph reconciler', () => {
  it('derives the expected master, track and Part node set from the document', async () => {
    const graph = graphFactory();
    const loaded = new Map<string, AudioInstrument>();
    const instrumentLoader = vi.fn(async (id: string): Promise<InstrumentLoadResult> => {
      const instrument: AudioInstrument = { id, trigger: vi.fn(), dispose: vi.fn() };
      loaded.set(id, instrument);
      return { instrument, loaded: true };
    });
    const store = createSongStore(loadExampleSong(), createSongReducer());
    const reconciler = createAudioReconciler(store, audio(), {
      provideGraphFactory: async () => graph.factory,
      instrumentLoader,
    });
    await reconciler.ready();

    expect(reconciler.getSnapshot().nodes).toEqual(
      expect.arrayContaining([
        'master:compressor',
        'master:limiter',
        'master:reverb',
        'channel:melody',
        'send:melody',
        'instrument:melody:grand-piano',
        'part:melody',
        'channel:drums',
        'instrument:drums:studio-kit',
        'part:drums',
      ]),
    );
    expect(graph.connections).toEqual(
      expect.arrayContaining([
        'master:compressor->master:limiter',
        'master:limiter->destination',
        'master:reverb->master:compressor',
        'channel:melody->master:compressor',
        'channel:melody->send:melody',
        'send:melody->master:reverb',
      ]),
    );
    expect(graph.factory.setTransportBpm).toHaveBeenCalledWith(92);
    expect(instrumentLoader.mock.calls.map(([id]) => id)).toEqual([
      'grand-piano',
      'electric-piano',
      'sub-bass',
      'studio-kit',
    ]);
    expect(reconciler.getSnapshot().parts.melody?.[0]).toMatchObject({
      time: '0:0:0',
      note: { p: 64, s: 0 },
    });

    const melodyPart = graph.parts.find(({ label }) => label === 'part:melody');
    const event = melodyPart?.events[0];
    if (event) melodyPart.callback(2, event);
    expect(loaded.get('grand-piano')?.trigger).toHaveBeenCalledWith(64, 2, 60 / 92, 0.78);
    reconciler.dispose();
  });

  it('rebuilds a Part only when notes_rev changes and reloads on instrument changes', async () => {
    const graph = graphFactory();
    const instruments: AudioInstrument[] = [];
    const instrumentLoader = vi.fn(async (id: string): Promise<InstrumentLoadResult> => {
      const instrument: AudioInstrument = { id, trigger: vi.fn(), dispose: vi.fn() };
      instruments.push(instrument);
      return { instrument, loaded: true };
    });
    const store = createSongStore(loadExampleSong(), createSongReducer());
    const reconciler = createAudioReconciler(store, audio(), {
      provideGraphFactory: async () => graph.factory,
      instrumentLoader,
    });
    await reconciler.ready();
    const originalMelodyPart = graph.parts.find(({ label }) => label === 'part:melody');

    store.dispatch({
      type: 'set_mix',
      args: { track_id: 'melody', pan: 0.4 },
      source: 'human',
      why: 'Move it right.',
    });
    expect(originalMelodyPart?.dispose).not.toHaveBeenCalled();
    expect(graph.channels.get('melody')?.setMix).toHaveBeenLastCalledWith(
      expect.objectContaining({ pan: 0.4 }),
    );

    store.dispatch({
      type: 'set_notes',
      args: {
        track_id: 'melody',
        bar_from: 1,
        notes: [{ p: 60, s: 0.25, d: 1, v: 0.8 }],
        replace: true,
      },
      source: 'human',
      why: 'Try one note.',
    });
    expect(originalMelodyPart?.dispose).toHaveBeenCalledTimes(1);
    expect(reconciler.getSnapshot().parts.melody?.[0]?.time).toBe('0:0:1');

    const oldGrand = instruments.find(({ id }) => id === 'grand-piano');
    store.dispatch({
      type: 'set_instrument',
      args: { track_id: 'melody', instrument: 'electric-piano' },
      source: 'agent',
      why: 'A softer colour suits it.',
    });
    await reconciler.ready();
    expect(oldGrand?.dispose).toHaveBeenCalledTimes(1);
    expect(instrumentLoader).toHaveBeenLastCalledWith(
      'electric-piano',
      expect.objectContaining({ destination: { label: 'channel:melody' } }),
    );
    reconciler.dispose();
  });

  it('reports a plain fallback reason to the visible loader state', async () => {
    const graph = graphFactory();
    const store = createSongStore(loadExampleSong(), createSongReducer());
    store.dispatch({
      type: 'set_instrument',
      args: { track_id: 'melody', instrument: 'vcsl-flute' },
      source: 'agent',
      why: 'Try a breathy lead.',
    });
    const reconciler = createAudioReconciler(store, audio(), {
      provideGraphFactory: async () => graph.factory,
      instrumentLoader: async (id) => ({
        instrument: { id, trigger: vi.fn(), dispose: vi.fn() },
        loaded: false,
        reason: 'R2 is not configured; playing piano instead.',
      }),
    });
    await reconciler.ready();
    expect(reconciler.getSnapshot().fallbacks).toMatchObject({
      'melody:vcsl-flute': 'R2 is not configured; playing piano instead.',
    });
  });

  it('converts fractional beats to Tone positions', () => {
    expect(beatPosition(0)).toBe('0:0:0');
    expect(beatPosition(6.75)).toBe('1:2:3');
  });
});
