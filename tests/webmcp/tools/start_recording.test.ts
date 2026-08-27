import { describe, expect, it } from 'vitest';
import type { StartRecordingOptions } from '../../../src/input/recorder.ts';
import {
  createHarness,
  fakeAudio,
  fakeRecorder,
  makeTake,
  type FakeAudio,
  type FakeRecorder,
} from '../../helpers/harness.ts';

interface RecordingEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: {
    track_id: string;
    count_in_bars: number;
    metronome: boolean;
    target_bars?: [number, number];
  };
}

/**
 * Wraps the fake recorder with the audio check `RecorderController` makes before it asks for the
 * microphone, so the tool's refusal can be exercised without Web Audio.
 *
 * @param audio - The audio manager the recorder honours.
 * @returns The recorder.
 */
function lockAwareRecorder(audio: FakeAudio): FakeRecorder {
  const recorder = fakeRecorder(makeTake());
  const start = recorder.start;
  recorder.start = (options: StartRecordingOptions) =>
    audio.getSnapshot().state === 'running'
      ? start(options)
      : Promise.resolve({
          ok: false as const,
          code: 'AUDIO_LOCKED' as const,
          message: 'Press Record, Play or a key in the app once to unlock audio, then try again.',
          recoverable: true,
        });
  return recorder;
}

describe('start_recording', () => {
  it('arms the melody track by default and leaves the song where it was', async () => {
    const harness = createHarness();
    const envelope = (await harness.invoke('start_recording', {
      count_in_bars: 1,
      metronome: true,
    })) as RecordingEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.data).toEqual({ track_id: 'melody', count_in_bars: 1, metronome: true });
    expect(envelope.summary).toContain('Recording Melody after a 1-bar count-in');
    expect(envelope.revision).toBe(0);
    expect(envelope.changed).toEqual([]);
    expect(harness.engine.store.getDocument().revision).toBe(0);
    expect(harness.recorder.getSnapshot()).toMatchObject({
      status: 'recording',
      trackId: 'melody',
      targetBars: null,
    });
    harness.engine.dispose();
  });

  it('records onto the track the agent asked the person for', async () => {
    const harness = createHarness();
    await harness.invoke('request_take', {
      track_id: 'bass',
      bar_from: 1,
      bar_to: 4,
      prompt: 'Hum me a bassline for these four bars',
      why: 'You know how the low line should move better than I do.',
    });
    const envelope = (await harness.invoke('start_recording', {
      track_id: 'bass',
      count_in_bars: 2,
      metronome: false,
    })) as RecordingEnvelope;

    expect(envelope.data).toEqual({
      track_id: 'bass',
      count_in_bars: 2,
      metronome: false,
      target_bars: [1, 4],
    });
    expect(envelope.revision).toBe(1);
    expect(harness.recorder.getSnapshot()).toMatchObject({
      status: 'recording',
      trackId: 'bass',
      targetBars: { barFrom: 1, barTo: 4 },
      prompt: 'Hum me a bassline for these four bars',
    });
    harness.engine.dispose();
  });

  it('refuses a stale revision, an unknown track and a denied microphone', async () => {
    const harness = createHarness();
    await expect(
      harness.invoke('start_recording', {
        count_in_bars: 1,
        metronome: true,
        expected_revision: 3,
      }),
    ).resolves.toMatchObject({ ok: false, code: 'STALE_REVISION' });
    await expect(
      harness.invoke('start_recording', {
        track_id: 'strings',
        count_in_bars: 1,
        metronome: true,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'TRACK_NOT_FOUND',
      message: 'Track "strings" does not exist.',
    });
    expect(harness.recorder.getSnapshot().status).toBe('idle');

    harness.recorder.failStart = {
      status: 'error',
      live: null,
      targetBars: null,
      trackId: null,
      prompt: null,
      error: {
        ok: false,
        code: 'MIC_DENIED',
        message: 'Microphone access was not granted.',
        recoverable: true,
      },
    };
    await expect(
      harness.invoke('start_recording', { count_in_bars: 1, metronome: true }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'MIC_DENIED',
      message: 'Microphone access was not granted.',
      recoverable: true,
    });
    harness.engine.dispose();
  });

  it('refuses while audio is still locked', async () => {
    const audio = fakeAudio('uninitialised');
    const harness = createHarness({ engine: { audio, recorder: lockAwareRecorder(audio) } });
    await expect(
      harness.invoke('start_recording', { count_in_bars: 1, metronome: true }),
    ).resolves.toMatchObject({ ok: false, code: 'AUDIO_LOCKED', recoverable: true });

    audio.setState('running');
    await expect(
      harness.invoke('start_recording', { count_in_bars: 1, metronome: true }),
    ).resolves.toMatchObject({ ok: true });
    harness.engine.dispose();
  });
});
