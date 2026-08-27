import { describe, expect, it, vi } from 'vitest';
import { ToolError } from '../../src/webmcp/envelope.ts';
import { createTestEngine, fakeAudio, fakeAudioBuffer, makeTake } from '../helpers/harness.ts';

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
    const { engine } = createTestEngine({ exporters: { render } });
    const job = engine.startExport('midi', 1, 8);
    await settle();
    expect(render).not.toHaveBeenCalled();
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

  it('loads the example song and clears history', () => {
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
    expect(engine.store.history.getPast()).toHaveLength(0);
    engine.dispose();
  });
});
