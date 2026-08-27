/** In-memory export jobs with monotonic progress and explicit cancellation (plan Decision 20). */
export type ExportJobKind = 'render' | 'wav' | 'midi' | 'mp3';
export type ExportJobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ExportJob<Result = unknown> {
  id: string;
  kind: ExportJobKind;
  state: ExportJobState;
  progress_pct: number;
  result?: Result | undefined;
  error?: string | undefined;
}

export interface JobContext {
  signal: AbortSignal;
  setProgress(progressPercent: number): void;
}

export type JobTask<Result> = (context: JobContext) => Promise<Result>;
export type JobListener = (job: Readonly<ExportJob>) => void;

interface JobRecord {
  job: ExportJob;
  controller: AbortController;
}

function cloneJob<Result>(job: ExportJob<Result>): ExportJob<Result> {
  return structuredClone(job);
}

export class ExportJobManager {
  readonly #jobs = new Map<string, JobRecord>();
  readonly #listeners = new Set<JobListener>();
  readonly #createId: () => string;

  constructor(createId: () => string = () => crypto.randomUUID()) {
    this.#createId = createId;
  }

  start<Result>(kind: ExportJobKind, task: JobTask<Result>): ExportJob<Result> {
    const id = this.#createId();
    if (this.#jobs.has(id)) throw new Error(`Duplicate job id "${id}".`);
    const record: JobRecord = {
      job: { id, kind, state: 'queued', progress_pct: 0 },
      controller: new AbortController(),
    };
    this.#jobs.set(id, record);
    this.#emit(record.job);
    queueMicrotask(() => void this.#run(record, task));
    return cloneJob(record.job) as ExportJob<Result>;
  }

  get<Result = unknown>(id: string): ExportJob<Result> | undefined {
    const job = this.#jobs.get(id)?.job;
    return job ? (cloneJob(job) as ExportJob<Result>) : undefined;
  }

  list(): ExportJob[] {
    return [...this.#jobs.values()].map(({ job }) => cloneJob(job));
  }

  cancel(id: string): boolean {
    const record = this.#jobs.get(id);
    if (!record || ['completed', 'failed', 'cancelled'].includes(record.job.state)) return false;
    record.controller.abort(new DOMException('Export cancelled.', 'AbortError'));
    record.job = { ...record.job, state: 'cancelled', error: 'Export cancelled.' };
    this.#emit(record.job);
    return true;
  }

  subscribe(listener: JobListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async #run<Result>(record: JobRecord, task: JobTask<Result>): Promise<void> {
    if (record.controller.signal.aborted) return;
    record.job = { ...record.job, state: 'running' };
    this.#emit(record.job);
    try {
      const result = await task({
        signal: record.controller.signal,
        setProgress: (progressPercent) => {
          if (record.job.state !== 'running') return;
          const progress = Math.min(
            99,
            Math.max(record.job.progress_pct, Math.round(progressPercent)),
          );
          if (progress === record.job.progress_pct) return;
          record.job = { ...record.job, progress_pct: progress };
          this.#emit(record.job);
        },
      });
      if (record.controller.signal.aborted) return;
      record.job = { ...record.job, state: 'completed', progress_pct: 100, result };
      this.#emit(record.job);
    } catch (error) {
      if (record.controller.signal.aborted) return;
      record.job = {
        id: record.job.id,
        kind: record.job.kind,
        state: 'failed',
        progress_pct: record.job.progress_pct,
        error: error instanceof Error ? error.message : String(error),
      };
      this.#emit(record.job);
    }
  }

  #emit(job: ExportJob): void {
    const snapshot = cloneJob(job);
    for (const listener of this.#listeners) listener(snapshot);
  }
}
