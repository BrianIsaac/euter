/**
 * The track list (plan Architecture item 8): the tracks, what plays them and the mix. Every change
 * a person makes here is the same command the agent's `set_mix`, `set_instrument` and `add_track`
 * dispatch, so both appear in the activity strip.
 */
import { useState } from 'react';
import { INSTRUMENT_CATALOGUE } from '../audio/instruments.ts';
import type { SongDocument, TrackKind } from '../song/types.ts';
import type { Command } from '../webmcp/bus.ts';

export interface TrackListProps {
  song: SongDocument;
  selectedTrackId: string;
  onSelect(trackId: string): void;
  onDispatch(command: Command): void;
}

const KIND_INSTRUMENT: Record<TrackKind, string> = {
  melody: 'grand-piano',
  chords: 'electric-piano',
  bass: 'sub-bass',
  drums: 'studio-kit',
  vocal: 'recorded-voice',
};

const KINDS: TrackKind[] = ['melody', 'chords', 'bass', 'drums', 'vocal'];

/**
 * Renders the list.
 *
 * @param props - The song, the selection and the dispatcher.
 * @returns The track list.
 */
export function TrackList({ song, selectedTrackId, onSelect, onDispatch }: TrackListProps) {
  const [kind, setKind] = useState<TrackKind>('chords');

  const mix = (trackId: string, args: Record<string, number | boolean>, why: string): void => {
    onDispatch({ type: 'set_mix', args: { track_id: trackId, ...args }, source: 'human', why });
  };

  return (
    <aside className="tracks" aria-label="Tracks">
      <header className="tracks-header">
        <h2>Tracks</h2>
        <span className="muted">{song.tracks.length}</span>
      </header>

      <ul className="track-list">
        {song.tracks.map((track) => (
          <li
            key={track.id}
            className={`track${track.id === selectedTrackId ? ' selected' : ''}`}
            data-testid="track"
          >
            <button
              type="button"
              className="track-name"
              aria-pressed={track.id === selectedTrackId}
              onClick={() => onSelect(track.id)}
            >
              {track.name}
              <span className="muted">
                {' '}
                {track.kind === 'vocal'
                  ? `${track.clips.length} clip${track.clips.length === 1 ? '' : 's'}`
                  : `${track.notes.length} notes`}
              </span>
              {track.id === selectedTrackId ? <span className="muted"> armed</span> : null}
            </button>

            {track.kind === 'vocal' ? (
              <span className="track-field">
                <span className="muted">sound</span>
                <span>recorded voice</span>
              </span>
            ) : (
              <label className="track-field">
                <span className="muted">sound</span>
                <select
                  aria-label={`Instrument for ${track.name}`}
                  value={track.instrument}
                  onChange={(event) =>
                    onDispatch({
                      type: 'set_instrument',
                      args: { track_id: track.id, instrument: event.target.value },
                      source: 'human',
                      why: `Changed ${track.name} to ${event.target.value}.`,
                    })
                  }
                >
                  {INSTRUMENT_CATALOGUE.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="track-field">
              <span className="muted">level</span>
              <input
                aria-label={`Volume for ${track.name}`}
                type="range"
                min={-60}
                max={6}
                step={1}
                value={track.volume_db}
                onChange={(event) =>
                  mix(
                    track.id,
                    { volume_db: Number(event.target.value) },
                    `Set ${track.name} to ${event.target.value} dB.`,
                  )
                }
              />
            </label>

            <div className="track-toggles">
              <button
                type="button"
                aria-pressed={track.mute}
                onClick={() =>
                  mix(
                    track.id,
                    { mute: !track.mute },
                    `${track.mute ? 'Unmuted' : 'Muted'} ${track.name}.`,
                  )
                }
              >
                Mute
              </button>
              <button
                type="button"
                aria-pressed={track.solo}
                onClick={() =>
                  mix(
                    track.id,
                    { solo: !track.solo },
                    `${track.solo ? 'Unsoloed' : 'Soloed'} ${track.name}.`,
                  )
                }
              >
                Solo
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="track-add">
        <label className="track-field">
          <span className="muted">add</span>
          <select
            aria-label="Kind of track to add"
            value={kind}
            onChange={(event) => setKind(event.target.value as TrackKind)}
          >
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() =>
            onDispatch({
              type: 'add_track',
              args: { kind, instrument: KIND_INSTRUMENT[kind] },
              source: 'human',
              why: `Added a ${kind} track from the track list.`,
            })
          }
        >
          Add track
        </button>
      </div>
    </aside>
  );
}
