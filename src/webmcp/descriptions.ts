/**
 * Tool descriptions as registered (plan Tool surface). The registry appends the write sentence,
 * counted in the 500-character budget by the contract test.
 */
import type { ToolKind } from './types.ts';

export const WRITE_SUFFIX =
  'Returns revision, changed and summary; on error returns ok:false with a code.';

export const WHY_SENTENCE = 'Include why.';

export const descriptions = {
  get_diagnostics:
    'Read the probe page diagnostics: browser identity, which model context objects exist, tool status and count, audio state, microphone and MIDI permission, origin-trial token and response headers. The payload is deliberately about 1,400 characters and ends with tail_marker; quote tail_marker to confirm you received all of it. Changes nothing.',
  ping: 'Probe write: echo message and bump the song revision by one. Use it to confirm tool calls reach the page. The summary carries the message and the envelope carries the new revision.',
} as const;

export type ToolName = keyof typeof descriptions;

/**
 * Builds the description the browser sees.
 *
 * @param base - The description from `descriptions`.
 * @param kind - Read or write.
 * @param hasWhy - Whether the schema has a `why` field.
 * @returns The base description, with the write sentence appended for writes.
 */
export function registeredDescription(base: string, kind: ToolKind, hasWhy: boolean): string {
  if (kind === 'read') {
    return base;
  }
  return hasWhy ? `${base} ${WHY_SENTENCE} ${WRITE_SUFFIX}` : `${base} ${WRITE_SUFFIX}`;
}
