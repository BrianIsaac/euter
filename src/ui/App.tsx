/**
 * The app shell (plan Architecture items 7-10): header with the tool status and the example
 * loader, transport, track list, piano roll and step grid, the take panel, the teaching cards, the
 * producer-notes rail, the export panel, the keyboard and the activity strip. Every tool result
 * carries `target_bars`, and the roll scrolls to and flashes them.
 */
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { RecordedTake } from '../input/recorder.ts';
import {
  isEmptySong,
  type SongDocument,
  type TeachingOption,
  type TeachingOptionSet,
} from '../song/types.ts';
import type { ActivityEntry, Command } from '../webmcp/bus.ts';
import type { Engine } from '../webmcp/engine.ts';
import { formatStatus } from '../webmcp/registry.ts';
import type { Runtime } from '../webmcp/runtime.ts';
import { About } from './About.tsx';
import { ActivityStrip } from './ActivityStrip.tsx';
import { Diagnostics } from './Diagnostics.tsx';
import { ExportPanel } from './ExportPanel.tsx';
import { Keyboard } from './Keyboard.tsx';
import { OptionCards } from './OptionCards.tsx';
import { PianoRoll } from './PianoRoll.tsx';
import { ProducerNotes } from './ProducerNotes.tsx';
import { StepGrid } from './StepGrid.tsx';
import { TakePanel, type TakeCommitOptions } from './TakePanel.tsx';
import { TrackList } from './TrackList.tsx';
import { Transport } from './Transport.tsx';

export interface AppProps {
  runtime: Runtime;
}

type Panel = 'none' | 'diagnostics' | 'about';

interface Selection {
  trackId: string;
  activityId: number;
}

/**
 * Reads the track a command touched from its `changed` list, so the roll follows the agent.
 *
 * @param entry - The newest activity entry.
 * @param song - The current song.
 * @returns The track id, or null when the command touched no single track.
 */
export function trackFromActivity(
  entry: ActivityEntry | undefined,
  song: SongDocument,
): string | null {
  for (const changed of entry?.changed ?? []) {
    const id = changed.startsWith('track:') ? changed.split(':')[1] : undefined;
    if (id !== undefined && song.tracks.some((track) => track.id === id)) return id;
  }
  return null;
}

/**
 * A playhead source the roll can subscribe to: it polls the transport only while it is playing.
 *
 * @param engine - The engine that owns the transport.
 * @param playing - Whether the transport is running.
 * @param beatsPerBar - The song's time signature numerator.
 * @param intervalMs - How often to read the position.
 * @returns A store for `useSyncExternalStore`.
 */
export function createPlayheadStore(
  engine: Engine,
  playing: boolean,
  beatsPerBar: number,
  intervalMs = 120,
): { subscribe(listener: () => void): () => void; getSnapshot(): number | null } {
  return {
    subscribe(listener) {
      if (!playing) return () => undefined;
      const timer = setInterval(listener, intervalMs);
      return () => {
        clearInterval(timer);
      };
    },
    getSnapshot() {
      return playing ? (engine.transport.getSnapshot().position_bar - 1) * beatsPerBar : null;
    },
  };
}

function message(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * Renders the shell.
 *
 * @param props - The runtime.
 * @returns The app.
 */
export function App({ runtime }: AppProps) {
  const { registry, bus, engine, queue } = runtime;
  const status = useSyncExternalStore(registry.subscribe, registry.getStatus);
  const song = useSyncExternalStore(bus.subscribe, bus.getDocument);
  const activities = useSyncExternalStore(bus.subscribe, bus.getActivities);
  const engineState = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [panel, setPanel] = useState<Panel>('none');
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [gridBar, setGridBar] = useState(1);

  const latest = activities.at(-1);
  const latestId = latest?.id ?? 0;
  const agentTrack = trackFromActivity(latest, song);
  const selectedTrackId =
    (selection?.activityId === latestId ? selection.trackId : (agentTrack ?? selection?.trackId)) ??
    song.tracks[0]?.id ??
    '';
  const selectedTrack = song.tracks.find((track) => track.id === selectedTrackId) ?? null;
  const drumsTrack = song.tracks.find((track) => track.kind === 'drums') ?? null;
  const targetBars = latest?.target_bars ?? null;
  const takeRequest = engine.takeRequest();
  const pendingTake = engine.pendingTake();
  const emptySong = isEmptySong(song);

  /** Reports whether the command landed, so a refused write never tears down the take panel. */
  const dispatch = useCallback(
    (command: Command): boolean => {
      try {
        bus.dispatch(command);
        setError(null);
        return true;
      } catch (thrown) {
        setError(message(thrown));
        return false;
      }
    },
    [bus],
  );

  const playhead = useMemo(
    () => createPlayheadStore(engine, engineState.playing, song.time_sig[0]),
    [engine, engineState.playing, song.time_sig],
  );
  const playheadBeat = useSyncExternalStore(playhead.subscribe, playhead.getSnapshot);

  const recorderPort = useMemo(
    () => ({
      getSnapshot: engine.recorder.getSnapshot,
      subscribe: engine.recorder.subscribe,
      async start(options: Parameters<typeof engine.recorder.start>[0]) {
        await engine.activate();
        return engine.recorder.start(options);
      },
      stop: () => engine.recorder.stop(),
    }),
    [engine],
  );

  const keyboardPort = useMemo(
    () => ({
      getSnapshot: engine.keys.getSnapshot,
      subscribe: engine.keys.subscribe,
      pressKey(key: string, repeat?: boolean) {
        void engine.activate().catch((thrown: unknown) => setError(message(thrown)));
        return engine.keys.pressKey(key, repeat);
      },
      releaseKey: (key: string) => engine.keys.releaseKey(key),
    }),
    [engine],
  );

  const onTake = (recorded: RecordedTake): void => {
    engine.addTake(
      {
        ...recorded.take,
        ...(recorded.trackId === null ? {} : { target_track_id: recorded.trackId }),
        ...(recorded.targetBars === null
          ? {}
          : {
              target_bars: [recorded.targetBars.barFrom, recorded.targetBars.barTo] as [
                number,
                number,
              ],
            }),
      },
      'Kept the take you just played.',
      'human',
    );
  };

  const onCommit = ({ takeId, grid, strength }: TakeCommitOptions): void => {
    const trackId = takeRequest?.trackId ?? selectedTrackId;
    const committed = dispatch({
      type: 'commit_take',
      args: { take_id: takeId, track_id: trackId, quantize_strength: strength, grid },
      source: 'human',
      why: `Committed the take onto ${trackId}.`,
    });
    if (committed) engine.setPendingTake(null);
  };

  const onImportFile = (file: File): void => {
    void engine
      .importFile(file)
      .then((imported) => {
        engine.addTake(
          {
            ...imported.take,
            ...(selectedTrackId === '' ? {} : { target_track_id: selectedTrackId }),
          },
          `Imported ${imported.fileName} as a take.`,
          'human',
        );
      })
      .catch((thrown: unknown) => setError(message(thrown)));
  };

  const onAudition = (optionId: string): void => {
    void engine
      .activate()
      .then(() => engine.audition(optionId))
      .catch((thrown: unknown) => setError(message(thrown)));
  };

  const onChoose = (set: TeachingOptionSet, option: TeachingOption): void => {
    engine.clearPreview();
    const chosen = dispatch({
      type: 'choose_option',
      args: { option_id: option.id },
      source: 'human',
      why: option.why,
    });
    if (chosen && set.kind === 'take') engine.setPendingTake(null);
  };

  const toggle = (next: Panel): void => {
    setPanel((current) => (current === next ? 'none' : next));
  };

  const replaceSong = (replacement: 'empty' | 'example'): void => {
    if (replacement === 'empty') {
      const confirmed = window.confirm(
        'Start a new song? Your current work will be replaced, but you can restore it with Undo.',
      );
      if (!confirmed) return;
      engine.newSong();
    } else {
      engine.loadExample();
    }
    setSelection(null);
    setGridBar(1);
    setError(null);
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
          {emptySong ? (
            <button type="button" onClick={() => replaceSong('example')}>
              Load the example
            </button>
          ) : null}
          <button type="button" disabled={emptySong} onClick={() => replaceSong('empty')}>
            New song
          </button>
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
        <Transport engine={engine} song={song} onDispatch={dispatch} onError={setError} />
        {error === null ? null : (
          <p className="shell-error" role="alert">
            {error}
          </p>
        )}

        <div className="workspace">
          <TrackList
            song={song}
            selectedTrackId={selectedTrackId}
            onSelect={(trackId) => setSelection({ trackId, activityId: latestId })}
            onDispatch={dispatch}
          />

          <div className="stage">
            {selectedTrack === null ? (
              <p className="muted">Add a track to start writing notes.</p>
            ) : (
              <PianoRoll
                song={song}
                trackId={selectedTrack.id}
                take={pendingTake}
                playheadBeat={playheadBeat}
                targetBars={targetBars ?? null}
                gesture={queue}
                onDispatch={dispatch}
              />
            )}

            {drumsTrack === null ? null : (
              <div className="grid-bar">
                <div className="grid-bar-controls">
                  <button
                    type="button"
                    onClick={() => setGridBar((bar) => Math.max(1, bar - 1))}
                    aria-label="Previous drum bar"
                  >
                    &lt;
                  </button>
                  <span className="mono">bar {Math.min(gridBar, song.bars)}</span>
                  <button
                    type="button"
                    onClick={() => setGridBar((bar) => Math.min(song.bars, bar + 1))}
                    aria-label="Next drum bar"
                  >
                    &gt;
                  </button>
                </div>
                <StepGrid
                  track={drumsTrack}
                  barFrom={Math.min(gridBar, song.bars)}
                  beatsPerBar={song.time_sig[0]}
                  onDispatch={dispatch}
                />
              </div>
            )}

            <OptionCards
              song={song}
              previewOptionId={engineState.preview?.option_id ?? null}
              onAudition={onAudition}
              onChoose={onChoose}
            />
          </div>

          <div className="rail">
            <TakePanel
              recorder={recorderPort}
              trackId={selectedTrackId}
              take={pendingTake}
              request={takeRequest}
              onTake={onTake}
              onRetake={() => engine.setPendingTake(null)}
              onCommit={onCommit}
              onImportFile={onImportFile}
            />
            <ProducerNotes bus={bus} />
            <ExportPanel engine={engine} onError={setError} />
          </div>
        </div>

        <Keyboard recorder={keyboardPort} />

        <ActivityStrip
          bus={bus}
          canUndoItem={(revision) =>
            engine.store.history.getPast().some((item) => item.revision === revision)
          }
          onUndoItem={(revision) => {
            const undone = engine.store.undoItem(revision, 'human');
            if (undone === null) setError('That edit is no longer in the history.');
          }}
        />
      </main>

      {panel === 'diagnostics' ? (
        <Diagnostics runtime={runtime} onClose={() => setPanel('none')} />
      ) : null}
      {panel === 'about' ? (
        <About
          onClose={() => setPanel('none')}
          onLoadExample={emptySong ? () => replaceSong('example') : undefined}
          fallbacks={Object.values(engineState.fallbacks)}
        />
      ) : null}
    </div>
  );
}
