import type { Note, SongDocument, Track } from '../song/types.ts';
import type { BaseContext } from 'tone';
import type * as ToneModuleNamespace from 'tone';
import { loadInstrument, type InstrumentLoadResult } from './instruments.ts';
import {
  DEFAULT_REVERB_SEND,
  MASTER_COMPRESSOR,
  MASTER_LIMITER_CEILING_DB,
  MASTER_REVERB,
  type ChannelNode,
  type GraphNode,
  type ToneGraphFactory,
} from './reconciler.ts';

export interface RenderRange {
  start_bar: number;
  end_bar: number;
  tail_seconds?: number | undefined;
}

export interface OfflineNoteEvent {
  pitch: number;
  time_seconds: number;
  duration_seconds: number;
  velocity: number;
}

export interface OfflineTrack {
  track: Track;
  notes: readonly OfflineNoteEvent[];
}

export interface OfflineRenderRequest {
  duration_seconds: number;
  sample_rate: number;
  channels: number;
  samples_base_url?: string | undefined;
  tracks: readonly OfflineTrack[];
}

export interface OfflineRenderResult {
  buffer: AudioBuffer;
  fallbacks: readonly string[];
}

export interface OfflineRenderEngineOptions {
  signal?: AbortSignal | undefined;
  onProgress?: ((progressPercent: number) => void) | undefined;
}

export interface OfflineRenderEngine {
  render(
    request: OfflineRenderRequest,
    options?: OfflineRenderEngineOptions,
  ): Promise<OfflineRenderResult>;
}

export type OfflineGraphFactory = Pick<
  ToneGraphFactory,
  'destination' | 'compressor' | 'limiter' | 'reverb' | 'channel' | 'send'
>;

export interface OfflineToneBoundary {
  render(
    request: Pick<OfflineRenderRequest, 'duration_seconds' | 'sample_rate' | 'channels'>,
    build: (
      context: BaseAudioContext,
      graph: OfflineGraphFactory,
      toneContext?: BaseContext,
    ) => Promise<void> | void,
    options?: Pick<OfflineRenderEngineOptions, 'signal'>,
  ): Promise<AudioBuffer>;
}

export type OfflineToneModule = Pick<
  typeof ToneModuleNamespace,
  'OfflineContext' | 'Compressor' | 'Limiter' | 'Reverb' | 'Channel' | 'Gain'
>;

export interface CatalogueOfflineEngineDependencies {
  boundary?: OfflineToneBoundary | undefined;
  instrumentLoader?: typeof loadInstrument | undefined;
}

export interface RenderOptions {
  signal?: AbortSignal | undefined;
  sample_rate?: number | undefined;
  samples_base_url?: string | undefined;
  onProgress?: ((progressPercent: number) => void) | undefined;
  engine?: OfflineRenderEngine | undefined;
}

const renderFallbacks = new WeakMap<AudioBuffer, readonly string[]>();

/** Returns the audible-fallback notices produced while this buffer was rendered. */
export function getRenderFallbacks(buffer: AudioBuffer): readonly string[] {
  return renderFallbacks.get(buffer) ?? [];
}

/** Renders an inclusive bar range plus its release tail with the live instrument catalogue. */
export async function renderSong(
  song: SongDocument,
  range: RenderRange,
  options: RenderOptions = {},
): Promise<AudioBuffer> {
  validateRange(song, range);
  throwIfAborted(options.signal);
  const progress = options.onProgress ?? (() => undefined);
  progress(0);
  const beatsPerBar = song.time_sig[0];
  const startBeat = (range.start_bar - 1) * beatsPerBar;
  const endBeat = range.end_bar * beatsPerBar;
  const secondsPerBeat = 60 / song.bpm;
  const tracks = song.tracks.map((track) => ({
    track,
    notes: track.notes
      .filter((note) => note.s < endBeat && note.s + note.d > startBeat)
      .map((note) => renderEvent(note, startBeat, endBeat, secondsPerBeat)),
  }));
  const tail = range.tail_seconds ?? 2;
  const request: OfflineRenderRequest = {
    duration_seconds: (endBeat - startBeat) * secondsPerBeat + tail,
    sample_rate: options.sample_rate ?? 44_100,
    channels: 2,
    ...(options.samples_base_url === undefined
      ? {}
      : { samples_base_url: options.samples_base_url }),
    tracks,
  };
  progress(5);
  const rendering = (options.engine ?? DEFAULT_OFFLINE_ENGINE).render(request, {
    signal: options.signal,
    onProgress: (value) => progress(5 + Math.min(100, Math.max(0, value)) * 0.9),
  });
  const result = await abortable(rendering, options.signal);
  throwIfAborted(options.signal);
  limitPeak(result.buffer);
  renderFallbacks.set(result.buffer, [...result.fallbacks]);
  progress(100);
  return result.buffer;
}

/** Builds the same Channel/send/master topology and loaders as the live reconciler. */
export function createCatalogueOfflineEngine(
  dependencies: CatalogueOfflineEngineDependencies = {},
): OfflineRenderEngine {
  const boundary = dependencies.boundary ?? DEFAULT_TONE_BOUNDARY;
  const instrumentLoader = dependencies.instrumentLoader ?? loadInstrument;
  return {
    async render(request, options = {}) {
      const progress = options.onProgress ?? (() => undefined);
      const fallbacks: string[] = [];
      const trackProgress = new Map<string, number>();
      const reportLoadProgress = (trackId: string, value: number): void => {
        trackProgress.set(trackId, Math.min(1, Math.max(0, value)));
        const total = request.tracks.reduce(
          (sum, { track }) => sum + (trackProgress.get(track.id) ?? 0),
          0,
        );
        progress(request.tracks.length === 0 ? 70 : (total / request.tracks.length) * 70);
      };

      const buffer = await abortable(
        boundary.render(
          request,
          async (context, graph, toneContext) => {
            throwIfAborted(options.signal);
            const destination = graph.destination();
            const compressor = graph.compressor();
            const limiter = graph.limiter(MASTER_LIMITER_CEILING_DB);
            const reverb = graph.reverb();
            compressor.connect(limiter);
            limiter.connect(destination);
            reverb.connect(compressor);

            await Promise.all(
              request.tracks.map(async ({ track, notes }) => {
                throwIfAborted(options.signal);
                const channel = graph.channel(track);
                const send = graph.send(DEFAULT_REVERB_SEND[track.kind], track.id);
                channel.connect(compressor);
                channel.connect(send);
                send.connect(reverb);
                const result = await instrumentLoader(track.instrument, {
                  context,
                  destination: channel.raw,
                  samplesBaseUrl: request.samples_base_url,
                  toneContext,
                  onProgress: (value) => reportLoadProgress(track.id, value),
                });
                throwIfAborted(options.signal);
                if (!result.loaded && result.reason)
                  fallbacks.push(`${track.name}: ${result.reason}`);
                scheduleTrack(result, notes);
                reportLoadProgress(track.id, 1);
              }),
            );
            progress(85);
          },
          { signal: options.signal },
        ),
        options.signal,
      );
      progress(100);
      return { buffer, fallbacks };
    },
  };
}

function scheduleTrack(result: InstrumentLoadResult, notes: readonly OfflineNoteEvent[]): void {
  for (const note of notes) {
    result.instrument.trigger(note.pitch, note.time_seconds, note.duration_seconds, note.velocity);
  }
}

/** Applies a transparent whole-buffer ceiling before any audio encoder sees the render. */
function limitPeak(buffer: AudioBuffer): void {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (const sample of data) peak = Math.max(peak, Math.abs(sample));
  }
  if (peak <= 1) return;
  const gain = 0.98 / peak;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) data[index] = (data[index] ?? 0) * gain;
  }
}

function renderEvent(
  note: Note,
  startBeat: number,
  endBeat: number,
  secondsPerBeat: number,
): OfflineNoteEvent {
  const clippedStart = Math.max(startBeat, note.s);
  const clippedEnd = Math.min(endBeat, note.s + note.d);
  return {
    pitch: note.p,
    time_seconds: (clippedStart - startBeat) * secondsPerBeat,
    duration_seconds: Math.max(0.01, (clippedEnd - clippedStart) * secondsPerBeat),
    velocity: note.v,
  };
}

function validateRange(song: SongDocument, range: RenderRange): void {
  if (!Number.isInteger(range.start_bar) || !Number.isInteger(range.end_bar)) {
    throw new RangeError('Render bars must be integers.');
  }
  if (range.start_bar < 1 || range.end_bar < range.start_bar || range.end_bar > song.bars) {
    throw new RangeError(`Render range must be within bars 1-${song.bars}.`);
  }
  if ((range.tail_seconds ?? 2) < 0 || (range.tail_seconds ?? 2) > 30) {
    throw new RangeError('Render tail must be between 0 and 30 seconds.');
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Render cancelled.', 'AbortError');
}

function abortable<Result>(
  promise: Promise<Result>,
  signal: AbortSignal | undefined,
): Promise<Result> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<Result>((resolve, reject) => {
    const abort = (): void =>
      reject(signal.reason ?? new DOMException('Render cancelled.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

/**
 * Builds an explicit Tone OfflineContext so asynchronous sample loads never replace Tone's global
 * live context. Calls are serialised to keep simultaneous export jobs from multiplying decode and
 * render pressure, while every Tone node and synth remains bound to the explicit offline context.
 */
export function createToneOfflineBoundary(
  provideTone: () => Promise<OfflineToneModule> = () => import('tone'),
): OfflineToneBoundary {
  let tail: Promise<void> = Promise.resolve();
  return {
    render(request, build, options = {}) {
      const run = async (): Promise<AudioBuffer> => {
        throwIfAborted(options.signal);
        const tone = await provideTone();
        throwIfAborted(options.signal);
        const context = new tone.OfflineContext(
          request.channels,
          request.duration_seconds,
          request.sample_rate,
        );
        try {
          const reverbReady: Promise<unknown>[] = [];
          const wrap = (label: string, raw: unknown): GraphNode => ({
            label,
            raw,
            connect(destination) {
              (raw as { connect(target: unknown): unknown }).connect(destination.raw);
            },
            dispose() {
              (raw as { dispose?: () => void }).dispose?.();
            },
          });
          const graph: OfflineGraphFactory = {
            destination: () => wrap('destination', context.destination),
            compressor: () =>
              wrap('master:compressor', new tone.Compressor({ ...MASTER_COMPRESSOR, context })),
            limiter: (ceilingDb) =>
              wrap('master:limiter', new tone.Limiter({ threshold: ceilingDb, context })),
            reverb: () => {
              const raw = new tone.Reverb({ ...MASTER_REVERB, context });
              reverbReady.push(raw.ready);
              return wrap('master:reverb', raw);
            },
            channel: (track): ChannelNode => {
              const raw = new tone.Channel({
                context,
                volume: track.volume_db,
                pan: track.pan,
                mute: track.mute,
                solo: track.solo,
              });
              return {
                ...wrap(`channel:${track.id}`, raw),
                setMix() {
                  // Offline mix is immutable for the duration of one render.
                },
              };
            },
            send: (gain, trackId) => wrap(`send:${trackId}`, new tone.Gain({ gain, context })),
          };
          await build(context.rawContext as BaseAudioContext, graph, context);
          await Promise.all(reverbReady);
          throwIfAborted(options.signal);
          const result = await context.render();
          const buffer = result.get();
          if (!buffer) throw new Error('Tone.Offline completed without an AudioBuffer.');
          return buffer;
        } finally {
          context.dispose();
        }
      };
      const rendering = tail.then(run, run);
      tail = rendering.then(
        () => undefined,
        () => undefined,
      );
      return abortable(rendering, options.signal);
    },
  };
}

const DEFAULT_TONE_BOUNDARY = createToneOfflineBoundary();

const DEFAULT_OFFLINE_ENGINE = createCatalogueOfflineEngine();
