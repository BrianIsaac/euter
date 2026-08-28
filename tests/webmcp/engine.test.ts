import { describe, expect, it, vi } from 'vitest';
import {
  renderSong,
  type OfflineRenderEngine,
  type RenderOptions,
} from '../../src/audio/render.ts';
import { createEmptySong } from '../../src/song/types.ts';
import { ToolError } from '../../src/webmcp/envelope.ts';
import {
  createTestEngine,
  fakeAudio,
  fakeAudioBuffer,
  fakeMetronome,
  fakeTransport,
  makeTake,
} from '../helpers/harness.ts';

async function settle(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('engine', () => {
  it('refuses to play before a gesture and plays after one', async () => {
    const audio = fakeAudio('uninitialised');
    const { engine } = createTestEngine({ audio });
    await expect(engine.play()).rejects.toMatchObject({ code: 'AUDIO_LOCKED' });

    await engine.activate();
    expect(audio.activations).toBe(1);
    const result = await engine.play({ from_bar: 2 });
    expect(result).toEqual({ playing: true, position_bar: 2 });
    expect(engine.getSnapshot().playing).toBe(true);
    engine.dispose();
  });

  it('creates the reconciler on the first gesture and reconciles once running', async () => {
    const { engine } = createTestEngine({ audio: fakeAudio('uninitialised') });
    expect(engine.reconciler()).toBeNull();
    await engine.activate();
    expect(engine.reconciler()).not.toBeNull();
    await engine.activate();
    expect(engine.audio.getSnapshot().state).toBe('running');
    engine.dispose();
  });

  it('releases live audio, capture and render resources when disposed', async () => {
    const audio = fakeAudio('uninitialised');
    const close = vi.spyOn(audio, 'close');
    const render = vi.fn(
      (_song: unknown, _range: unknown, options?: RenderOptions): Promise<AudioBuffer> =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
            once: true,
          });
        }),
    );
    const { engine, recorder, transport } = createTestEngine({
      audio,
      exporters: { render },
    });
    const disposeRecorder = vi.spyOn(recorder, 'dispose');
    const stopTransport = vi.spyOn(transport, 'stop');
    await engine.activate();
    await recorder.start({ countInBars: 1, metronome: true });
    const job = engine.startExport('wav', 1, 8);
    await settle();
    expect(engine.jobs.get(job.id)?.state).toBe('running');

    engine.dispose();

    expect(close).toHaveBeenCalledTimes(1);
    expect(stopTransport).toHaveBeenCalledTimes(1);
    expect(disposeRecorder).toHaveBeenCalledTimes(1);
    expect(recorder.getSnapshot().status).toBe('idle');
    expect(engine.jobs.get(job.id)?.state).toBe('cancelled');
  });

  it('lands a take, remembers it as pending and clears it on demand', () => {
    const { engine } = createTestEngine();
    engine.addTake(makeTake('take-x'), 'Saved your hum.', 'agent');
    expect(engine.pendingTake()?.id).toBe('take-x');
    expect(engine.store.getDocument().takes).toHaveLength(1);
    engine.setPendingTake(null);
    expect(engine.pendingTake()).toBeNull();
    engine.dispose();
  });

  it('locks the recorded track while the recorder is running', async () => {
    const { engine, recorder } = createTestEngine();
    expect(engine.recordingTrackId()).toBeNull();
    await recorder.start({ trackId: 'melody', countInBars: 1, metronome: true });
    expect(engine.recordingTrackId()).toBe('melody');
    expect(() =>
      engine.store.dispatch({
        type: 'set_notes',
        args: { track_id: 'melody', bar_from: 1, notes: [], replace: true },
        source: 'agent',
        why: 'Writing over the hum.',
      }),
    ).toThrow(/RECORDING|being recorded/u);
    engine.dispose();
  });

  it('reads an armed take request from the document', () => {
    const { engine } = createTestEngine();
    expect(engine.takeRequest()).toBeNull();
    engine.store.dispatch({
      type: 'request_take',
      args: { track_id: 'bass', bar_from: 5, bar_to: 8, prompt: 'Hum me a bassline' },
      source: 'agent',
      why: 'You should own the bassline.',
    });
    expect(engine.takeRequest()).toMatchObject({
      trackId: 'bass',
      prompt: 'Hum me a bassline',
      targetBars: { barFrom: 5, barTo: 8 },
    });
    engine.dispose();
  });

  it('plays arranged backing from bar four while muting the requested track for bars five-eight', async () => {
    const { engine, transport } = createTestEngine();
    const result = await engine.transportPort.countIn({
      bars: 1,
      metronome: true,
      targetBar: 5,
      mutedTrackId: 'bass',
    });

    expect(transport.calls.play.at(-1)).toEqual({ from_bar: 4 });
    expect(engine.playback.getPreview()?.tracks.find(({ id }) => id === 'bass')).toMatchObject({
      mute: true,
      solo: false,
    });
    expect(engine.playback.getPreview()?.tracks.find(({ id }) => id === 'melody')?.mute).toBe(
      false,
    );

    result.finish?.();
    await settle();
    expect(transport.calls.stop).toBe(1);
    expect(engine.playback.getPreview()).toBeNull();
    engine.dispose();
  });

  it('waits out an early-bar count-in before starting backing on the requested bar', async () => {
    let complete: (() => void) | undefined;
    const metronome = fakeMetronome();
    vi.spyOn(metronome, 'scheduleCountIn').mockImplementationOnce((options) => {
      complete = options.onComplete;
      return Promise.resolve({ duration_s: 2, cancel: vi.fn() });
    });
    const { engine, transport } = createTestEngine({ metronome });

    const counting = engine.transportPort.countIn({
      bars: 1,
      metronome: true,
      targetBar: 1,
      mutedTrackId: 'bass',
    });
    await settle();
    expect(transport.calls.play).toEqual([]);

    complete?.();
    const result = await counting;
    expect(transport.calls.play).toEqual([{ from_bar: 1 }]);
    result.finish?.();
    engine.dispose();
  });

  it('rolls back clicks and the detached preview when backing startup fails', async () => {
    const audio = fakeAudio();
    const transport = fakeTransport(audio);
    vi.spyOn(transport, 'play').mockRejectedValueOnce(new Error('Tone transport failed'));
    const metronome = fakeMetronome();
    const stopMetronome = vi.spyOn(metronome, 'stop');
    const { engine } = createTestEngine({ audio, transport, metronome });

    await expect(
      engine.transportPort.countIn({
        bars: 1,
        metronome: true,
        targetBar: 5,
        mutedTrackId: 'bass',
      }),
    ).rejects.toThrow('Tone transport failed');

    expect(stopMetronome).toHaveBeenCalledOnce();
    expect(engine.playback.getPreview()).toBeNull();
    engine.dispose();
  });

  it('cancels backing and its wait when the recorder aborts during count-in', async () => {
    let releaseDelay: (() => void) | undefined;
    const delay = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseDelay = resolve;
        }),
    );
    const { engine, transport } = createTestEngine({ delay });
    const controller = new AbortController();
    const counting = engine.transportPort.countIn({
      bars: 1,
      metronome: false,
      targetBar: 5,
      mutedTrackId: 'bass',
      signal: controller.signal,
    });
    await settle();
    expect(engine.playback.getPreview()).not.toBeNull();

    controller.abort(new DOMException('Take stopped.', 'AbortError'));
    releaseDelay?.();

    await expect(counting).rejects.toMatchObject({ name: 'AbortError' });
    expect(transport.calls.stop).toBe(1);
    expect(engine.playback.getPreview()).toBeNull();
    engine.dispose();
  });

  it('stops a backing start that resolves after the count-in was cancelled', async () => {
    const audio = fakeAudio();
    const transport = fakeTransport(audio);
    const play = transport.play.bind(transport);
    let releaseStart: (() => void) | undefined;
    vi.spyOn(transport, 'play').mockImplementation(async (song, options) => {
      await new Promise<void>((resolve) => {
        releaseStart = resolve;
      });
      return play(song, options);
    });
    const { engine } = createTestEngine({ audio, transport });
    const controller = new AbortController();
    const counting = engine.transportPort.countIn({
      bars: 1,
      metronome: false,
      targetBar: 5,
      mutedTrackId: 'bass',
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(transport.play).toHaveBeenCalledOnce());

    controller.abort(new DOMException('Take stopped.', 'AbortError'));
    releaseStart?.();

    await expect(counting).rejects.toMatchObject({ name: 'AbortError' });
    expect(transport.getSnapshot().playing).toBe(false);
    expect(engine.playback.getPreview()).toBeNull();
    engine.dispose();
  });

  it('clears metronome work that finishes scheduling after cancellation', async () => {
    let scheduled = false;
    let releaseSchedule: (() => void) | undefined;
    const metronome = fakeMetronome();
    vi.spyOn(metronome, 'scheduleCountIn').mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSchedule = () => {
            scheduled = true;
            resolve({ duration_s: 2, cancel: vi.fn() });
          };
        }),
    );
    vi.spyOn(metronome, 'stop').mockImplementation(() => {
      scheduled = false;
    });
    const { engine } = createTestEngine({ metronome });
    const controller = new AbortController();
    const counting = engine.transportPort.countIn({
      bars: 1,
      metronome: true,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(metronome.scheduleCountIn).toHaveBeenCalledOnce());

    controller.abort(new DOMException('Take stopped.', 'AbortError'));
    releaseSchedule?.();

    await expect(counting).rejects.toMatchObject({ name: 'AbortError' });
    expect(scheduled).toBe(false);
    engine.dispose();
  });

  it('auditions an option through the preview document and reverts on stop', async () => {
    const { engine, transport } = createTestEngine();
    await engine.activate();
    engine.store.dispatch({
      type: 'propose_options',
      args: {
        kind: 'chords',
        bar_from: 1,
        bar_to: 4,
        options: [
          { label: 'Softer', why: 'It stays calm.', chords: [{ bar: 1, symbol: 'Am7' }] },
          { label: 'Brighter', why: 'It lifts.', chords: [{ bar: 1, symbol: 'F' }] },
        ],
      },
      source: 'agent',
      why: 'Two ways into the verse.',
    });
    const optionId = engine.store.getDocument().option_sets[0]?.options[0]?.id ?? '';
    const revision = engine.store.getDocument().revision;
    const audition = await engine.audition(optionId);

    expect(audition.option.label).toBe('Softer');
    expect(engine.playback.getPreview()?.chords[0]?.symbol).toBe('Am7');
    expect(engine.store.getDocument().chords[0]?.symbol).toBe('C');
    expect(engine.store.getDocument().revision).toBe(revision);
    expect(transport.calls.play.at(-1)).toEqual({
      from_bar: 1,
      loop: { bar_from: 1, bar_to: 4 },
    });
    expect(engine.getSnapshot().preview).toEqual({ option_id: optionId, label: 'Softer' });

    await engine.stop();
    expect(engine.playback.getPreview()).toBeNull();
    expect(engine.getSnapshot().preview).toBeNull();
    await expect(engine.audition('option-nope')).rejects.toBeInstanceOf(ToolError);
    engine.dispose();
  });

  it('runs an export job to a download url and reports it once', async () => {
    const { engine } = createTestEngine();
    const job = engine.startExport('wav', 1, 8);
    expect(job.state).toBe('queued');
    await settle();
    const done = engine.jobs.get(job.id);
    expect(done?.state).toBe('completed');
    const result = engine.exportResult(job.id);
    expect(result).toMatchObject({ filename: 'first-light.wav', bytes: 4 });
    expect(result?.download_url).toMatch(/^blob:euter\//u);
    expect(result?.peak_dbfs).toBeCloseTo(-12.04, 1);
    engine.dispose();
  });

  it('carries an offline sample fallback into the completed job result', async () => {
    const offline: OfflineRenderEngine = {
      render: () =>
        Promise.resolve({
          buffer: fakeAudioBuffer(),
          fallbacks: ['Harmony: remote samples failed; playing Grand piano instead.'],
        }),
    };
    const { engine } = createTestEngine({
      exporters: {
        render: (song, range, options) => renderSong(song, range, { ...options, engine: offline }),
      },
    });
    const job = engine.startExport('wav', 1, 8);
    await settle();

    expect(engine.exportResult(job.id)?.fallbacks).toEqual([
      'Harmony: remote samples failed; playing Grand piano instead.',
    ]);
    engine.dispose();
  });

  it('scales a render down when the offline graph would clip', async () => {
    const loud = fakeAudioBuffer();
    loud.getChannelData(0).fill(2.4);
    loud.getChannelData(1).fill(2.4);
    const { engine } = createTestEngine({ exporters: { render: () => Promise.resolve(loud) } });
    const job = engine.startExport('wav', 1, 8);
    await settle();
    const result = engine.exportResult(job.id);
    expect(result?.peak_dbfs).toBeLessThanOrEqual(0);
    expect(loud.getChannelData(0)[0]).toBeCloseTo(0.98, 5);
    engine.dispose();
  });

  it('leaves a render that fits alone', async () => {
    const quiet = fakeAudioBuffer();
    quiet.getChannelData(0).fill(0.5);
    quiet.getChannelData(1).fill(0.5);
    const { engine } = createTestEngine({ exporters: { render: () => Promise.resolve(quiet) } });
    const job = engine.startExport('wav', 1, 8);
    await settle();
    expect(quiet.getChannelData(0)[0]).toBe(0.5);
    expect(engine.exportResult(job.id)?.peak_dbfs).toBeCloseTo(-6.02, 1);
    engine.dispose();
  });

  it('exports MIDI without rendering audio', async () => {
    const render = vi.fn(() => Promise.resolve(fakeAudioBuffer()));
    const midi = vi.fn(() => new Uint8Array([77, 84, 104, 100]));
    const { engine } = createTestEngine({ exporters: { render, midi } });
    const job = engine.startExport('midi', 5, 8);
    await settle();
    expect(render).not.toHaveBeenCalled();
    expect(midi).toHaveBeenCalledWith(engine.store.getDocument(), {
      start_bar: 5,
      end_bar: 8,
    });
    expect(engine.exportResult(job.id)?.filename).toBe('first-light.mid');
    engine.dispose();
  });

  it('cancels a running export through the job manager', async () => {
    let release: () => void = () => undefined;
    const { engine } = createTestEngine({
      exporters: {
        render: () =>
          new Promise((resolve) => {
            release = () => resolve(fakeAudioBuffer());
          }),
      },
    });
    const job = engine.startExport('wav', 1, 8);
    await settle();
    expect(engine.jobs.get(job.id)?.state).toBe('running');
    expect(engine.jobs.cancel(job.id)).toBe(true);
    release();
    await settle();
    expect(engine.jobs.get(job.id)?.state).toBe('cancelled');
    engine.dispose();
  });

  it('completes two simultaneous renders of an empty song as silent files', async () => {
    const silence = fakeAudioBuffer();
    silence.getChannelData(0).fill(0);
    silence.getChannelData(1).fill(0);
    const { engine } = createTestEngine({
      document: createEmptySong('Silence'),
      exporters: { render: () => Promise.resolve(silence) },
    });

    const first = engine.startExport('wav', 1, 8);
    const second = engine.startExport('wav', 1, 8);
    await settle();

    expect(engine.jobs.get(first.id)?.state).toBe('completed');
    expect(engine.jobs.get(second.id)?.state).toBe('completed');
    expect(engine.exportResult(first.id)?.peak_dbfs).toBeNull();
    expect(engine.exportResult(second.id)?.peak_dbfs).toBeNull();
    engine.dispose();
  });

  it('reports the state the agent reads in get_song_state', async () => {
    const { engine } = createTestEngine();
    await engine.activate();
    await engine.play({ from_bar: 3 });
    const context = engine.stateContext();
    expect(context.audio).toEqual({ state: 'running', microphone: 'unknown' });
    expect(context.transport).toMatchObject({ playing: true, position_bar: 3 });
    expect(context.instrument_names).toContain('grand-piano');
    engine.startExport('wav', 1, 8);
    expect(engine.stateContext().jobs?.length).toBe(1);
    engine.dispose();
  });

  it('loads the example song as an undoable replacement of unsaved work', () => {
    const { engine } = createTestEngine();
    engine.store.dispatch({
      type: 'set_tempo',
      args: { bpm: 140 },
      source: 'human',
      why: 'Too fast.',
    });
    expect(engine.store.history.getPast()).toHaveLength(1);
    engine.loadExample();
    expect(engine.store.getDocument().bpm).toBe(92);
    expect(engine.store.history.getPast()).toHaveLength(2);
    expect(engine.store.undo('human')).toMatchObject({ edits: 1 });
    expect(engine.store.getDocument().bpm).toBe(140);
    engine.dispose();
  });
});
