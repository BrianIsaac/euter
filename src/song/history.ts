/** Linear, snapshot-based history (plan Decision 15). */
import { cloneSong, type SongDocument } from './types.ts';

export const HISTORY_LIMIT = 200;

export interface HistoryItem {
  /** The revision assigned to the edit when it was first applied. */
  revision: number;
  summary: string;
  before: SongDocument;
  after: SongDocument;
}

export interface HistoryMove {
  document: SongDocument;
  summary: string;
  edits: number;
  revision: number;
}

export interface SongHistory {
  record(before: SongDocument, after: SongDocument, summary: string): void;
  undo(): HistoryMove | null;
  redo(): HistoryMove | null;
  /** Pops back to before one activity item, including all newer edits. */
  undoItem(revision: number): HistoryMove | null;
  getPast(): readonly HistoryItem[];
  getFuture(): readonly HistoryItem[];
  clear(): void;
}

/**
 * Creates a linear history whose snapshots never share mutable references with the live song.
 *
 * @param limit - Maximum number of applied edits retained; defaults to 200.
 * @returns The history controller.
 */
export function createSongHistory(limit = HISTORY_LIMIT): SongHistory {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError('History limit must be a positive integer.');
  }
  let past: HistoryItem[] = [];
  let future: HistoryItem[] = [];

  return {
    record(before, after, summary) {
      past = [
        ...past,
        {
          revision: after.revision,
          summary,
          before: cloneSong(before),
          after: cloneSong(after),
        },
      ].slice(-limit);
      future = [];
    },
    undo() {
      const item = past.at(-1);
      if (!item) return null;
      past = past.slice(0, -1);
      future = [...future, item];
      return {
        document: cloneSong(item.before),
        summary: `Undid ${item.summary}`,
        edits: 1,
        revision: item.revision,
      };
    },
    redo() {
      const item = future.at(-1);
      if (!item) return null;
      future = future.slice(0, -1);
      past = [...past, item];
      return {
        document: cloneSong(item.after),
        summary: `Redid ${item.summary}`,
        edits: 1,
        revision: item.revision,
      };
    },
    undoItem(revision) {
      const index = past.findIndex((item) => item.revision === revision);
      if (index < 0) return null;
      const removed = past.slice(index);
      const item = removed[0];
      if (!item) return null;
      past = past.slice(0, index);
      future = [...future, ...removed.reverse()];
      return {
        document: cloneSong(item.before),
        summary: `Undid ${item.summary} and ${removed.length - 1} newer edit${removed.length === 2 ? '' : 's'}`,
        edits: removed.length,
        revision: item.revision,
      };
    },
    getPast() {
      return past;
    },
    getFuture() {
      return future;
    },
    clear() {
      past = [];
      future = [];
    },
  };
}
