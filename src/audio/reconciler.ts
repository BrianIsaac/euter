/** Reconciles the Tone graph from the song document; the document remains authoritative. */
import type { Note, SongDocument, Track } from '../song/types.ts';
import type { SongStoreReader } from '../song/serialise.ts';
import type { AudioContextManager } from './context.ts';
import {
  loadInstrument,
  type AudioInstrument,
  type InstrumentLoadRequest,
  type InstrumentLoadResult,
} from './instruments.ts';

export interface GraphNode {
  readonly label: string;
  readonly raw: unknown;
  connect(destination: GraphNode): void;
  dispose(): void;
}

export interface ChannelNode extends GraphNode {
  setMix(track: Pick<Track, 'volume_db' | 'pan' | 'mute' | 'solo'>): void;
}

export interface PartEvent {
  time: string;
  note: Note;
}

export interface PartNode {
  readonly label: string;
  readonly events: readonly PartEvent[];
  start(): void;
  dispose(): void;
}

export interface ToneGraphFactory {
  destination(): GraphNode;
  compressor(): GraphNode;
  limiter(ceilingDb: number): GraphNode;
  reverb(): GraphNode;
  channel(track: Track): ChannelNode;
  send(gain: number, trackId: string): GraphNode;
  part(
    trackId: string,
    events: readonly PartEvent[],
    callback: (time: number, event: PartEvent) => void,
  ): PartNode;
  setTransportBpm(bpm: number): void;
}

export interface ReconcilerSnapshot {
  ready: boolean;
  nodes: string[];
  parts: Record<string, readonly PartEvent[]>;
  loading: Record<string, number>;
  fallbacks: Record<string, string>;
}

export interface AudioReconciler {
  ready(): Promise<void>;
  reconcile(): void;
  getSnapshot(): ReconcilerSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

export interface ReconcilerOptions {
  provideGraphFactory?: (() => Promise<ToneGraphFactory>) | undefined;
  instrumentLoader?:
    ((id: string, request: InstrumentLoadRequest) => Promise<InstrumentLoadResult>) | undefined;
  samplesBaseUrl?: string | undefined;
  reverbSend?: Partial<Record<Track['kind'], number>> | undefined;
}

interface ReconciledTrack {
  channel: ChannelNode;
  send: GraphNode;
  instrumentKey: string;
  loadingKey: string | null;
  instrument: AudioInstrument | null;
  part: PartNode | null;
  notesRev: number;
  loadVersion: number;
  loadPromise: Promise<void> | null;
}

export const DEFAULT_REVERB_SEND: Readonly<Record<Track['kind'], number>> = {
  melody: 0.2,
  chords: 0.28,
  bass: 0.06,
  drums: 0.1,
};

export const MASTER_COMPRESSOR = { threshold: -18, ratio: 3 } as const;
export const MASTER_LIMITER_CEILING_DB = -1;
export const MASTER_REVERB = { decay: 1.8, wet: 1 } as const;

/** Creates and immediately subscribes the graph reconciler. */
export function createAudioReconciler(
  store: SongStoreReader,
  audio: AudioContextManager,
  options: ReconcilerOptions = {},
): AudioReconciler {
  const provideGraphFactory = options.provideGraphFactory ?? defaultGraphFactoryProvider;
  const instrumentLoader = options.instrumentLoader ?? loadInstrument;
  const sendLevels = { ...DEFAULT_REVERB_SEND, ...options.reverbSend };
  const listeners = new Set<() => void>();
  const tracks = new Map<string, ReconciledTrack>();
  let factory: ToneGraphFactory | null = null;
  let initialisePromise: Promise<void> | null = null;
  let disposed = false;
  let masterNodes: GraphNode[] = [];

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  const ensureGraph = (): Promise<void> => {
    if (initialisePromise) return initialisePromise;
    if (audio.getSnapshot().state !== 'running') return Promise.resolve();
    initialisePromise = provideGraphFactory().then((created) => {
      if (disposed) return;
      factory = created;
      const destination = created.destination();
      const compressor = created.compressor();
      const limiter = created.limiter(MASTER_LIMITER_CEILING_DB);
      const reverb = created.reverb();
      compressor.connect(limiter);
      limiter.connect(destination);
      reverb.connect(compressor);
      masterNodes = [compressor, limiter, reverb];
      applyDocument(store.getDocument());
      notify();
    });
    return initialisePromise;
  };

  const reconcile = (): void => {
    if (disposed) return;
    if (!factory) {
      void ensureGraph();
      return;
    }
    applyDocument(store.getDocument());
  };

  function applyDocument(song: SongDocument): void {
    if (!factory || disposed) return;
    factory.setTransportBpm(song.bpm);
    const liveIds = new Set(song.tracks.map(({ id }) => id));
    for (const [trackId, state] of tracks) {
      if (!liveIds.has(trackId)) {
        clearTrackLoadState(trackId, state);
        disposeTrack(state);
        tracks.delete(trackId);
      }
    }
    for (const track of song.tracks) {
      let state = tracks.get(track.id);
      if (!state) {
        const channel = factory.channel(track);
        const send = factory.send(sendLevels[track.kind], track.id);
        channel.connect(masterNodes[0] ?? factory.destination());
        channel.connect(send);
        send.connect(masterNodes[2] ?? masterNodes[0] ?? factory.destination());
        state = {
          channel,
          send,
          instrumentKey: '',
          loadingKey: null,
          instrument: null,
          part: null,
          notesRev: -1,
          loadVersion: 0,
          loadPromise: null,
        };
        tracks.set(track.id, state);
      }
      state.channel.setMix(track);
      const key = `${track.id}:${track.instrument}`;
      if (state.loadingKey && state.instrumentKey === key) {
        clearTrackLoadState(track.id, state);
        state.loadVersion += 1;
      }
      if (state.instrumentKey !== key && state.loadingKey !== key) {
        loadTrackInstrument(song, track, state, key);
      }
      if (state.instrument && state.notesRev !== track.notes_rev) rebuildPart(song, track, state);
    }
    notify();
  }

  function loadTrackInstrument(
    song: SongDocument,
    track: Track,
    state: ReconciledTrack,
    key: string,
  ): void {
    state.loadVersion += 1;
    const version = state.loadVersion;
    clearTrackLoadState(track.id, state);
    state.loadingKey = key;
    loadingProgress.set(key, 0);
    fallbackReasons.delete(key);
    state.loadPromise = instrumentLoader(track.instrument, {
      context: audio.requireRunning(),
      destination: state.channel.raw,
      samplesBaseUrl: options.samplesBaseUrl,
      onProgress: (progress) => {
        if (state.loadVersion === version) {
          loadingProgress.set(key, progress);
          notify();
        }
      },
    })
      .then((result) => {
        if (disposed || state.loadVersion !== version) {
          result.instrument.dispose();
          return;
        }
        state.instrument?.dispose();
        state.part?.dispose();
        state.instrument = result.instrument;
        state.instrumentKey = key;
        state.loadingKey = null;
        state.part = null;
        state.notesRev = -1;
        loadingProgress.delete(key);
        if (!result.loaded && result.reason) fallbackReasons.set(key, result.reason);
        else fallbackReasons.delete(key);
        const currentTrack = store.getDocument().tracks.find(({ id }) => id === track.id);
        if (currentTrack) rebuildPart(store.getDocument(), currentTrack, state);
        notify();
      })
      .catch((error: unknown) => {
        if (disposed || state.loadVersion !== version) return;
        state.loadingKey = null;
        loadingProgress.delete(key);
        const detail = error instanceof Error ? error.message : String(error);
        const continuity = state.instrument
          ? `Continuing with ${state.instrument.id}.`
          : 'This track is silent.';
        fallbackReasons.set(key, `Failed to load ${track.instrument}: ${detail}. ${continuity}`);
        notify();
      });
    // `song` is intentionally captured by the call site so bpm/time signature and load start are
    // one document observation; the current document is used after the asynchronous load.
    void song;
  }

  function rebuildPart(song: SongDocument, track: Track, state: ReconciledTrack): void {
    if (!factory || !state.instrument) return;
    state.part?.dispose();
    const events = track.notes.map((note) => ({
      time: beatPosition(note.s, song.time_sig[0]),
      note,
    }));
    const instrument = state.instrument;
    state.part = factory.part(track.id, events, (time, event) => {
      const currentBpm = store.getDocument().bpm;
      instrument.trigger(event.note.p, time, (event.note.d * 60) / currentBpm, event.note.v);
    });
    state.part.start();
    state.notesRev = track.notes_rev;
  }

  const loadingProgress = new Map<string, number>();
  const fallbackReasons = new Map<string, string>();

  function clearTrackLoadState(trackId: string, state: ReconciledTrack): void {
    if (state.loadingKey) loadingProgress.delete(state.loadingKey);
    state.loadingKey = null;
    for (const key of fallbackReasons.keys()) {
      if (key.startsWith(`${trackId}:`)) fallbackReasons.delete(key);
    }
  }
  const unsubscribeStore = store.subscribe(reconcile);
  const unsubscribeAudio = audio.subscribe(reconcile);
  reconcile();

  return {
    async ready() {
      await ensureGraph();
      await Promise.all([...tracks.values()].map(({ loadPromise }) => loadPromise));
    },
    reconcile,
    getSnapshot() {
      const parts: Record<string, readonly PartEvent[]> = {};
      const nodes = masterNodes.map(({ label }) => label);
      for (const [trackId, state] of tracks) {
        nodes.push(state.channel.label, state.send.label);
        if (state.instrument) nodes.push(`instrument:${state.instrumentKey}`);
        if (state.part) {
          nodes.push(state.part.label);
          parts[trackId] = state.part.events;
        }
      }
      return {
        ready: factory !== null,
        nodes,
        parts,
        loading: Object.fromEntries(loadingProgress),
        fallbacks: Object.fromEntries(fallbackReasons),
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeStore();
      unsubscribeAudio();
      for (const state of tracks.values()) disposeTrack(state);
      tracks.clear();
      for (const node of masterNodes) node.dispose();
      masterNodes = [];
      listeners.clear();
    },
  };
}

/** Converts absolute beats to Tone's `bars:quarters:sixteenths` form. */
export function beatPosition(beats: number, beatsPerBar = 4): string {
  const bar = Math.floor(beats / beatsPerBar);
  const withinBar = beats - bar * beatsPerBar;
  const quarter = Math.floor(withinBar);
  const sixteenth = Math.round((withinBar - quarter) * 4 * 1000) / 1000;
  return `${bar}:${quarter}:${sixteenth}`;
}

function disposeTrack(state: ReconciledTrack): void {
  state.loadVersion += 1;
  state.part?.dispose();
  state.instrument?.dispose();
  state.send.dispose();
  state.channel.dispose();
}

async function defaultGraphFactoryProvider(): Promise<ToneGraphFactory> {
  const tone = await import('tone');
  const wrap = (label: string, raw: unknown, disposable = true): GraphNode => ({
    label,
    raw,
    connect(destination) {
      (raw as { connect(target: unknown): unknown }).connect(destination.raw);
    },
    dispose() {
      if (disposable) (raw as { dispose(): void }).dispose();
    },
  });
  return {
    destination: () => wrap('destination', tone.getDestination(), false),
    compressor: () => wrap('master:compressor', new tone.Compressor(MASTER_COMPRESSOR)),
    limiter: (ceilingDb) => wrap('master:limiter', new tone.Limiter(ceilingDb)),
    reverb: () => wrap('master:reverb', new tone.Reverb(MASTER_REVERB)),
    channel: (track) => {
      const raw = new tone.Channel({
        volume: track.volume_db,
        pan: track.pan,
        mute: track.mute,
        solo: track.solo,
      });
      return {
        ...wrap(`channel:${track.id}`, raw),
        setMix(next) {
          raw.volume.value = next.volume_db;
          raw.pan.value = next.pan;
          raw.mute = next.mute;
          raw.solo = next.solo;
        },
      };
    },
    send: (gain, trackId) => wrap(`send:${trackId}`, new tone.Gain(gain)),
    part: (trackId, events, callback) => {
      const raw = new tone.Part<PartEvent>((time, event) => callback(time, event), [...events]);
      return {
        label: `part:${trackId}`,
        events,
        start() {
          raw.start(0);
        },
        dispose() {
          raw.dispose();
        },
      };
    },
    setTransportBpm: (bpm) => {
      tone.getTransport().bpm.value = bpm;
    },
  };
}
