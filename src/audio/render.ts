import type { Note, SongDocument } from '../song/types.ts';

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

export interface OfflineRenderRequest {
  duration_seconds: number;
  sample_rate: number;
  channels: number;
  notes: readonly OfflineNoteEvent[];
}

export interface OfflineRenderEngine {
  render(request: OfflineRenderRequest): Promise<AudioBuffer>;
}

export interface RenderOptions {
  signal?: AbortSignal | undefined;
  sample_rate?: number | undefined;
  onProgress?: ((progressPercent: number) => void) | undefined;
  engine?: OfflineRenderEngine | undefined;
}

/** Renders an inclusive bar range plus its release tail with Tone.Offline. */
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
  const notes = song.tracks.flatMap((track) =>
    track.notes
      .filter((note) => note.s < endBeat && note.s + note.d > startBeat)
      .map((note) => renderEvent(note, startBeat, endBeat, secondsPerBeat)),
  );
  const tail = range.tail_seconds ?? 2;
  const request: OfflineRenderRequest = {
    duration_seconds: (endBeat - startBeat) * secondsPerBeat + tail,
    sample_rate: options.sample_rate ?? 44_100,
    channels: 2,
    notes,
  };
  progress(10);
  const buffer = await (options.engine ?? DEFAULT_OFFLINE_ENGINE).render(request);
  throwIfAborted(options.signal);
  progress(100);
  return buffer;
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

const DEFAULT_OFFLINE_ENGINE: OfflineRenderEngine = {
  async render(request) {
    const tone = await import('tone');
    const result = await tone.Offline(
      async () => {
        const synth = new tone.PolySynth(tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.005, decay: 0.08, sustain: 0.45, release: 0.8 },
        }).toDestination();
        for (const note of request.notes) {
          synth.triggerAttackRelease(
            tone.Frequency(note.pitch, 'midi').toNote(),
            note.duration_seconds,
            note.time_seconds,
            note.velocity,
          );
        }
      },
      request.duration_seconds,
      request.channels,
      request.sample_rate,
    );
    const buffer = result.get();
    if (!buffer) throw new Error('Tone.Offline completed without an AudioBuffer.');
    return buffer;
  },
};
