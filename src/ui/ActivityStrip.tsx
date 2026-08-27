/**
 * The agent activity strip (plan Architecture item 8; Decision 15): every command on the bus with
 * its source, summary, revision and `why`, newest first, and a per-item undo that pops the history
 * back to before that item and says how many edits that was.
 */
import { useSyncExternalStore } from 'react';
import type { SongDocument } from '../song/types.ts';
import type { CommandBus } from '../webmcp/bus.ts';

export interface ActivityStripProps {
  bus: CommandBus<SongDocument>;
  /** Given the revision an entry produced; omitted when history is not available. */
  onUndoItem?: ((revision: number) => void) | undefined;
}

/**
 * Renders the strip.
 *
 * @param props - The command bus and the per-item undo handler.
 * @returns The strip.
 */
export function ActivityStrip({ bus, onUndoItem }: ActivityStripProps) {
  const activities = useSyncExternalStore(bus.subscribe, bus.getActivities);
  return (
    <section className="strip" aria-label="Activity">
      <header className="strip-header">
        <h2>Activity</h2>
        <span className="muted">{activities.length} command(s)</span>
      </header>
      {activities.length === 0 ? (
        <p className="muted">
          Nothing yet. Every change you or your agent makes appears here with the reason for it.
        </p>
      ) : (
        <ol className="strip-list">
          {[...activities].reverse().map((entry) => (
            <li
              key={entry.id}
              className={`strip-item source-${entry.source}`}
              data-testid="activity"
            >
              <span className="strip-revision">r{entry.revision}</span>
              <span className="strip-source">{entry.source}</span>
              <span className="strip-summary">{entry.summary}</span>
              {entry.why ? <span className="strip-why">{entry.why}</span> : null}
              {onUndoItem === undefined ? null : (
                <button
                  type="button"
                  className="strip-undo"
                  aria-label={`Undo ${entry.summary}`}
                  onClick={() => onUndoItem(entry.revision)}
                >
                  Undo
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
