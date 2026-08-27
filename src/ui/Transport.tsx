/**
 * The transport bar (plan Architecture item 8): play, stop, tempo and what the audio engine is
 * doing. Play is the person's gesture, so it creates the audio context before it asks the
 * transport for anything (Decision 24).
 */
import { useState, useSyncExternalStore } from 'react';
import type { SongDocument } from '../song/types.ts';
import type { Command } from '../webmcp/bus.ts';
import type { Engine } from '../webmcp/engine.ts';

export interface TransportProps {
  engine: Engine;
  song: SongDocument;
  onDispatch(command: Command): void;
  onError(message: string): void;
}

/**
 * Turns anything thrown by the engine into one line for the person.
 *
 * @param thrown - The thrown value.
 * @returns The message.
 */
export function transportMessage(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/**
 * Renders the transport.
 *
 * @param props - The engine, the song and the dispatch and error handlers.
 * @returns The transport bar.
 */
export function Transport({ engine, song, onDispatch, onError }: TransportProps) {
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [fromBar, setFromBar] = useState(1);

  const play = (): void => {
    void engine
      .activate()
      .then(() => engine.play({ from_bar: Math.min(Math.max(1, fromBar), song.bars) }))
      .catch((error: unknown) => onError(transportMessage(error)));
  };
  const stop = (): void => {
    void engine.stop().catch((error: unknown) => onError(transportMessage(error)));
  };
  const setTempo = (bpm: number): void => {
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 220 || bpm === song.bpm) return;
    onDispatch({
      type: 'set_tempo',
      args: { bpm },
      source: 'human',
      why: `Set the tempo to ${bpm} bpm from the transport.`,
    });
  };

  return (
    <section className="transport" aria-label="Transport">
      <div className="transport-buttons">
        <button type="button" onClick={play} data-testid="play">
          {snapshot.playing ? 'Play again' : 'Play'}
        </button>
        <button type="button" onClick={stop} disabled={!snapshot.playing}>
          Stop
        </button>
        <label className="transport-field">
          from bar
          <input
            aria-label="Play from bar"
            type="number"
            min={1}
            max={song.bars}
            value={fromBar}
            onChange={(event) => setFromBar(Number(event.target.value))}
          />
        </label>
      </div>

      <label className="transport-field">
        tempo
        <input
          aria-label="Tempo in bpm"
          type="number"
          min={40}
          max={220}
          value={song.bpm}
          onChange={(event) => setTempo(Number(event.target.value))}
        />
        <span className="muted">bpm</span>
      </label>

      <dl className="transport-readout">
        <div>
          <dt>Audio</dt>
          <dd data-testid="audio-state">{snapshot.audio.running ? 'running' : 'locked'}</dd>
        </div>
        <div>
          <dt>Bars</dt>
          <dd>{song.bars}</dd>
        </div>
        <div>
          <dt>Key</dt>
          <dd>{song.key.name}</dd>
        </div>
      </dl>

      {snapshot.preview === null ? null : (
        <p className="transport-preview" role="status">
          Auditioning <strong>{snapshot.preview.label}</strong>; nothing is committed until you
          choose it.
        </p>
      )}
      {Object.entries(snapshot.loading).length === 0 ? null : (
        <p className="muted" role="status">
          Loading{' '}
          {Object.entries(snapshot.loading)
            .map(([key, value]) => `${key.split(':')[1] ?? key} ${Math.round(value * 100)}%`)
            .join(', ')}
        </p>
      )}
      {Object.values(snapshot.fallbacks).length === 0 ? null : (
        <p className="muted" role="status">
          {Object.values(snapshot.fallbacks).join(' ')}
        </p>
      )}
    </section>
  );
}
