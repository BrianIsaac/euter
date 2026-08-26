import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App.tsx';
import { createRuntime } from '../../src/webmcp/runtime.ts';
import { createFakeContext } from '../helpers/fakeContext.ts';

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the name, the tool status, the placeholders and the strip', async () => {
    const context = createFakeContext();
    const runtime = createRuntime({ contexts: () => [context] });
    render(<App runtime={runtime} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Euterpe' })).toBeInTheDocument();
    expect(screen.getByTestId('tool-status')).toHaveTextContent('Agent tools: initialising');
    await act(async () => {
      await runtime.registry.register();
    });
    expect(screen.getByTestId('tool-status')).toHaveTextContent('Agent tools: ready (2)');
    expect(screen.getByLabelText('Transport')).toHaveTextContent('28 Aug');
    expect(screen.getByLabelText('Piano roll')).toHaveTextContent('lane B');
    expect(screen.getByLabelText('Tracks')).toHaveTextContent('No tracks yet');
    expect(screen.getByLabelText('Activity')).toBeInTheDocument();
    expect(screen.getByLabelText('Producer notes')).toBeInTheDocument();
    expect(screen.getByTestId('song-revision')).toHaveTextContent('r0');

    await act(async () => {
      await runtime.registry.invoke('ping', { message: 'hi' });
    });
    expect(screen.getByTestId('song-revision')).toHaveTextContent('r1');
    expect(screen.getByText('ping: hi')).toBeInTheDocument();
  });

  it('opens and closes the diagnostics and about panels', () => {
    const runtime = createRuntime({ contexts: () => [] });
    render(<App runtime={runtime} />);
    expect(screen.queryByLabelText('Diagnostics')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
    expect(screen.getByLabelText('Diagnostics')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(screen.queryByLabelText('Diagnostics')).not.toBeInTheDocument();
    expect(screen.getByLabelText('About')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close about' }));
    expect(screen.queryByLabelText('About')).not.toBeInTheDocument();
  });
});
