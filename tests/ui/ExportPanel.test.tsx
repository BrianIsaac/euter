import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExportPanel } from '../../src/ui/ExportPanel.tsx';
import { createTestEngine } from '../helpers/harness.ts';

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

describe('ExportPanel', () => {
  it('starts a render and shows the finished download link', async () => {
    const { engine } = createTestEngine();
    render(<ExportPanel engine={engine} onError={() => undefined} />);
    expect(screen.getByText(/Render the song to a file/u)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'WAV' }));
    await settle();

    const job = screen.getByTestId('export-job');
    expect(job).toHaveTextContent('completed');
    const link = screen.getByRole('link', { name: 'first-light.wav' });
    expect(link).toHaveAttribute('download', 'first-light.wav');
    expect(link.getAttribute('href')).toMatch(/^blob:euter\//u);
    engine.dispose();
  });

  it('offers cancel while a job runs and reports the failure of a broken one', async () => {
    let release: () => void = () => undefined;
    const { engine } = createTestEngine({
      exporters: {
        render: () =>
          new Promise((_resolve, reject) => {
            release = () => reject(new Error('render died'));
          }),
      },
    });
    render(<ExportPanel engine={engine} onError={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'MP3' }));
    await settle();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    await act(async () => {
      release();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(screen.getByTestId('export-job')).toHaveTextContent('render died');
    engine.dispose();
  });

  it('exports MIDI for the whole song', async () => {
    const { engine } = createTestEngine();
    render(<ExportPanel engine={engine} onError={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'MIDI' }));
    await settle();
    expect(screen.getByRole('link', { name: 'first-light.mid' })).toBeInTheDocument();
    engine.dispose();
  });
});
