/**
 * The export panel (plan Architecture item 6): the same job list the person watches and the agent
 * polls with `get_job`. The download link is a blob URL the person clicks; no file crosses a tool
 * boundary.
 */
import { useSyncExternalStore } from 'react';
import type { Engine } from '../webmcp/engine.ts';

export interface ExportPanelProps {
  engine: Engine;
  onError(message: string): void;
}

const FORMATS = [
  { format: 'wav', label: 'WAV' },
  { format: 'mp3', label: 'MP3' },
  { format: 'midi', label: 'MIDI' },
] as const;

/**
 * Renders the export buttons and every job with its progress and link.
 *
 * @param props - The engine and an error sink.
 * @returns The panel.
 */
export function ExportPanel({ engine, onError }: ExportPanelProps) {
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const song = engine.store.getDocument();

  const start = (format: 'wav' | 'mp3' | 'midi'): void => {
    try {
      engine.startExport(format, 1, song.bars);
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="exports" aria-label="Export">
      <header className="exports-header">
        <h2>Export</h2>
        <div className="export-buttons">
          {FORMATS.map(({ format, label }) => (
            <button key={format} type="button" onClick={() => start(format)}>
              {label}
            </button>
          ))}
        </div>
      </header>
      {snapshot.jobs.length === 0 ? (
        <p className="muted">Render the song to a file you can play outside the browser.</p>
      ) : (
        <ul className="export-list">
          {[...snapshot.jobs].reverse().map((job) => {
            const result = job.state === 'completed' ? engine.exportResult(job.id) : null;
            return (
              <li key={job.id} data-testid="export-job">
                <span className="mono">{job.kind}</span>
                <span>{job.state}</span>
                <progress max={100} value={job.progress_pct} aria-label={`${job.kind} progress`} />
                {result === null ? null : (
                  <a href={result.download_url} download={result.filename}>
                    {result.filename}
                  </a>
                )}
                {job.state === 'running' || job.state === 'queued' ? (
                  <button type="button" onClick={() => engine.jobs.cancel(job.id)}>
                    Cancel
                  </button>
                ) : null}
                {job.error === undefined ? null : <span className="input-error">{job.error}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
