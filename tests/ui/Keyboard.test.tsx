import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlayedNoteRecorder } from '../../src/input/musicalTyping.ts';
import type { TransportPort } from '../../src/input/transportPort.ts';
import { Keyboard } from '../../src/ui/Keyboard.tsx';

function recorder(): PlayedNoteRecorder {
  const transport: TransportPort = {
    getAudioContext: () => null,
    getBpm: () => 120,
    getTimeSignature: () => [4, 4],
    getPositionSeconds: () => 0,
    countIn: async () => ({ durationSeconds: 0 }),
  };
  return new PlayedNoteRecorder(transport);
}

describe('Keyboard', () => {
  it('shows the Musical Typing map, octave and velocity controls', () => {
    const input = recorder();
    render(<Keyboard recorder={input} />);
    expect(screen.getByText('Octave 4')).toBeInTheDocument();
    expect(screen.getByText('Velocity 80%')).toBeInTheDocument();
    expect(screen.getByLabelText('A C4')).toBeInTheDocument();
    expect(screen.getByLabelText('W C♯4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Increase octave' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase velocity' }));
    expect(screen.getByText('Octave 5')).toBeInTheDocument();
    expect(screen.getByText('Velocity 90%')).toBeInTheDocument();
  });

  it('plays computer and on-screen keys and reflects active notes', () => {
    const input = recorder();
    render(<Keyboard recorder={input} />);
    const a = screen.getByLabelText('A C4');
    fireEvent.keyDown(window, { key: 'a' });
    expect(a).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyUp(window, { key: 'a' });
    expect(a).toHaveAttribute('aria-pressed', 'false');
    fireEvent.pointerDown(a);
    expect(a).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerUp(a);
    expect(a).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not steal typing from form controls', () => {
    const input = recorder();
    render(
      <>
        <input aria-label="Song title" />
        <Keyboard recorder={input} />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('Song title'), { key: 'a' });
    expect(input.getSnapshot().activePitches).toEqual([]);
  });
});
