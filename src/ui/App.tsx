/**
 * The app shell (plan Architecture items 8-10): header with the tool status, transport, track
 * list, piano roll, activity strip and producer-notes rail. Today the transport, track list and
 * roll are placeholders that say what lands and when; the strip, rail, diagnostics and About are
 * real.
 */
import { useState, useSyncExternalStore } from 'react';
import { formatStatus } from '../webmcp/registry.ts';
import type { Runtime } from '../webmcp/runtime.ts';
import { About } from './About.tsx';
import { ActivityStrip } from './ActivityStrip.tsx';
import { Diagnostics } from './Diagnostics.tsx';
import { ProducerNotes } from './ProducerNotes.tsx';

export interface AppProps {
  runtime: Runtime;
}

type Panel = 'none' | 'diagnostics' | 'about';

/**
 * Renders the shell.
 *
 * @param props - The runtime.
 * @returns The app.
 */
export function App({ runtime }: AppProps) {
  const { registry, bus } = runtime;
  const status = useSyncExternalStore(registry.subscribe, registry.getStatus);
  const song = useSyncExternalStore(bus.subscribe, bus.getDocument);
  const [panel, setPanel] = useState<Panel>('none');
  const toggle = (next: Panel): void => {
    setPanel((current) => (current === next ? 'none' : next));
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>Euterpe</h1>
          <span className="tagline">a producer beside you</span>
        </div>
        <div className={`tool-status status-${status.kind}`} data-testid="tool-status">
          Agent tools: {formatStatus(status)}
        </div>
        <div className="song-meta">
          <span>{song.title}</span>
          <span className="mono" data-testid="song-revision">
            r{song.revision}
          </span>
          <span>{song.bpm} bpm</span>
          <span>{song.key.name}</span>
        </div>
        <nav className="header-nav">
          <button
            type="button"
            aria-pressed={panel === 'diagnostics'}
            onClick={() => toggle('diagnostics')}
          >
            Diagnostics
          </button>
          <button type="button" aria-pressed={panel === 'about'} onClick={() => toggle('about')}>
            About
          </button>
        </nav>
      </header>

      <main className="app-main">
        <section className="transport placeholder" aria-label="Transport">
          <span className="placeholder-title">Transport</span>
          <span className="muted">
            Record, play, stop, count-in and tempo land on 28 Aug (lane A). The audio context is
            created on the first click.
          </span>
        </section>

        <div className="workspace">
          <aside className="tracks placeholder" aria-label="Tracks">
            <span className="placeholder-title">Tracks</span>
            <span className="muted">
              {song.tracks.length === 0
                ? 'No tracks yet. The track list, instruments and mix land on 28 Aug.'
                : `${song.tracks.length} track(s)`}
            </span>
          </aside>

          <section className="roll placeholder" aria-label="Piano roll">
            <span className="placeholder-title">Piano roll</span>
            <span className="muted">
              The roll, the take's pitch curve and the step grid land on 28 Aug (lane B). Nothing
              here is drawn until the notes are real.
            </span>
          </section>

          <ProducerNotes bus={bus} />
        </div>

        <ActivityStrip bus={bus} />
      </main>

      {panel === 'diagnostics' ? (
        <Diagnostics runtime={runtime} onClose={() => setPanel('none')} />
      ) : null}
      {panel === 'about' ? <About onClose={() => setPanel('none')} /> : null}
    </div>
  );
}
