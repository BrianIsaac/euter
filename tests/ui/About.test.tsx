import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  About,
  measuredMarkdown,
  remoteSampleState,
  sampleLicenceBlocks,
} from '../../src/ui/About.tsx';

describe('About', () => {
  it('shows the licence, the versions and the measured section from the day-one file', () => {
    const onClose = vi.fn();
    render(<About onClose={onClose} />);
    expect(screen.getByText('About Euterpe')).toBeInTheDocument();
    expect(screen.getByText(/MIT License/)).toBeInTheDocument();
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('Measured in the ChatGPT desktop app')).toBeInTheDocument();
    expect(measuredMarkdown()).toContain('# Day-one checks');
    expect(screen.queryByText(/have not been run on this build yet/)).not.toBeInTheDocument();
    expect(screen.getByText('Site tools appear and run')).toBeInTheDocument();
    expect(screen.getByText('GPT-5.6 Sol, Extra High')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close about' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('offers the example song loader only when the shell provides one', () => {
    const onLoadExample = vi.fn();
    const { rerender } = render(<About onClose={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Load the example song' })).not.toBeInTheDocument();
    rerender(<About onClose={() => undefined} onLoadExample={onLoadExample} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load the example song' }));
    expect(onLoadExample).toHaveBeenCalled();
  });

  it('names the sample sources, their licences and the mediabunny exception', () => {
    render(<About onClose={() => undefined} />);
    expect(screen.getByText('Sounds and licences')).toBeInTheDocument();
    expect(screen.getAllByText(/Splendid Grand Piano/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('CC0 1.0').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/mediabunny packages used for MP3 export are MPL-2.0/),
    ).toBeInTheDocument();
    const blocks = sampleLicenceBlocks();
    expect(blocks.some((block) => block.kind === 'table')).toBe(true);
    expect(blocks.every((block) => block.kind !== 'heading')).toBe(true);
    expect(JSON.stringify(blocks)).not.toContain('R2_SECRET_ACCESS_KEY');
  });

  it('reports the remote pack as configured, fallen back or absent', () => {
    expect(remoteSampleState([], undefined).kind).toBe('unconfigured');
    expect(remoteSampleState([], '  ').kind).toBe('unconfigured');
    expect(remoteSampleState([], 'https://pack.example').kind).toBe('remote');
    const fallen = remoteSampleState(['Electric piano is unavailable.'], 'https://pack.example');
    expect(fallen.kind).toBe('bundled');
    expect(fallen.base).toBe('https://pack.example');
    expect(fallen.sentence).toContain('bundled subset instead');
  });

  it('shows the configured origin and every fallback notice in the panel', () => {
    vi.stubEnv('VITE_SAMPLES_BASE_URL', 'https://pack.example');
    render(<About onClose={() => undefined} fallbacks={['Electric piano needs the pack.']} />);
    expect(screen.getByTestId('sample-origin')).toHaveTextContent('https://pack.example');
    expect(screen.getByText('Electric piano needs the pack.')).toBeInTheDocument();
    vi.unstubAllEnvs();
  });
});
