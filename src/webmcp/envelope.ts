/**
 * The result envelope every tool returns (plan Decision 12; Webroom's pattern, landscape §4.5):
 * `{ok, revision, changed, summary, data}` on success, `{ok:false, code, message, recoverable}`
 * on failure. Errors are data, never throws, so the model can read them and self-correct
 * (landscape §1.3).
 */
import { ZodError } from 'zod';

export const ERROR_CODES = [
  'INVALID_ARGUMENT',
  'STALE_REVISION',
  'TRACK_NOT_FOUND',
  'TAKE_NOT_FOUND',
  'OUT_OF_RANGE',
  'AUDIO_LOCKED',
  'MIC_DENIED',
  'RECORDING_IN_PROGRESS',
  'JOB_NOT_FOUND',
  'RESULT_TOO_LARGE',
  'CANCELLED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface OkEnvelope<T = unknown> {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: T;
}

export interface ErrorEnvelope {
  ok: false;
  code: ErrorCode;
  message: string;
  recoverable: boolean;
}

export type Envelope<T = unknown> = OkEnvelope<T> | ErrorEnvelope;

/** Chrome's recommended limit per tool output, in characters (landscape §1.8). */
export const OUTPUT_BUDGET = 1500;

/** A failure a tool or reducer raises on purpose; the registry turns it into an error envelope. */
export class ToolError extends Error {
  readonly code: ErrorCode;
  readonly recoverable: boolean;

  constructor(code: ErrorCode, message: string, recoverable: boolean) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.recoverable = recoverable;
  }
}

/**
 * Builds a success envelope.
 *
 * @param revision - The document revision after the call.
 * @param changed - The document fields the call changed; empty for reads.
 * @param summary - One line for the activity strip and the model.
 * @param data - The tool's payload.
 * @returns The envelope.
 */
export function ok<T>(
  revision: number,
  changed: string[],
  summary: string,
  data: T,
): OkEnvelope<T> {
  return { ok: true, revision, changed, summary, data };
}

/**
 * Builds an error envelope.
 *
 * @param code - One of the listed codes.
 * @param message - What went wrong, written for the model.
 * @param recoverable - True when a retry with different arguments can succeed.
 * @returns The envelope.
 */
export function fail(code: ErrorCode, message: string, recoverable: boolean): ErrorEnvelope {
  return { ok: false, code, message, recoverable };
}

/**
 * Formats a zod error as one line of `path: message` pairs.
 *
 * @param error - The zod error.
 * @returns The formatted issues.
 */
export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
    .join('; ');
}

/**
 * Converts anything thrown inside a tool into an error envelope.
 *
 * @param thrown - The thrown value.
 * @returns An error envelope with the closest code.
 */
export function envelopeFromThrown(thrown: unknown): ErrorEnvelope {
  if (thrown instanceof ToolError) {
    return fail(thrown.code, thrown.message, thrown.recoverable);
  }
  if (thrown instanceof ZodError) {
    return fail('INVALID_ARGUMENT', formatZodError(thrown), true);
  }
  if (isAbortError(thrown)) {
    return fail('CANCELLED', 'The call was cancelled before it ran.', true);
  }
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  return fail('INTERNAL', message, false);
}

/**
 * Tells whether a thrown value is an abort (from `AbortSignal.reason` or a DOMException).
 *
 * @param thrown - The thrown value.
 * @returns True for an AbortError.
 */
export function isAbortError(thrown: unknown): boolean {
  return (
    typeof thrown === 'object' &&
    thrown !== null &&
    'name' in thrown &&
    (thrown as { name: unknown }).name === 'AbortError'
  );
}

/**
 * Serialises an envelope the way the browser will and refuses one over the output budget.
 *
 * @param envelope - The envelope a tool returned.
 * @param budget - The character limit; defaults to Chrome's 1,500.
 * @returns The envelope, or a `RESULT_TOO_LARGE` envelope when it is over budget.
 */
export function enforceOutputBudget<T>(envelope: Envelope<T>, budget = OUTPUT_BUDGET): Envelope<T> {
  const length = serialisedLength(envelope);
  if (length <= budget) {
    return envelope;
  }
  return fail(
    'RESULT_TOO_LARGE',
    `The result is ${length} characters; the limit is ${budget}. Ask for a smaller range.`,
    true,
  );
}

/**
 * Measures an envelope as the browser will serialise it.
 *
 * @param envelope - Any JSON-serialisable value.
 * @returns The length of `JSON.stringify(envelope)`.
 */
export function serialisedLength(envelope: unknown): number {
  return JSON.stringify(envelope).length;
}
