import { describe, expect, it } from 'vitest';
import { createHarness, fakeAudioBuffer, type TestEngineOptions } from '../../helpers/harness.ts';

interface RenderEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: {
    job_id: string;
    state: string;
    format: string;
    bar_from: number;
    bar_to: number;
  };
}

interface JobEnvelope {
  ok: true;
  data: {
    job_id: string;
    kind: string;
    state: string;
    progress_pct: number;
    download_url?: string;
    filename?: string;
  };
}

function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Builds engine options whose render never finishes until the test lets it.
 *
 * @returns The options and the trigger that finishes the render.
 */
function slowRender(): { engine: TestEngineOptions; finish: () => void } {
  let finish = (): void => undefined;
  const pending = new Promise<AudioBuffer>((resolve) => {
    finish = () => resolve(fakeAudioBuffer());
  });
  return {
    engine: {
      exporters: {
        render: () => pending,
        wav: () => new Uint8Array([82, 73, 70, 70]),
        mp3: () => Promise.resolve(new Uint8Array([255, 251])),
        midi: () => new Uint8Array([77, 84, 104, 100]),
      },
    },
    finish: () => finish(),
  };
}

describe('render', () => {
  it('hands back a job id at once and the file is ready when the job finishes', async () => {
    const harness = createHarness();

    const envelope = (await harness.invoke('render', { format: 'mp3' })) as RenderEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.revision).toBe(0);
    expect(envelope.changed).toEqual([]);
    expect(envelope.summary).toContain('get_job');
    expect(envelope.data).toEqual({
      job_id: 'job-1',
      state: 'running',
      format: 'mp3',
      bar_from: 1,
      bar_to: 8,
    });

    await nextMacrotask();
    const job = (await harness.invoke('get_job', { job_id: 'job-1' })) as JobEnvelope;

    expect(job.data).toMatchObject({
      job_id: 'job-1',
      kind: 'mp3',
      state: 'done',
      progress_pct: 100,
      download_url: 'blob:euter/1',
      filename: 'first-light.mp3',
    });
    expect(harness.engine.store.getDocument().revision).toBe(0);
    harness.engine.dispose();
  });

  it('refuses a range past the last bar and an inverted one', async () => {
    const harness = createHarness();

    await expect(
      harness.invoke('render', { format: 'wav', bar_from: 1, bar_to: 12 }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'OUT_OF_RANGE',
      message: 'The song has 8 bars.',
    });

    await expect(
      harness.invoke('render', { format: 'wav', bar_from: 5, bar_to: 2 }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
      message: 'Give an ordered, one-based bar range.',
    });

    expect(harness.engine.jobs.list()).toEqual([]);
    harness.engine.dispose();
  });

  it('rejects MIDI immediately when it would omit a retained vocal', async () => {
    const harness = createHarness();
    const melody = harness.engine.store.getDocument().tracks[0];
    if (melody) melody.clips = [{ id: 'voice', take_id: 'voice', s: 0 }];

    await expect(harness.invoke('render', { format: 'midi' })).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
      message: expect.stringContaining('MIDI cannot contain retained voice audio'),
    });
    expect(harness.engine.jobs.list()).toEqual([]);
    harness.engine.dispose();
  });

  it('cancels the job when the caller aborts the call', async () => {
    const slow = slowRender();
    const harness = createHarness({ engine: slow.engine });
    const controller = new AbortController();

    const envelope = (await harness.invoke(
      'render',
      { format: 'wav', bar_from: 1, bar_to: 4 },
      controller.signal,
    )) as RenderEnvelope;

    expect(envelope.data.job_id).toBe('job-1');
    await nextMacrotask();
    expect(harness.engine.jobs.get('job-1')?.state).toBe('running');

    controller.abort();
    expect(harness.engine.jobs.get('job-1')?.state).toBe('cancelled');

    slow.finish();
    await nextMacrotask();
    const job = (await harness.invoke('get_job', { job_id: 'job-1' })) as JobEnvelope;
    expect(job.data).toMatchObject({ job_id: 'job-1', state: 'cancelled' });
    harness.engine.dispose();
  });
});
