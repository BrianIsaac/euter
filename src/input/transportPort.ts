/** Temporary Lane B boundary onto Lane A's transport (plan Architecture item 5). */

export interface RecorderAudioContext {
  readonly state: AudioContextState;
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly baseLatency: number;
  readonly outputLatency: number;
  readonly audioWorklet: Pick<AudioWorklet, 'addModule'>;
}

export interface CountInOptions {
  bars: 1 | 2;
  metronome: boolean;
  targetBar?: number;
  mutedTrackId?: string;
  /** Cancels scheduled clicks and backing when the capture is stopped before count-in completes. */
  signal?: AbortSignal;
}

export interface CountInResult {
  /** Actual capture-clock time occupied by the count-in. */
  durationSeconds: number;
  /** AudioContext time of the arranged beat where retained audio starts. */
  recordingStartContextTime: number;
  /** Stops backing/click playback and restores the normal song graph after the take. */
  finish?: (() => void) | undefined;
}

export interface TransportPort {
  getAudioContext(): RecorderAudioContext | null;
  getBpm(): number;
  getTimeSignature(): readonly [number, number];
  getPositionSeconds(): number;
  countIn(options: CountInOptions): Promise<CountInResult>;
}
