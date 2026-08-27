import { describe, expect, it } from 'vitest';
import { renderSong, type OfflineRenderEngine } from '../../../src/audio/render.ts';
import { createHarness } from '../../helpers/harness.ts';

interface JobEnvelope {
  ok: true;
  revision: number;
  summary: string;
  data: {
    job_id: string;
    kind: string;
    state: string;
    progress_pct: number;
    download_url?: string;
    filename?: string;
    duration_s?: number;
    peak_dbfs?: number | null;
    fallbacks?: readonly string[];
    error?: string;
  };
}

/**
 * Waits for the job manager's microtask and one macrotask.
 *
 * @returns A promise that settles once pending jobs have had a turn.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('get_job', () => {
  it('refuses a job id the person never started', async () => {
    const harness = createHarness();
    await expect(harness.invoke('get_job', { job_id: 'job-9' })).resolves.toMatchObject({
      ok: false,
      code: 'JOB_NOT_FOUND',
      message: 'No job with id "job-9".',
      recoverable: true,
    });
    harness.engine.dispose();
  });

  it('reports progress while the render runs and the cancellation afterwards', async () => {
    const harness = createHarness({
      engine: {
        exporters: {
          render: (_song, _range, options) =>
            new Promise<AudioBuffer>(() => {
              options?.onProgress?.(60);
            }),
        },
      },
    });
    const job = harness.engine.startExport('wav', 1, 8);
    expect(job.id).toBe('job-1');
    await settle();

    const running = (await harness.invoke('get_job', { job_id: 'job-1' })) as JobEnvelope;
    expect(running.data).toMatchObject({ job_id: 'job-1', kind: 'wav', state: 'running' });
    expect(running.data.progress_pct).toBe(42);
    expect(running.data.download_url).toBeUndefined();
    expect(running.summary).toBe('wav is running at 42%');

    expect(harness.engine.jobs.cancel('job-1')).toBe(true);
    const cancelled = (await harness.invoke('get_job', { job_id: 'job-1' })) as JobEnvelope;
    expect(cancelled.data.state).toBe('cancelled');
    expect(cancelled.data.error).toBe('Export cancelled.');
    harness.engine.dispose();
  });

  it('reports the finished file the person can download', async () => {
    const harness = createHarness();
    harness.engine.startExport('wav', 1, 8);
    await settle();

    const envelope = (await harness.invoke('get_job', { job_id: 'job-1' })) as JobEnvelope;
    expect(envelope.data.state).toBe('done');
    expect(envelope.data.progress_pct).toBe(100);
    expect(envelope.data.download_url).toMatch(/^blob:euter\//u);
    expect(envelope.data.filename).toBe('first-light.wav');
    expect(envelope.data.duration_s).toBe(1);
    expect(envelope.data.peak_dbfs).toBeCloseTo(-12.04, 1);
    expect(envelope.summary).toContain('wav is ready: first-light.wav');
    harness.engine.dispose();
  });

  it('tells the agent when the encoded render used an audible fallback', async () => {
    const offline: OfflineRenderEngine = {
      render: (_request) =>
        Promise.resolve({
          buffer: {
            duration: 1,
            length: 4,
            numberOfChannels: 1,
            sampleRate: 44_100,
            getChannelData: () => new Float32Array([0.1, -0.1, 0.1, -0.1]),
          } as unknown as AudioBuffer,
          fallbacks: ['Harmony: playing Grand piano instead.'],
        }),
    };
    const harness = createHarness({
      engine: {
        exporters: {
          render: (song, range, options) =>
            renderSong(song, range, { ...options, engine: offline }),
        },
      },
    });
    harness.engine.startExport('wav', 1, 8);
    await settle();

    const envelope = (await harness.invoke('get_job', { job_id: 'job-1' })) as JobEnvelope;
    expect(envelope.data.fallbacks).toEqual(['Harmony: playing Grand piano instead.']);
    harness.engine.dispose();
  });
});
