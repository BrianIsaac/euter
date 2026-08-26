import { useState, type CSSProperties } from 'react';
import type { Note, Track } from '../song/types.ts';
import type { Command } from '../webmcp/bus.ts';
import { humanNotesCommand } from './roll/editCommands.ts';
import './roll/lane-b.css';

export interface DrumLane {
  name: string;
  pitch: number;
}

export interface StepGridProps {
  track: Track;
  bars?: number;
  barFrom?: number;
  beatsPerBar?: number;
  lanes?: readonly DrumLane[];
  onDispatch(command: Command): void;
}

const DEFAULT_LANES: readonly DrumLane[] = [
  { name: 'Kick', pitch: 36 },
  { name: 'Snare', pitch: 38 },
  { name: 'Clap', pitch: 39 },
  { name: 'Closed hat', pitch: 42 },
];

function noteAt(notes: readonly Note[], pitch: number, start: number): Note | undefined {
  return notes.find((note) => note.p === pitch && Math.abs(note.s - start) < 0.001);
}

export function StepGrid({
  track,
  bars = 1,
  barFrom = 1,
  beatsPerBar = 4,
  lanes = DEFAULT_LANES,
  onDispatch,
}: StepGridProps) {
  const [velocity, setVelocity] = useState(0.8);
  const stepsPerBar = 16;
  const stepCount = bars * stepsPerBar;
  const stepDuration = beatsPerBar / stepsPerBar;
  const rangeStart = (barFrom - 1) * beatsPerBar;

  const toggle = (lane: DrumLane, step: number): void => {
    const start = rangeStart + step * stepDuration;
    const existing = noteAt(track.notes, lane.pitch, start);
    const notes =
      existing === undefined
        ? [
            ...track.notes,
            {
              p: lane.pitch,
              s: start,
              d: stepDuration,
              v: velocity,
              source: 'human' as const,
            },
          ]
        : track.notes.filter((note) => note !== existing);
    notes.sort((a, b) => a.s - b.s || a.p - b.p);
    onDispatch(
      humanNotesCommand(
        track.id,
        notes,
        `${existing === undefined ? 'Added' : 'Removed'} ${lane.name} at bar ${barFrom + Math.floor(step / stepsPerBar)}, step ${(step % stepsPerBar) + 1}`,
      ),
    );
  };

  if (track.kind !== 'drums') {
    return (
      <section className="step-grid-panel" aria-label="Drum step grid">
        <p className="input-error">Choose a drums track for the step grid.</p>
      </section>
    );
  }

  return (
    <section className="step-grid-panel" aria-label="Drum step grid">
      <header className="lane-b-header">
        <div>
          <h2>{track.name}</h2>
          <span className="muted">16 steps per bar</span>
        </div>
        <label className="velocity-control">
          Velocity {Math.round(velocity * 100)}%
          <input
            aria-label="Step velocity"
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={velocity}
            onChange={(event) => setVelocity(Number(event.target.value))}
          />
        </label>
      </header>
      <div className="step-grid" style={{ gridTemplateColumns: `80px repeat(${stepCount}, 24px)` }}>
        <span className="step-label">Bar</span>
        {Array.from({ length: stepCount }, (_, step) => (
          <span key={`heading-${step}`} className="mono" aria-hidden="true">
            {(step % stepsPerBar) + 1}
          </span>
        ))}
        {lanes.flatMap((lane) => [
          <span key={`${lane.pitch}-label`} className="step-label">
            {lane.name}
          </span>,
          ...Array.from({ length: stepCount }, (_, step) => {
            const start = rangeStart + step * stepDuration;
            const existing = noteAt(track.notes, lane.pitch, start);
            const bar = barFrom + Math.floor(step / stepsPerBar);
            return (
              <button
                key={`${lane.pitch}-${step}`}
                type="button"
                className={`step-cell${existing === undefined ? '' : ' active'}`}
                style={{ '--velocity': existing?.v ?? velocity } as CSSProperties}
                aria-pressed={existing !== undefined}
                aria-label={`${lane.name}, bar ${bar}, step ${(step % stepsPerBar) + 1}${
                  existing === undefined ? '' : `, velocity ${Math.round(existing.v * 100)}%`
                }`}
                onClick={() => toggle(lane, step)}
              />
            );
          }),
        ])}
      </div>
    </section>
  );
}
