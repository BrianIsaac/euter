import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Transport, transportMessage } from '../../src/ui/Transport.tsx';
import { createTestEngine, fakeAudio } from '../helpers/harness.ts';

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Transport', () => {
  it('creates the audio context on Play and starts from the chosen bar', async () => {
    const audio = fakeAudio('uninitialised');
    const { engine, transport } = createTestEngine({ audio });
    render(
      <Transport
        engine={engine}
        song={engine.store.getDocument()}
        onDispatch={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(screen.getByTestId('audio-state')).toHaveTextContent('locked');

    fireEvent.change(screen.getByLabelText('Play from bar'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('play'));
    await flush();

    expect(audio.activations).toBe(1);
    expect(transport.calls.play).toEqual([{ from_bar: 5 }]);
    expect(screen.getByTestId('audio-state')).toHaveTextContent('running');
    engine.dispose();
  });

  it('stops only while something is playing', async () => {
    const { engine, transport } = createTestEngine();
    render(
      <Transport
        engine={engine}
        song={engine.store.getDocument()}
        onDispatch={() => undefined}
        onError={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
    fireEvent.click(screen.getByTestId('play'));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await flush();
    expect(transport.calls.stop).toBe(1);
    engine.dispose();
  });

  it('dispatches a tempo change as a human command and ignores out-of-range values', () => {
    const { engine } = createTestEngine();
    const onDispatch = vi.fn();
    render(
      <Transport
        engine={engine}
        song={engine.store.getDocument()}
        onDispatch={onDispatch}
        onError={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText('Tempo in bpm'), { target: { value: '104' } });
    expect(onDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'set_tempo', args: { bpm: 104 }, source: 'human' }),
    );
    onDispatch.mockClear();
    fireEvent.change(screen.getByLabelText('Tempo in bpm'), { target: { value: '900' } });
    expect(onDispatch).not.toHaveBeenCalled();
    engine.dispose();
  });

  it('reports the option being auditioned and turns a thrown value into a line', async () => {
    const { engine } = createTestEngine();
    await engine.activate();
    act(() => {
      engine.store.dispatch({
        type: 'propose_options',
        args: {
          kind: 'feel',
          bar_from: 1,
          bar_to: 4,
          options: [
            { label: 'Laid back', why: 'It breathes.', style: 'lofi' },
            { label: 'Upright', why: 'It drives.', style: 'pop' },
          ],
        },
        source: 'agent',
        why: 'Two feels to compare.',
      });
    });
    const optionId = engine.store.getDocument().option_sets[0]?.options[0]?.id ?? '';
    render(
      <Transport
        engine={engine}
        song={engine.store.getDocument()}
        onDispatch={() => undefined}
        onError={() => undefined}
      />,
    );
    await act(async () => {
      await engine.audition(optionId);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Laid back');
    expect(transportMessage(new Error('no audio'))).toBe('no audio');
    expect(transportMessage('plain')).toBe('plain');
    engine.dispose();
  });
});
