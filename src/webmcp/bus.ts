/**
 * The command bus (plan Architecture item 2): every mutation, human or agent, is a command; the
 * reducer validates then applies atomically with no `await` between the two, the bus bumps
 * `revision`, records the activity and notifies subscribers. The reducer is injected: today it is
 * the probe reducer, from 28 Aug lane A's `src/song/reducer.ts`.
 */
import type { CommandSource } from '../song/types.ts';
import { ToolError } from './envelope.ts';

export interface Command {
  type: string;
  args: Record<string, unknown>;
  source: CommandSource;
  why?: string;
  expected_revision?: number;
}

export interface ReducerResult<D> {
  document: D;
  changed: string[];
  summary: string;
  target_bars?: [number, number];
}

/** Validates and applies one command; throws `ToolError` to refuse it. */
export type Reducer<D> = (document: D, command: Command) => ReducerResult<D>;

export interface CommandResult {
  revision: number;
  changed: string[];
  summary: string;
  target_bars?: [number, number];
}

export interface ActivityEntry extends CommandResult {
  id: number;
  at: number;
  type: string;
  source: CommandSource;
  why?: string;
}

export interface CommandBus<D extends { revision: number }> {
  dispatch(command: Command): CommandResult;
  getDocument(): D;
  /** The activity log, oldest first; the array reference changes only when the log does. */
  getActivities(): readonly ActivityEntry[];
  subscribe(listener: () => void): () => void;
}

export interface BusOptions {
  now?: () => number;
  activityLimit?: number;
}

/**
 * Creates a command bus over a reducer.
 *
 * @param reducer - Validates and applies commands.
 * @param initial - The starting document.
 * @param options - Clock and activity-log depth (default 200).
 * @returns The bus.
 */
export function createCommandBus<D extends { revision: number }>(
  reducer: Reducer<D>,
  initial: D,
  options: BusOptions = {},
): CommandBus<D> {
  const now = options.now ?? (() => Date.now());
  const activityLimit = options.activityLimit ?? 200;
  let document = initial;
  let activities: readonly ActivityEntry[] = [];
  let nextId = 1;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function summariseSince(revision: number): string {
    const since = activities
      .filter((entry) => entry.revision > revision)
      .map((entry) => entry.summary);
    return since.length > 0 ? since.slice(-5).join('; ') : 'nothing recorded';
  }

  return {
    dispatch(command: Command): CommandResult {
      if (
        command.expected_revision !== undefined &&
        command.expected_revision !== document.revision
      ) {
        throw new ToolError(
          'STALE_REVISION',
          `The song is at revision ${document.revision}, not ${command.expected_revision}. Since then: ${summariseSince(command.expected_revision)}. Read the state again.`,
          true,
        );
      }
      const result = reducer(document, command);
      const revision = document.revision + 1;
      document = { ...result.document, revision };
      const entry: ActivityEntry = {
        id: nextId,
        at: now(),
        type: command.type,
        source: command.source,
        revision,
        changed: result.changed,
        summary: result.summary,
      };
      nextId += 1;
      if (command.why !== undefined) {
        entry.why = command.why;
      }
      if (result.target_bars !== undefined) {
        entry.target_bars = result.target_bars;
      }
      activities = [...activities, entry].slice(-activityLimit);
      notify();
      const commandResult: CommandResult = {
        revision,
        changed: result.changed,
        summary: result.summary,
      };
      if (result.target_bars !== undefined) {
        commandResult.target_bars = result.target_bars;
      }
      return commandResult;
    },
    getDocument(): D {
      return document;
    },
    getActivities(): readonly ActivityEntry[] {
      return activities;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
