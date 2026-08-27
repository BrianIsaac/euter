/**
 * `cancel_job`: aborts a running render through the job's `AbortController` (plan Decision 23).
 */
import { descriptions } from '../descriptions.ts';
import { ok, ToolError } from '../envelope.ts';
import { cancelJobInput } from '../schemas.ts';
import type { ToolDefinition } from '../types.ts';
import { jobState } from './get_job.ts';

export const cancelJob: ToolDefinition<typeof cancelJobInput> = {
  name: 'cancel_job',
  title: 'Cancel a job',
  kind: 'write',
  description: descriptions.cancel_job,
  input: cancelJobInput,
  example: { job_id: 'job-1' },
  badExample: { job_id: 12 },
  execute(args, context) {
    const job = context.engine.jobs.get(args.job_id);
    if (!job) {
      throw new ToolError('JOB_NOT_FOUND', `No job with id "${args.job_id}".`, true);
    }
    const cancelled = context.engine.jobs.cancel(args.job_id);
    const after = context.engine.jobs.get(args.job_id);
    return ok(
      context.bus.getDocument().revision,
      [],
      cancelled ? `Cancelled ${job.kind} job ${job.id}` : `Job ${job.id} had already finished`,
      {
        job_id: job.id,
        cancelled,
        state: jobState(after?.state ?? job.state),
      },
    );
  },
};
