/**
 * The probe reducer for 27 Aug: one command, `ping`, which bumps the revision and records the
 * message. Lane A's reducer replaces it on 28 Aug (plan Phases, 27 Aug); the probe tools go on
 * 29 Aug.
 */
import { createEmptySong, type SongDocument } from '../song/types.ts';
import type { Reducer } from './bus.ts';
import { ToolError } from './envelope.ts';

/**
 * Creates the minimal document the probe page runs on.
 *
 * @returns An empty song titled "Probe".
 */
export function createProbeDocument(): SongDocument {
  return createEmptySong('Probe');
}

/**
 * Applies `ping`; refuses anything else.
 *
 * @param document - The current song.
 * @param command - The command to apply.
 * @returns The unchanged song (the bus bumps the revision) and a summary carrying the message.
 */
export const probeReducer: Reducer<SongDocument> = (document, command) => {
  if (command.type !== 'ping') {
    throw new ToolError('INVALID_ARGUMENT', `Unknown command "${command.type}".`, false);
  }
  const message = typeof command.args.message === 'string' ? command.args.message : '';
  return { document, changed: ['revision'], summary: `ping: ${message}` };
};
