/** Tone.Transport facade: the only tool-facing route to playback (plan Architecture item 4). */
import type { SongDocument } from '../song/types.ts';
import { ToolError } from '../webmcp/envelope.ts';
import type { AudioContextManager } from './context.ts';

export interface TransportLoop {
  bar_from: number;
  bar_to: number;
}

export interface PlayOptions {
  from_bar?: number;
  loop?: TransportLoop;
}

export interface TransportSnapshot {
  playing: boolean;
  position_bar: number;
  loop: TransportLoop | null;
  bpm: number;
}

export interface ToneTransportLike {
  bpm: { value: number };
  position: unknown;
  loop: boolean;
  loopStart: unknown;
  loopEnd: unknown;
  state: string;
  start(time?: string | number, offset?: string | number): unknown;
  stop(time?: string | number): unknown;
}

export interface SongTransport {
  play(song: SongDocument, options?: PlayOptions): Promise<TransportSnapshot>;
  stop(): Promise<TransportSnapshot>;
  syncTempo(bpm: number): Promise<void>;
  getSnapshot(): TransportSnapshot;
}

export type ToneTransportProvider = () => Promise<ToneTransportLike>;

/** Creates a transport facade without importing Tone or creating audio until it is used. */
export function createSongTransport(
  audio: AudioContextManager,
  provideTransport: ToneTransportProvider = defaultTransportProvider,
): SongTransport {
  let toneTransport: ToneTransportLike | null = null;
  let snapshot: TransportSnapshot = { playing: false, position_bar: 1, loop: null, bpm: 90 };

  const getTransport = async (): Promise<ToneTransportLike> => {
    toneTransport ??= await provideTransport();
    return toneTransport;
  };

  return {
    async play(song, options = {}) {
      audio.requireRunning();
      const fromBar = options.from_bar ?? 1;
      validateBar(song, fromBar);
      if (options.loop) validateLoop(song, options.loop);
      const transport = await getTransport();
      transport.bpm.value = song.bpm;
      transport.position = barPosition(fromBar);
      transport.loop = options.loop !== undefined;
      if (options.loop) {
        transport.loopStart = barPosition(options.loop.bar_from);
        transport.loopEnd = barPosition(options.loop.bar_to + 1);
      }
      transport.start();
      snapshot = {
        playing: true,
        position_bar: fromBar,
        loop: options.loop ? { ...options.loop } : null,
        bpm: song.bpm,
      };
      return snapshot;
    },
    async stop() {
      if (!toneTransport) return snapshot;
      const transport = await getTransport();
      transport.stop();
      snapshot = { ...snapshot, playing: false, position_bar: positionBar(transport.position) };
      return snapshot;
    },
    async syncTempo(bpm) {
      if (bpm < 40 || bpm > 220) {
        throw new ToolError('OUT_OF_RANGE', 'Tempo must be between 40 and 220 bpm.', true);
      }
      const transport = await getTransport();
      transport.bpm.value = bpm;
      snapshot = { ...snapshot, bpm };
    },
    getSnapshot() {
      if (!toneTransport) return snapshot;
      return {
        ...snapshot,
        playing: toneTransport.state === 'started',
        position_bar: positionBar(toneTransport.position),
      };
    },
  };
}

/** Converts one-based bars to Tone's zero-based transport position. */
export function barPosition(bar: number): string {
  return `${bar - 1}:0:0`;
}

/** Reads the one-based bar from a Tone position. */
export function positionBar(position: unknown): number {
  if (typeof position === 'number') return Math.floor(position) + 1;
  if (typeof position !== 'string') return 1;
  const bars = Number.parseInt(position.split(':')[0] ?? '0', 10);
  return Number.isFinite(bars) ? bars + 1 : 1;
}

async function defaultTransportProvider(): Promise<ToneTransportLike> {
  const tone = await import('tone');
  return tone.getTransport();
}

function validateBar(song: SongDocument, bar: number): void {
  if (!Number.isInteger(bar) || bar < 1 || bar > song.bars) {
    throw new ToolError('OUT_OF_RANGE', `Choose a bar from 1 to ${song.bars}.`, true);
  }
}

function validateLoop(song: SongDocument, loop: TransportLoop): void {
  validateBar(song, loop.bar_from);
  validateBar(song, loop.bar_to);
  if (loop.bar_to < loop.bar_from) {
    throw new ToolError('INVALID_ARGUMENT', 'Loop end must not be before loop start.', true);
  }
}
