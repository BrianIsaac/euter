/**
 * `get_job` (read): the poll half of start-then-poll (plan Decision 23; landscape §5.1). The same
 * job the person watches in the export panel.
 */
import type { ExportResult } from '../engine.ts';
import { descriptions } from '../descriptions.ts';
import { ok, ToolError } from '../envelope.ts';
import { getJobInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';

export type JobState = 'running' | 'done' | 'failed' | 'cancelled';

/**
 * Maps the job manager's states onto the four the description promises.
 *
 * @param state - The manager's state.
 * @returns The state the agent reads.
 */
export function jobState(state: string): JobState {
  if (state === 'completed') return 'done';
  if (state === 'failed') return 'failed';
  if (state === 'cancelled') return 'cancelled';
  return 'running';
}

export const getJob: ToolDefinition<typeof getJobInput> = {
  name: 'get_job',
  title: 'Read a job',
  kind: 'read',
  description: descriptions.get_job,
  input: getJobInput,
  untrustedContent: true,
  example: { job_id: 'job-1' },
  badExample: {},
  execute(args, context) {
    const job = context.engine.jobs.get<ExportResult>(args.job_id);
    if (!job) {
      throw new ToolError('JOB_NOT_FOUND', `No job with id "${args.job_id}".`, true);
    }
    const state = jobState(job.state);
    const result = state === 'done' ? context.engine.exportResult(job.id) : null;
    const revision = context.bus.getDocument().revision;
    return ok(
      revision,
      [],
      state === 'done'
        ? `${job.kind} is ready: ${result?.filename ?? 'file'}. The person clicks the link in the export panel.`
        : `${job.kind} is ${state} at ${job.progress_pct}%`,
      {
        job_id: job.id,
        kind: job.kind,
        state,
        progress_pct: job.progress_pct,
        ...(result === null
          ? {}
          : {
              download_url: result.download_url,
              filename: result.filename,
              duration_s: result.duration_s,
              peak_dbfs: result.peak_dbfs,
            }),
        ...(job.error === undefined ? {} : { error: job.error }),
      },
    );
  },
};
