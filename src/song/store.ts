/** Song-aware wrapper around Lane C's generic command bus, including linear history. */
import {
  createCommandBus,
  type BusOptions,
  type Command,
  type CommandBus,
  type CommandResult,
  type Reducer,
} from '../webmcp/bus.ts';
import { createSongHistory, type HistoryMove, type SongHistory } from './history.ts';
import { songReducer } from './reducer.ts';
import { createEmptySong, type SongDocument } from './types.ts';

export interface SongStore extends CommandBus<SongDocument> {
  history: SongHistory;
  undo(source?: 'human' | 'agent'): (CommandResult & { edits: number }) | null;
  redo(source?: 'human' | 'agent'): (CommandResult & { edits: number }) | null;
  undoItem(
    revision: number,
    source?: 'human' | 'agent',
  ): (CommandResult & { edits: number }) | null;
}

/**
 * Wires the song reducer into `createCommandBus`; `ping` remains available until Lane C removes it.
 */
export function createSongStore(
  initial: SongDocument = createEmptySong(),
  reducer: Reducer<SongDocument> = songReducer,
  options: BusOptions = {},
): SongStore {
  const bus = createCommandBus(reducer, initial, options);
  const history = createSongHistory();

  const dispatch = (command: Command): CommandResult => {
    const before = bus.getDocument();
    const result = bus.dispatch(command);
    if (command.type !== 'ping' && command.type !== '__restore_snapshot') {
      history.record(before, bus.getDocument(), result.summary);
    }
    return result;
  };

  const restore = (
    move: HistoryMove | null,
    source: 'human' | 'agent',
  ): (CommandResult & { edits: number }) | null => {
    if (!move) return null;
    const result = bus.dispatch({
      type: '__restore_snapshot',
      args: { document: move.document, summary: move.summary },
      source,
    });
    return { ...result, edits: move.edits };
  };

  return {
    dispatch,
    getDocument: bus.getDocument,
    getActivities: bus.getActivities,
    subscribe: bus.subscribe,
    history,
    undo: (source = 'human') => restore(history.undo(), source),
    redo: (source = 'human') => restore(history.redo(), source),
    undoItem: (revision, source = 'human') => restore(history.undoItem(revision), source),
  };
}
