import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Diagnostics } from '../../src/ui/Diagnostics.tsx';
import { tools } from '../../src/webmcp/tools/index.ts';
import { createRuntime } from '../../src/webmcp/runtime.ts';
import { createFakeContext } from '../helpers/fakeContext.ts';

class FakeAudioContext {
  state = 'suspended';
  sampleRate = 44100;
  baseLatency = 0.01;
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => undefined);
  createOscillator = vi.fn(() => ({
    type: '',
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }));
  createGain = vi.fn(() => ({ gain: { value: 0 }, connect: vi.fn() }));
  createAnalyser = vi.fn(() => ({ fftSize: 0, getFloatTimeDomainData: vi.fn() }));
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
}

describe('Diagnostics', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('', {
            status: 200,
            headers: {
              'permissions-policy': 'tools=(self), microphone=(self), midi=(self)',
              'origin-agent-cluster': '?1',
            },
          }),
      ),
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          throw new DOMException('Permission denied', 'NotAllowedError');
        }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('shows identity, WebMCP state, headers, audio before and after, and the call log', async () => {
    const context = createFakeContext();
    const runtime = createRuntime({ contexts: () => [context], storage: null });
    await runtime.registry.register();
    await runtime.registry.invoke('ping', { message: 'hello' });
    await runtime.registry.invoke('ping', { message: 5 });
    const onClose = vi.fn();
    render(<Diagnostics runtime={runtime} onClose={onClose} />);

    expect(screen.getByText(navigator.userAgent)).toBeInTheDocument();
    expect(screen.getByTestId('registry-status')).toHaveTextContent(`ready (${tools.length})`);
    await waitFor(() => {
      expect(screen.getByText('tools=(self), microphone=(self), midi=(self)')).toBeInTheDocument();
    });
    expect(screen.getByText('?1')).toBeInTheDocument();
    expect(screen.getByTestId('audio-before')).toHaveTextContent(
      'suspended, 44100 Hz, base 10.0 ms',
    );
    expect(screen.getByTestId('audio-after')).toHaveTextContent('not read yet');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play test tone' }));
    });
    expect(screen.getByTestId('audio-after')).toHaveTextContent('running, 44100 Hz');
    expect(screen.getByRole('button', { name: 'Play test tone again' })).toBeInTheDocument();

    const calls = screen.getAllByTestId('tool-call');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toHaveTextContent('error INVALID_ARGUMENT');
    expect(calls[1]).toHaveTextContent('ping');
    expect(calls[1]).toHaveTextContent('{"message":"hello"}');
    expect(screen.getByText('Last 2 tool calls')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close diagnostics' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('reports the microphone error name and the MIDI result', async () => {
    const runtime = createRuntime({ contexts: () => [] });
    render(<Diagnostics runtime={runtime} onClose={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Test microphone' }));
    });
    expect(screen.getByTestId('microphone-result')).toHaveTextContent(
      'NotAllowedError: Permission denied',
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Test MIDI' }));
    });
    expect(screen.getByTestId('midi-result')).toHaveTextContent('NotSupportedError');
    expect(screen.getByText('No tool calls yet.')).toBeInTheDocument();
    expect(screen.getByTestId('registry-status')).toHaveTextContent('initialising');
  });

  it('shows an open microphone with a stop button and stops it', async () => {
    const stop = vi.fn();
    const track = { label: 'USB mic', stop };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getAudioTracks: () => [track],
          getTracks: () => [track],
        })),
      },
    });
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const runtime = createRuntime({ contexts: () => [] });
    render(<Diagnostics runtime={runtime} onClose={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Test microphone' }));
    });
    expect(screen.getByTestId('microphone-result')).toHaveTextContent('open: USB mic');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop microphone' }));
    });
    expect(stop).toHaveBeenCalled();
    expect(screen.getByTestId('microphone-result')).toHaveTextContent('not tested');
  });
});
