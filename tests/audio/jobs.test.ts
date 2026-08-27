import { describe, expect, it, vi } from 'vitest';
import { ExportJobManager } from '../../src/audio/jobs.ts';

async function nextTurn(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('export jobs', () => {
  it('runs a job, clamps monotonic progress and retains its result', async () => {
    const manager = new ExportJobManager(() => 'job-1');
    const listener = vi.fn();
    manager.subscribe(listener);
    const started = manager.start('render', async ({ setProgress }) => {
      setProgress(45.4);
      setProgress(12);
      setProgress(200);
      return { url: 'song.wav' };
    });
    expect(started).toMatchObject({ id: 'job-1', state: 'queued', progress_pct: 0 });
    await nextTurn();
    expect(manager.get('job-1')).toEqual({
      id: 'job-1',
      kind: 'render',
      state: 'completed',
      progress_pct: 100,
      result: { url: 'song.wav' },
    });
    expect(listener.mock.calls.map(([job]) => job.progress_pct)).toEqual([0, 0, 45, 99, 100]);
  });

  it('owns an AbortController and never lets a cancelled result overwrite cancellation', async () => {
    const manager = new ExportJobManager(() => 'job-2');
    let finish: ((value: string) => void) | undefined;
    let observedSignal: AbortSignal | undefined;
    manager.start('mp3', ({ signal }) => {
      observedSignal = signal;
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    });
    await nextTurn();
    expect(manager.cancel('job-2')).toBe(true);
    expect(observedSignal?.aborted).toBe(true);
    finish?.('late result');
    await nextTurn();
    expect(manager.get('job-2')).toMatchObject({
      state: 'cancelled',
      error: 'Export cancelled.',
    });
    expect(manager.cancel('job-2')).toBe(false);
  });

  it('captures errors without throwing from the background task', async () => {
    const manager = new ExportJobManager(() => 'job-3');
    manager.start('midi', async () => {
      throw new Error('No notes in range.');
    });
    await nextTurn();
    expect(manager.get('job-3')).toMatchObject({
      state: 'failed',
      error: 'No notes in range.',
    });
  });
});
