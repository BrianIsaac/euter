import { useState, useSyncExternalStore, type CSSProperties, type DragEvent } from 'react';
import type { Take } from '../song/types.ts';
import type {
  RecordedTake,
  RecorderController,
  RecorderResult,
  RecorderSnapshot,
  StartRecordingOptions,
} from '../input/recorder.ts';
import type { ArmedTakeRequest } from '../input/requestTake.ts';
import type { QuantiseGrid } from '../theory/quantise.ts';
import './roll/lane-b.css';

export interface TakeCommitOptions {
  takeId: string;
  grid: QuantiseGrid;
  strength: number;
}

export interface RecorderPanelPort {
  getSnapshot(): RecorderSnapshot;
  subscribe(listener: () => void): () => void;
  start(options: StartRecordingOptions): Promise<RecorderResult<RecorderSnapshot>>;
  stop(): Promise<RecorderResult<RecordedTake>>;
}

export interface TakePanelProps {
  recorder: RecorderPanelPort | RecorderController;
  /** Track selected in the song when no agent take request names a different target. */
  trackId?: string | undefined;
  /** Full arranged range used when the person records without an agent request. */
  songBars?: number | undefined;
  take?: Take | null;
  request?: ArmedTakeRequest | null;
  onTake?: (recorded: RecordedTake) => void;
  onRetake?: () => void;
  onCommit: (options: TakeCommitOptions) => void;
  onImportFile?: (file: File) => void;
}

function pitchLabel(hz: number): string {
  if (hz <= 0) return '—';
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function recordingOptions(
  request: ArmedTakeRequest | null | undefined,
  trackId: string | undefined,
  songBars: number | undefined,
  monitorInput: boolean,
): StartRecordingOptions {
  return {
    countInBars: 1,
    metronome: true,
    monitorInput,
    ...(request === null || request === undefined
      ? trackId === undefined || trackId === ''
        ? {}
        : {
            trackId,
            ...(songBars === undefined ? {} : { targetBars: { barFrom: 1, barTo: songBars } }),
          }
      : {
          trackId: request.trackId,
          targetBars: request.targetBars,
          prompt: request.prompt,
        }),
  };
}

export function TakePanel({
  recorder,
  trackId,
  songBars,
  take = null,
  request = null,
  onTake,
  onRetake,
  onCommit,
  onImportFile,
}: TakePanelProps) {
  const snapshot = useSyncExternalStore(recorder.subscribe, recorder.getSnapshot);
  const [grid, setGrid] = useState<QuantiseGrid>('16n');
  const [strength, setStrength] = useState(0.75);
  const [monitorInput, setMonitorInput] = useState(false);
  const busy = snapshot.status !== 'idle' && snapshot.status !== 'error';
  const canStop = snapshot.status === 'recording' || snapshot.status === 'counting-in';

  const start = (): void => {
    if (take !== null) onRetake?.();
    void recorder.start(recordingOptions(request, trackId, songBars, monitorInput));
  };
  const stop = (): void => {
    void recorder.stop().then((result) => {
      if (result.ok) onTake?.(result.data);
    });
  };
  const receiveFile = (file: File | undefined): void => {
    if (file !== undefined) onImportFile?.(file);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    receiveFile(event.dataTransfer.files[0]);
  };

  return (
    <section className="take-panel" aria-label="Take recorder">
      <header className="lane-b-header">
        <div>
          <h2>Take</h2>
          <span className="muted">{snapshot.status.replace('-', ' ')}</span>
        </div>
        <span className="mono">{take === null ? 'No take' : take.id}</span>
      </header>

      {request === null ? null : (
        <div className="request-take-banner" role="status" data-testid="request-take-banner">
          <span className="request-take-bars">
            bars {request.targetBars.barFrom}-{request.targetBars.barTo}
          </span>
          <strong>Your producer has left this part to you</strong>
          <span>{request.prompt}</span>
        </div>
      )}

      <div className="live-pitch" aria-label="Live pitch">
        <strong>{pitchLabel(snapshot.live?.hz ?? 0)}</strong>
        <span
          className="live-pitch-line"
          style={{ '--clarity': snapshot.live?.clarity ?? 0 } as CSSProperties}
          aria-label={`Clarity ${Math.round((snapshot.live?.clarity ?? 0) * 100)}%`}
        />
        <span className="mono">
          {snapshot.live === null ? '—' : `${Math.round(snapshot.live.hz)} Hz`}
        </span>
      </div>

      {snapshot.status === 'counting-in' ? (
        <p role="status">Count-in: listen for the bar, then begin.</p>
      ) : null}
      {snapshot.monitoring === null ? null : (
        <p className="muted" role="status">
          {snapshot.monitoring.backing === 'arrangement'
            ? 'Arrangement monitor is playing.'
            : 'Click monitor is playing.'}{' '}
          {snapshot.monitoring.input
            ? 'Your mic is monitored too; keep headphones on.'
            : 'Mic monitoring is off.'}{' '}
          Device-reported latency compensation{' '}
          {Math.round(
            (snapshot.monitoring.input_latency_s +
              snapshot.monitoring.base_latency_s +
              snapshot.monitoring.output_latency_s) *
              1000,
          )}{' '}
          ms.
        </p>
      )}
      {snapshot.error === null ? null : (
        <p className="input-error" role="alert">
          {snapshot.error.message}
        </p>
      )}

      {take === null ? null : (
        <>
          <div className="take-quality">
            <span>Voiced {Math.round(take.voiced_ratio * 100)}%</span>
            <span>Clarity {Math.round(take.median_clarity * 100)}%</span>
            <span>
              Range {take.pitch_range[0]}-{take.pitch_range[1]}
            </span>
          </div>
          {take.audio?.alignment === undefined ? null : (
            <p className="muted">
              Aligned from the capture clock with{' '}
              {Math.round(
                (take.audio.alignment.input_latency_s +
                  take.audio.alignment.base_latency_s +
                  take.audio.alignment.output_latency_s) *
                  1000,
              )}{' '}
              ms of device-reported latency compensation.
            </p>
          )}
          {take.median_clarity < 0.6 || take.voiced_ratio < 0.45 ? (
            <p className="quality-warning" role="status">
              The notes were hard to hear. Move closer to the mic or try another take.
            </p>
          ) : null}
          <div className="quantise-controls">
            <label>
              Grid{' '}
              <select
                value={grid}
                onChange={(event) => setGrid(event.target.value as QuantiseGrid)}
              >
                <option value="8n">1/8</option>
                <option value="16n">1/16</option>
              </select>
            </label>
            <label>
              Quantise {Math.round(strength * 100)}%
              <input
                aria-label="Quantise strength"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={strength}
                onChange={(event) => setStrength(Number(event.target.value))}
              />
            </label>
          </div>
        </>
      )}

      <div className="take-actions">
        <label>
          <input
            aria-label="Monitor my microphone"
            type="checkbox"
            checked={monitorInput}
            disabled={busy}
            onChange={(event) => setMonitorInput(event.target.checked)}
          />{' '}
          Hear my voice (headphones)
        </label>
        {canStop ? (
          <button type="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={start}>
            {take === null ? 'Record' : 'Retake'}
          </button>
        )}
        {take === null ? null : (
          <button type="button" onClick={() => onCommit({ takeId: take.id, grid, strength })}>
            Commit take
          </button>
        )}
        <label>
          <span className="muted">Import</span>{' '}
          <input
            aria-label="Import audio file"
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.ogg"
            onChange={(event) => receiveFile(event.target.files?.[0])}
          />
        </label>
        <div className="audio-drop" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
          Drop a voice memo here
        </div>
      </div>
    </section>
  );
}
