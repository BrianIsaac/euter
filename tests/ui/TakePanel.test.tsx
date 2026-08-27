import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RecordedTake, RecorderSnapshot } from '../../src/input/recorder.ts';
import type { ArmedTakeRequest } from '../../src/input/requestTake.ts';
import type { Take } from '../../src/song/types.ts';
import { TakePanel, type RecorderPanelPort } from '../../src/ui/TakePanel.tsx';

function makeTake(overrides: Partial<Take> = {}): Take {
  return {
    id: 'take-1',
    source: 'mic',
    notes: [{ p: 60, s: 0, d: 1, v: 0.8, source: 'take' }],
    pitch_track: [],
    duration_s: 2,
    voiced_ratio: 0.8,
    median_clarity: 0.9,
    pitch_range: [60, 64],
    tempo_hint: 120,
    ...overrides,
  };
}

const idle: RecorderSnapshot = {
  status: 'idle',
  live: null,
  targetBars: null,
  trackId: null,
  prompt: null,
  error: null,
};

function fakeRecorder(initial: RecorderSnapshot, recorded = makeTake()) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const recordedTake: RecordedTake = {
    take: recorded,
    wav: new Blob([], { type: 'audio/wav' }),
    trackId: null,
    targetBars: null,
  };
  const port: RecorderPanelPort & { publish(next: RecorderSnapshot): void } = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: vi.fn(async () => ({ ok: true as const, data: snapshot })),
    stop: vi.fn(async () => ({ ok: true as const, data: recordedTake })),
    publish(next) {
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
  return port;
}

const request: ArmedTakeRequest = {
  id: 'request-1',
  trackId: 'bass',
  targetBars: { barFrom: 9, barTo: 16 },
  prompt: 'Hum me a bassline for the chorus',
  armedAt: 1,
};

describe('TakePanel', () => {
  it('shows and records the request_take prompt on its named bars', () => {
    const recorder = fakeRecorder(idle);
    render(<TakePanel recorder={recorder} request={request} onCommit={vi.fn()} />);
    expect(screen.getByTestId('request-take-banner')).toHaveTextContent('bars 9-16');
    expect(screen.getByTestId('request-take-banner')).toHaveTextContent(
      'Hum me a bassline for the chorus',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(recorder.start).toHaveBeenCalledWith({
      countInBars: 1,
      metronome: true,
      trackId: 'bass',
      targetBars: { barFrom: 9, barTo: 16 },
      prompt: 'Hum me a bassline for the chorus',
    });
  });

  it('renders the live pitch line and returns the stopped take', async () => {
    const snapshot: RecorderSnapshot = {
      ...idle,
      status: 'recording',
      live: { hz: 440, clarity: 0.94, rms: 0.2 },
    };
    const recorder = fakeRecorder(snapshot);
    const onTake = vi.fn();
    render(<TakePanel recorder={recorder} onCommit={vi.fn()} onTake={onTake} />);
    expect(screen.getByText('A4')).toBeInTheDocument();
    expect(screen.getByText('440 Hz')).toBeInTheDocument();
    expect(screen.getByLabelText('Clarity 94%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await vi.waitFor(() => expect(onTake).toHaveBeenCalledOnce());
  });

  it('offers retake and commits the selected grid and strength', () => {
    const recorder = fakeRecorder(idle);
    const onCommit = vi.fn();
    const onRetake = vi.fn();
    render(
      <TakePanel recorder={recorder} take={makeTake()} onCommit={onCommit} onRetake={onRetake} />,
    );
    fireEvent.change(screen.getByLabelText('Quantise strength'), { target: { value: '0.4' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '8n' } });
    fireEvent.click(screen.getByRole('button', { name: 'Commit take' }));
    expect(onCommit).toHaveBeenCalledWith({ takeId: 'take-1', grid: '8n', strength: 0.4 });
    fireEvent.click(screen.getByRole('button', { name: 'Retake' }));
    expect(onRetake).toHaveBeenCalledOnce();
    expect(recorder.start).toHaveBeenCalledOnce();
  });

  it('warns on a low-quality take and accepts picker and drop files', () => {
    const recorder = fakeRecorder(idle);
    const onImportFile = vi.fn();
    render(
      <TakePanel
        recorder={recorder}
        take={makeTake({ median_clarity: 0.4, voiced_ratio: 0.3 })}
        onCommit={vi.fn()}
        onImportFile={onImportFile}
      />,
    );
    expect(screen.getByText(/hard to hear/)).toBeInTheDocument();
    const picked = new File(['one'], 'one.wav');
    fireEvent.change(screen.getByLabelText('Import audio file'), { target: { files: [picked] } });
    const dropped = new File(['two'], 'two.wav');
    fireEvent.drop(screen.getByText('Drop a voice memo here'), {
      dataTransfer: { files: [dropped] },
    });
    expect(onImportFile).toHaveBeenNthCalledWith(1, picked);
    expect(onImportFile).toHaveBeenNthCalledWith(2, dropped);
  });
});
