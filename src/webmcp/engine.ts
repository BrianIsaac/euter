/**
 * The engine the shell and the tools share (plan Architecture items 1-6): lane A's song store,
 * audio context, transport, metronome, reconciler and export jobs, wired to lane B's recorder,
 * played-note input and take requests. Tools reach audio only through this object; the document is
 * the authority and the graph is reconciled from it.
 */
import { createAudioContextManager, type AudioContextManager } from '../audio/context.ts';
import { encodeMidi } from '../audio/encoders/midi.ts';
import { encodeMp3 } from '../audio/encoders/mp3.ts';
import { encodeWav } from '../audio/encoders/wav.ts';
import {
  INSTRUMENT_CATALOGUE,
  loadInstrument,
  type AudioInstrument,
} from '../audio/instruments.ts';
import { ExportJobManager, type ExportJob } from '../audio/jobs.ts';
import { createMetronome, type Metronome } from '../audio/metronome.ts';
import { createAudioReconciler, type AudioReconciler } from '../audio/reconciler.ts';
import { analyseAudioBuffer, type LoudnessReading } from '../audio/loudness.ts';
import { renderSong } from '../audio/render.ts';
import { createSongTransport, type PlayOptions, type SongTransport } from '../audio/transport.ts';
import { importAudioFile, type ImportedAudio } from '../input/importFile.ts';
import { PlayedNoteRecorder, type PlayedNoteSink } from '../input/musicalTyping.ts';
import {
  RecorderController,
  type RecordedTake,
  type RecorderResult,
  type RecorderSnapshot,
  type StartRecordingOptions,
} from '../input/recorder.ts';
import { armedTakeRequestFromSong, type ArmedTakeRequest } from '../input/requestTake.ts';
import type { RecorderAudioContext, TransportPort } from '../input/transportPort.ts';
import { createSongReducer } from '../song/reducer.ts';
import {
  createSongPersistence,
  loadExampleSong,
  loadSong,
  type SongPersistence,
} from '../song/serialise.ts';
import type { SongStateContext } from '../song/selectors.ts';
import { createSongStore, type SongStore } from '../song/store.ts';
import type { SongDocument, Take, TeachingOption, TeachingOptionSet } from '../song/types.ts';
import { createCaptureReducer } from './captureReducer.ts';
import { ToolError } from './envelope.ts';
import type { EnvironmentStore } from './environment.ts';
import { applyOptionPreview, createPlaybackView, type PlaybackView } from './preview.ts';

export type ExportFormat = 'wav' | 'mp3' | 'midi';

export interface ExportResult {
  download_url: string;
  filename: string;
  duration_s: number;
  peak_dbfs: number | null;
  bytes: number;
}

export interface RecorderPort {
  getSnapshot(): RecorderSnapshot;
  subscribe(listener: () => void): () => void;
  start(options: StartRecordingOptions): Promise<RecorderResult<RecorderSnapshot>>;
  stop(): Promise<RecorderResult<RecordedTake>>;
}

export interface AuditionResult {
  set: TeachingOptionSet;
  option: TeachingOption;
}

export interface EngineSnapshot {
  audio: { state: string; running: boolean };
  playing: boolean;
  recording: RecorderSnapshot;
  jobs: readonly ExportJob[];
  preview: { option_id: string; label: string } | null;
  loading: Record<string, number>;
  fallbacks: Record<string, string>;
}

export interface Exporters {
  render: typeof renderSong;
  wav: typeof encodeWav;
  mp3: typeof encodeMp3;
  midi: typeof encodeMidi;
}

export interface EngineOptions {
  document?: SongDocument | undefined;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null | undefined;
  environment?: EnvironmentStore | undefined;
  audio?: AudioContextManager | undefined;
  transport?: SongTransport | undefined;
  metronome?: Metronome | undefined;
  jobs?: ExportJobManager | undefined;
  recorder?: RecorderPort | undefined;
  keyboardInstrument?: string | null | undefined;
  createReconciler?:
    ((view: PlaybackView, audio: AudioContextManager) => AudioReconciler) | undefined;
  exporters?: Partial<Exporters> | undefined;
  createObjectUrl?: ((blob: Blob) => string) | undefined;
  revokeObjectUrl?: ((url: string) => void) | undefined;
  makeId?: ((prefix: string) => string) | undefined;
  delay?: ((ms: number) => Promise<void>) | undefined;
}

export interface Engine {
  readonly store: SongStore;
  readonly audio: AudioContextManager;
  readonly transport: SongTransport;
  readonly metronome: Metronome;
  readonly jobs: ExportJobManager;
  readonly recorder: RecorderPort;
  readonly keys: PlayedNoteRecorder;
  readonly playback: PlaybackView;
  readonly transportPort: TransportPort;
  /** Creates the audio context inside a click handler and resolves once it is running. */
  activate(): Promise<void>;
  reconciler(): AudioReconciler | null;
  recordingTrackId(): string | null;
  takeRequest(): ArmedTakeRequest | null;
  pendingTake(): Take | null;
  setPendingTake(takeId: string | null): void;
  addTake(take: Take, why: string, source: 'human' | 'agent'): void;
  makeId(prefix: string): string;
  play(options?: PlayOptions): Promise<{ playing: boolean; position_bar: number }>;
  stop(): Promise<{ playing: boolean; position_bar: number }>;
  audition(optionId: string): Promise<AuditionResult>;
  clearPreview(): void;
  startExport(format: ExportFormat, barFrom: number, barTo: number): ExportJob;
  exportResult(jobId: string): ExportResult | null;
  importFile(file: File): Promise<ImportedAudio>;
  loadExample(): void;
  stateContext(): SongStateContext;
  getSnapshot(): EngineSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

const KEYBOARD_NOTE_SECONDS = 1.2;

/**
 * Builds the engine.
 *
 * @param options - Seams for tests; the defaults are the real audio stack.
 * @returns The engine, with no browser audio created until `activate` runs.
 */
export function createEngine(options: EngineOptions = {}): Engine {
  const makeId =
    options.makeId ?? ((prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`);
  const delay =
    options.delay ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }));
  const audio = options.audio ?? createAudioContextManager();
  const transport = options.transport ?? createSongTransport(audio);
  const metronome = options.metronome ?? createMetronome();
  const jobs = options.jobs ?? new ExportJobManager(() => makeId('job'));
  const exporters: Exporters = {
    render: options.exporters?.render ?? renderSong,
    wav: options.exporters?.wav ?? encodeWav,
    mp3: options.exporters?.mp3 ?? encodeMp3,
    midi: options.exporters?.midi ?? encodeMidi,
  };
  const createObjectUrl = options.createObjectUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectUrl = options.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url));

  let recorderPort: RecorderPort | null = null;
  const recordingTrackId = (): string | null => {
    const snapshot = recorderPort?.getSnapshot();
    if (!snapshot) return null;
    return snapshot.status === 'recording' || snapshot.status === 'counting-in'
      ? snapshot.trackId
      : null;
  };

  const initial =
    options.document ?? (options.storage ? loadSong(options.storage) : null) ?? loadExampleSong();
  const store = createSongStore(
    initial,
    createCaptureReducer(createSongReducer({ recordingTrackId, idFactory: makeId })),
  );
  const playback = createPlaybackView(store);

  const transportPort: TransportPort = {
    getAudioContext: () => audio.getContext() as RecorderAudioContext | null,
    getBpm: () => store.getDocument().bpm,
    getTimeSignature: () => store.getDocument().time_sig,
    getPositionSeconds: () => audio.getContext()?.currentTime ?? 0,
    async countIn({ bars, metronome: click }) {
      const bpm = store.getDocument().bpm;
      const beatsPerBar = store.getDocument().time_sig[0];
      const durationSeconds = (bars * beatsPerBar * 60) / bpm;
      if (!click) {
        await delay(durationSeconds * 1000);
        return { durationSeconds };
      }
      await new Promise<void>((resolve) => {
        void metronome
          .scheduleCountIn({ bars, bpm, beatsPerBar, continueClick: true, onComplete: resolve })
          .catch(() => resolve());
      });
      return { durationSeconds };
    },
  };

  let keyboardInstrument: AudioInstrument | null = null;
  const keyboardSink: PlayedNoteSink = {
    noteOn(pitch, velocity) {
      const context = audio.getContext();
      if (!context || keyboardInstrument === null) return;
      keyboardInstrument.trigger(pitch, context.currentTime, KEYBOARD_NOTE_SECONDS, velocity);
    },
    noteOff() {
      /* The sampled keyboard voices decay on their own; there is no note-off to send. */
    },
  };
  const keys = new PlayedNoteRecorder(transportPort, keyboardSink);
  const recorder = options.recorder ?? new RecorderController(transportPort);
  recorderPort = recorder;

  const persistence: SongPersistence | null = options.storage
    ? createSongPersistence(store, options.storage)
    : null;

  let reconciler: AudioReconciler | null = null;
  let activation: Promise<void> | null = null;
  let previewSequence = 0;
  let preview: { option_id: string; label: string } | null = null;
  let pendingTakeId: string | null = null;
  let snapshot: EngineSnapshot | null = null;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    snapshot = null;
    for (const listener of listeners) listener();
  };
  const stopJobs = jobs.subscribe(() => notify());
  const stopRecorder = recorder.subscribe(() => notify());
  const stopAudio = audio.subscribe(() => notify());

  const startInstrument = async (): Promise<void> => {
    const id =
      options.keyboardInstrument === undefined ? 'grand-piano' : options.keyboardInstrument;
    if (id === null || keyboardInstrument !== null) return;
    const context = audio.getContext();
    if (!context) return;
    const loaded = await loadInstrument(id, { context, destination: null });
    keyboardInstrument = loaded.instrument;
    notify();
  };

  const activate = (): Promise<void> => {
    if (activation) return activation;
    // The reconciler is built only after `activateFromGesture` resolves, because that is where
    // lane A hands our AudioContext to Tone. Building it earlier is a race: on a gesture the
    // context is already running, so the reconciler would ask Tone for a destination before
    // `setContext`, Tone would answer from its own default context, and smplr's native nodes
    // could not connect to it ("Overload resolution failed"). Measured in Chrome 151, 27 Aug.
    const running = audio.activateFromGesture();
    activation = running.then(async () => {
      reconciler ??= (options.createReconciler ?? createAudioReconciler)(playback, audio);
      reconciler.reconcile();
      await startInstrument().catch(() => undefined);
      notify();
    });
    return activation;
  };

  const requireOption = (optionId: string): AuditionResult => {
    const song = store.getDocument();
    const set = song.option_sets.find((candidate) =>
      candidate.options.some(({ id }) => id === optionId),
    );
    const option = set?.options.find(({ id }) => id === optionId);
    if (!set || !option) {
      throw new ToolError(
        'INVALID_ARGUMENT',
        `Option "${optionId}" does not exist. Read get_song_state for the option ids.`,
        true,
      );
    }
    return { set, option };
  };

  /**
   * Scales a render down when it would clip, so the file the person downloads is the song rather
   * than square waves. The offline graph has no limiter (lane A, `src/audio/render.ts`); measured
   * on 27 Aug a twelve-bar WAV peaked at +6.6 dBFS.
   *
   * @param buffer - The rendered audio, scaled in place when it is over full scale.
   * @returns The loudness reading after any scaling.
   */
  const trimClipping = (buffer: AudioBuffer): LoudnessReading => {
    const before = analyseAudioBuffer(buffer);
    if (before.peak <= 1) return before;
    const gain = 0.98 / before.peak;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) data[index] = (data[index] ?? 0) * gain;
    }
    return analyseAudioBuffer(buffer);
  };

  const clearPreview = (): void => {
    if (preview === null) return;
    preview = null;
    playback.setPreview(null);
    notify();
  };

  const exports = new Map<string, ExportResult>();

  const runExport = async (
    format: ExportFormat,
    barFrom: number,
    barTo: number,
    signal: AbortSignal,
    setProgress: (value: number) => void,
  ): Promise<ExportResult> => {
    const song = store.getDocument();
    const name = `${
      song.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '') || 'euterpe'
    }`;
    if (format === 'midi') {
      const bytes = exporters.midi(song);
      setProgress(90);
      return {
        download_url: createObjectUrl(new Blob([bytes as BlobPart], { type: 'audio/midi' })),
        filename: `${name}.mid`,
        duration_s: ((barTo - barFrom + 1) * song.time_sig[0] * 60) / song.bpm,
        peak_dbfs: null,
        bytes: bytes.length,
      };
    }
    const buffer = await exporters.render(
      song,
      { start_bar: barFrom, end_bar: barTo },
      { signal, onProgress: (value) => setProgress(value * 0.7) },
    );
    setProgress(75);
    const loudness = trimClipping(buffer);
    const bytes =
      format === 'wav' ? exporters.wav(buffer) : await exporters.mp3(buffer, { signal });
    setProgress(95);
    return {
      download_url: createObjectUrl(
        new Blob([bytes as BlobPart], { type: format === 'wav' ? 'audio/wav' : 'audio/mpeg' }),
      ),
      filename: `${name}.${format === 'wav' ? 'wav' : 'mp3'}`,
      duration_s: Math.round(buffer.duration * 100) / 100,
      peak_dbfs: Number.isFinite(loudness.peak_dbfs) ? loudness.peak_dbfs : null,
      bytes: bytes.length,
    };
  };

  return {
    store,
    audio,
    transport,
    metronome,
    jobs,
    recorder,
    keys,
    playback,
    transportPort,
    activate,
    reconciler: () => reconciler,
    recordingTrackId,
    takeRequest() {
      const request = store.getDocument().take_request;
      return request === null ? null : armedTakeRequestFromSong(request);
    },
    pendingTake() {
      if (pendingTakeId === null) return null;
      return store.getDocument().takes.find(({ id }) => id === pendingTakeId) ?? null;
    },
    setPendingTake(takeId) {
      pendingTakeId = takeId;
      notify();
    },
    addTake(take, why, source) {
      store.dispatch({ type: 'add_take', args: { take }, source, why });
      pendingTakeId = take.id;
      notify();
    },
    makeId,
    async play(playOptions = {}) {
      audio.requireRunning();
      clearPreview();
      const result = await transport.play(store.getDocument(), playOptions);
      notify();
      return { playing: result.playing, position_bar: result.position_bar };
    },
    async stop() {
      const result = await transport.stop();
      clearPreview();
      notify();
      return { playing: result.playing, position_bar: result.position_bar };
    },
    async audition(optionId) {
      const { set, option } = requireOption(optionId);
      audio.requireRunning();
      previewSequence += 1;
      const document = applyOptionPreview(store.getDocument(), set, option, previewSequence);
      playback.setPreview(document);
      preview = { option_id: option.id, label: option.label };
      await transport.play(document, {
        from_bar: set.bar_from,
        loop: { bar_from: set.bar_from, bar_to: set.bar_to },
      });
      notify();
      return { set, option };
    },
    clearPreview,
    startExport(format, barFrom, barTo) {
      return jobs.start(
        format === 'midi' ? 'midi' : format === 'mp3' ? 'mp3' : 'wav',
        async (job) => {
          const result = await runExport(format, barFrom, barTo, job.signal, job.setProgress);
          return result;
        },
      );
    },
    exportResult(jobId) {
      const job = jobs.get<ExportResult>(jobId);
      if (job?.state !== 'completed' || !job.result) return exports.get(jobId) ?? null;
      exports.set(jobId, job.result);
      return job.result;
    },
    async importFile(file) {
      await activate();
      const context = audio.requireRunning();
      const result = await importAudioFile(file, context, {
        id: makeId('take'),
        bpm: store.getDocument().bpm,
      });
      if (!result.ok) {
        throw new ToolError('INVALID_ARGUMENT', result.message, true);
      }
      return result.data;
    },
    loadExample() {
      const before = store.getDocument();
      const example = loadExampleSong();
      const result = store.dispatch({
        type: '__restore_snapshot',
        args: { document: example, summary: 'Loaded the example song' },
        source: 'human',
      });
      store.history.record(before, store.getDocument(), result.summary);
      pendingTakeId = null;
      notify();
    },
    stateContext() {
      const audioSnapshot = audio.getSnapshot();
      const transportSnapshot = transport.getSnapshot();
      const microphone = options.environment?.get().permissions.microphone ?? 'unknown';
      return {
        instrument_names: INSTRUMENT_CATALOGUE.map(({ id }) => id),
        transport: {
          playing: transportSnapshot.playing,
          position_bar: transportSnapshot.position_bar,
          ...(transportSnapshot.loop
            ? {
                loop: [transportSnapshot.loop.bar_from, transportSnapshot.loop.bar_to] as [
                  number,
                  number,
                ],
              }
            : {}),
        },
        audio: {
          state: audioSnapshot.state === 'running' ? 'running' : 'locked',
          microphone,
        },
        jobs: jobs
          .list()
          .filter(({ state }) => state === 'queued' || state === 'running')
          .map(({ id, kind, state, progress_pct }) => ({ id, kind, state, progress_pct })),
      };
    },
    getSnapshot() {
      snapshot ??= {
        audio: {
          state: audio.getSnapshot().state,
          running: audio.getSnapshot().state === 'running',
        },
        playing: transport.getSnapshot().playing,
        recording: recorder.getSnapshot(),
        jobs: jobs.list(),
        preview,
        loading: reconciler?.getSnapshot().loading ?? {},
        fallbacks: reconciler?.getSnapshot().fallbacks ?? {},
      };
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      stopJobs();
      stopRecorder();
      stopAudio();
      persistence?.dispose();
      playback.dispose();
      reconciler?.dispose();
      keyboardInstrument?.dispose();
      metronome.dispose();
      for (const { download_url } of exports.values()) revokeObjectUrl(download_url);
      exports.clear();
      listeners.clear();
    },
  };
}
