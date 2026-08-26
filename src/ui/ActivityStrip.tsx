/**
 * The agent activity strip (plan Architecture item 8): every command on the bus with its source,
 * summary, revision and `why`. Per-item undo arrives with the history on 29 Aug.
 */
import { useSyncExternalStore } from 'react';
import type { SongDocument } from '../song/types.ts';
import type { CommandBus } from '../webmcp/bus.ts';

export interface ActivityStripProps {
  bus: CommandBus<SongDocument>;
}

/**
 * Renders the strip.
 *
 * @param props - The command bus.
 * @returns The strip.
 */
export function ActivityStrip({ bus }: ActivityStripProps) {
  const activities = useSyncExternalStore(bus.subscribe, bus.getActivities);
  return (
    <section className="strip" aria-label="Activity">
      <header className="strip-header">
        <h2>Activity</h2>
        <span className="muted">{activities.length} command(s)</span>
      </header>
      {activities.length === 0 ? (
        <p className="muted">
          No commands yet. Ask your agent to call <code>ping</code> and the call appears here.
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
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
