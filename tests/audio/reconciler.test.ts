import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  beatPosition,
  type ClipPartEvent,
  type ClipPartNode,
  createAudioReconciler,
  type ChannelNode,
  type GraphNode,
  type PartEvent,
  type PartNode,
  type ToneGraphFactory,
} from '../../src/audio/reconciler.ts';
import type { AudioContextManager } from '../../src/audio/context.ts';
import type {
  AudioInstrument,
  InstrumentLoadRequest,
  InstrumentLoadResult,
} from '../../src/audio/instruments.ts';
import { createSongReducer } from '../../src/song/reducer.ts';
import { loadExampleSong } from '../../src/song/serialise.ts';
import { createSongStore } from '../../src/song/store.ts';
import { encodeTakeAudio } from '../../src/audio/clips.ts';

interface FakePart extends PartNode {
  callback: (time: number, event: PartEvent) => void;
  dispose: Mock<() => void>;
}

interface FakeClipPart extends ClipPartNode {
  callback: (time: number, event: ClipPartEvent) => void;
  dispose: Mock<() => void>;
}

function graphFactory() {
  const connections: string[] = [];
  const parts: FakePart[] = [];
  const clipParts: FakeClipPart[] = [];
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
    clipPart: (trackId, events, callback) => {
      const part: FakeClipPart = {
        label: `clips:${trackId}`,
        events,
        callback,
        start: vi.fn(),
        dispose: vi.fn<() => void>(),
      };
      clipParts.push(part);
      return part;
    },
    setTransportBpm: vi.fn(),
  };
  return { factory, connections, parts, clipParts, nodes, channels };
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
    store.dispatch({
      type: 'set_tempo',
      args: { bpm: 120 },
      source: 'human',
      why: 'Try it faster.',
    });
    if (event) melodyPart.callback(3, event);
    expect(loaded.get('grand-piano')?.trigger).toHaveBeenLastCalledWith(64, 3, 0.5, 0.78);
    expect(melodyPart?.dispose).not.toHaveBeenCalled();
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

  it('decodes and schedules a retained vocal through the live track channel', async () => {
    const graph = graphFactory();
    const song = loadExampleSong();
    song.takes.push({
      id: 'voice-1',
      source: 'mic',
      notes: [],
      pitch_track: [],
      duration_s: 0.09,
      voiced_ratio: 0,
      median_clarity: 0,
      pitch_range: [0, 0],
      tempo_hint: 92,
      audio: encodeTakeAudio(new Float32Array(800).fill(0.2), 8_000, 0.01, 4),
    });
    song.tracks.push({
      id: 'vocal',
      name: 'Voice',
      kind: 'vocal',
      instrument: 'recorded-voice',
      volume_db: -3,
      pan: 0,
      mute: false,
      solo: false,
      notes_rev: 0,
      notes: [],
      clips_rev: 1,
      clips: [{ id: 'voice-1', take_id: 'voice-1', s: 4 }],
    });
    const starts: number[][] = [];
    const source = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      start: vi.fn((...args: number[]) => starts.push(args)),
    };
    const context = {
      createBuffer: (_channels: number, length: number, sampleRate: number) => {
        const channel = new Float32Array(length);
        return {
          duration: length / sampleRate,
          length,
          sampleRate,
          numberOfChannels: 1,
          getChannelData: () => channel,
        } as unknown as AudioBuffer;
      },
      createBufferSource: () => source,
    } as unknown as AudioContext;
    const audioWithVoice: AudioContextManager = {
      ...audio(),
      getContext: () => context,
      requireRunning: () => context,
    };
    const instrumentLoader = vi.fn(async (id: string): Promise<InstrumentLoadResult> => ({
      instrument: { id, trigger: vi.fn(), dispose: vi.fn() },
      loaded: true,
    }));
    const store = createSongStore(song, createSongReducer());
    const reconciler = createAudioReconciler(store, audioWithVoice, {
      provideGraphFactory: async () => graph.factory,
      instrumentLoader,
    });

    await reconciler.ready();

    expect(instrumentLoader).not.toHaveBeenCalledWith('recorded-voice', expect.anything());
    expect(reconciler.getSnapshot().nodes).toContain('clips:vocal');
    const part = graph.clipParts.find(({ label }) => label === 'clips:vocal');
    const event = part?.events[0];
    expect(event).toMatchObject({ time: '1:0:0', offset_seconds: 0.01, duration_seconds: 0.09 });
    if (event) part?.callback(2, event);
    expect(source.connect).toHaveBeenCalledWith({ label: 'channel:vocal' });
    expect(starts[0]).toEqual([2, 0.01, 0.09]);
    reconciler.dispose();
  });

  it('reports a plain fallback reason to the visible loader state', async () => {
    const graph = graphFactory();
    const store = createSongStore(loadExampleSong(), createSongReducer());
    store.dispatch({
      type: 'set_instrument',
      args: { track_id: 'melody', instrument: 'vcsl-recorder' },
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
      'melody:vcsl-recorder': 'R2 is not configured; playing piano instead.',
    });
  });

  it('keeps the current instrument audible when a replacement load fails', async () => {
    const graph = graphFactory();
    let rejectReplacement: ((error: Error) => void) | undefined;
    const instruments = new Map<string, AudioInstrument>();
    const instrumentLoader = vi.fn(
      (id: string, request: InstrumentLoadRequest): Promise<InstrumentLoadResult> => {
        if (id === 'vcsl-recorder') {
          request.onProgress?.(0);
          return new Promise((_resolve, reject) => {
            rejectReplacement = reject;
          });
        }
        const instrument: AudioInstrument = { id, trigger: vi.fn(), dispose: vi.fn() };
        instruments.set(id, instrument);
        return Promise.resolve({ instrument, loaded: true });
      },
    );
    const store = createSongStore(loadExampleSong(), createSongReducer());
    const reconciler = createAudioReconciler(store, audio(), {
      provideGraphFactory: async () => graph.factory,
      instrumentLoader,
    });
    await reconciler.ready();
    const originalPart = graph.parts.find(({ label }) => label === 'part:melody');

    store.dispatch({
      type: 'set_instrument',
      args: { track_id: 'melody', instrument: 'vcsl-recorder' },
      source: 'human',
      why: 'Try the recorder.',
    });
    expect(instruments.get('grand-piano')?.dispose).not.toHaveBeenCalled();
    expect(originalPart?.dispose).not.toHaveBeenCalled();
    expect(reconciler.getSnapshot().loading['melody:vcsl-recorder']).toBe(0);

    rejectReplacement?.(new Error('sample request failed'));
    await expect(reconciler.ready()).resolves.toBeUndefined();
    expect(instruments.get('grand-piano')?.dispose).not.toHaveBeenCalled();
    expect(originalPart?.dispose).not.toHaveBeenCalled();
    expect(reconciler.getSnapshot().fallbacks['melody:vcsl-recorder']).toContain(
      'sample request failed',
    );
    reconciler.dispose();
  });

  it('marks a replacement as loading before its loader reports progress', async () => {
    const graph = graphFactory();
    let finishReplacement: ((result: InstrumentLoadResult) => void) | undefined;
    const instrumentLoader = vi.fn((id: string): Promise<InstrumentLoadResult> => {
      if (id === 'vcsl-recorder') {
        return new Promise((resolve) => {
          finishReplacement = resolve;
        });
      }
      return Promise.resolve({
        instrument: { id, trigger: vi.fn(), dispose: vi.fn() },
        loaded: true,
      });
    });
    const store = createSongStore(loadExampleSong(), createSongReducer());
    const reconciler = createAudioReconciler(store, audio(), {
      provideGraphFactory: async () => graph.factory,
      instrumentLoader,
    });
    await reconciler.ready();

    store.dispatch({
      type: 'set_instrument',
      args: { track_id: 'melody', instrument: 'vcsl-recorder' },
      source: 'human',
      why: 'Try the recorder.',
    });

    expect(reconciler.getSnapshot().loading['melody:vcsl-recorder']).toBe(0);
    finishReplacement?.({
      instrument: { id: 'vcsl-recorder', trigger: vi.fn(), dispose: vi.fn() },
      loaded: true,
    });
    await reconciler.ready();
    reconciler.dispose();
  });

  it('clears a late instrument load when its track disappears', async () => {
    const graph = graphFactory();
    let finishReplacement: ((result: InstrumentLoadResult) => void) | undefined;
    const instrumentLoader = vi.fn(
      (id: string, request: InstrumentLoadRequest): Promise<InstrumentLoadResult> => {
        if (id === 'vcsl-recorder') {
          request.onProgress?.(0);
          return new Promise((resolve) => {
            finishReplacement = resolve;
          });
        }
        return Promise.resolve({
          instrument: { id, trigger: vi.fn(), dispose: vi.fn() },
          loaded: true,
        });
      },
    );
    const store = createSongStore(loadExampleSong(), createSongReducer());
    const reconciler = createAudioReconciler(store, audio(), {
      provideGraphFactory: async () => graph.factory,
      instrumentLoader,
    });
    await reconciler.ready();
    store.dispatch({
      type: 'set_instrument',
      args: { track_id: 'melody', instrument: 'vcsl-recorder' },
      source: 'human',
      why: 'Try the recorder.',
    });
    const withoutMelody = {
      ...store.getDocument(),
      tracks: store.getDocument().tracks.filter(({ id }) => id !== 'melody'),
    };
    store.dispatch({
      type: '__restore_snapshot',
      args: { document: withoutMelody, summary: 'Removed Melody' },
      source: 'human',
    });
    const late = { id: 'vcsl-recorder', trigger: vi.fn(), dispose: vi.fn() };
    finishReplacement?.({ instrument: late, loaded: true });
    await Promise.resolve();
    expect(late.dispose).toHaveBeenCalledOnce();
    expect(reconciler.getSnapshot().loading).not.toHaveProperty('melody:vcsl-recorder');
    expect(reconciler.getSnapshot().nodes).not.toContain('channel:melody');
    reconciler.dispose();
  });

  it('converts fractional beats to Tone positions', () => {
    expect(beatPosition(0)).toBe('0:0:0');
    expect(beatPosition(6.75)).toBe('1:2:3');
  });
});
