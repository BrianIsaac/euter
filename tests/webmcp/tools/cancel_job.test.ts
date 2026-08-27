import { describe, expect, it } from 'vitest';
import { createHarness, fakeAudioBuffer, type TestEngineOptions } from '../../helpers/harness.ts';

interface CancelEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: { job_id: string; cancelled: boolean; state: string };
}

interface JobEnvelope {
  ok: true;
  data: { job_id: string; kind: string; state: string; download_url?: string };
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

describe('cancel_job', () => {
  it('stops a render that is still running', async () => {
    const slow = slowRender();
    const harness = createHarness({ engine: slow.engine });
    await harness.invoke('render', { format: 'wav' });
    await nextMacrotask();
    expect(harness.engine.jobs.get('job-1')?.state).toBe('running');

    const envelope = (await harness.invoke('cancel_job', { job_id: 'job-1' })) as CancelEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.changed).toEqual([]);
    expect(envelope.summary).toBe('Cancelled wav job job-1');
    expect(envelope.data).toEqual({ job_id: 'job-1', cancelled: true, state: 'cancelled' });
    expect(harness.engine.jobs.get('job-1')?.state).toBe('cancelled');

    slow.finish();
    await nextMacrotask();
    const job = (await harness.invoke('get_job', { job_id: 'job-1' })) as JobEnvelope;
    expect(job.data).toMatchObject({ state: 'cancelled' });
    expect(job.data.download_url).toBeUndefined();
    harness.engine.dispose();
  });

  it('refuses a job id nobody started', async () => {
    const harness = createHarness();

    await expect(harness.invoke('cancel_job', { job_id: 'job-9' })).resolves.toMatchObject({
      ok: false,
      code: 'JOB_NOT_FOUND',
      recoverable: true,
      message: expect.stringContaining('job-9'),
    });
    harness.engine.dispose();
  });

  it('reports a job that has already finished as not cancelled', async () => {
    const harness = createHarness();
    await harness.invoke('render', { format: 'midi' });
    await nextMacrotask();

    const envelope = (await harness.invoke('cancel_job', { job_id: 'job-1' })) as CancelEnvelope;

    expect(envelope.summary).toBe('Job job-1 had already finished');
    expect(envelope.data).toEqual({ job_id: 'job-1', cancelled: false, state: 'done' });

    const job = (await harness.invoke('get_job', { job_id: 'job-1' })) as JobEnvelope;
    expect(job.data).toMatchObject({ state: 'done', download_url: 'blob:euter/1' });
    harness.engine.dispose();
  });
});
