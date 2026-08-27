import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptySong, type SongDocument, type Track } from '../../src/song/types.ts';
import { noteColour, PianoRoll, pitchName } from '../../src/ui/PianoRoll.tsx';

const melody: Track = {
  id: 'melody',
  name: 'Lead melody',
  kind: 'melody',
  instrument: 'piano',
  volume_db: 0,
  pan: 0,
  mute: false,
  solo: false,
  notes_rev: 1,
  notes: [{ p: 60, s: 1, d: 1, v: 0.8, source: 'agent' }],
};

function song(): SongDocument {
  return {
    ...createEmptySong('Roll test'),
    bars: 8,
    sections: [{ name: 'Verse', bar_from: 1, bar_to: 4 }],
    chords: [{ bar: 1, symbol: 'C' }],
    tracks: [melody],
  };
}

function canvasContext(): CanvasRenderingContext2D {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext());
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1594,
    bottom: 654,
    width: 1594,
    height: 654,
    toJSON: () => ({}),
  });
});

describe('PianoRoll', () => {
  it('uses key-aware names and a distinct untouched-agent colour', () => {
    expect(pitchName(61, 'F major')).toBe('D♭4');
    expect(pitchName(61, 'C major')).toBe('C♯4');
    expect(noteColour('agent')).toBe('#b48cff');
    expect(noteColour('human')).not.toBe(noteColour('agent'));
  });

  it('selects and drags an agent note as one locked human command', () => {
    const onDispatch = vi.fn();
    const setGestureActive = vi.fn();
    render(
      <PianoRoll
        song={song()}
        trackId="melody"
        gesture={{ setGestureActive }}
        onDispatch={onDispatch}
      />,
    );
    const canvas = screen.getByRole('img');
    fireEvent.pointerDown(canvas, { clientX: 110, clientY: 356, pointerId: 1 });
    expect(screen.getByTestId('selected-note')).toHaveTextContent('C4');
    fireEvent.pointerUp(canvas, { clientX: 158, clientY: 344, pointerId: 1 });
    expect(setGestureActive).toHaveBeenNthCalledWith(1, true);
    expect(setGestureActive).toHaveBeenLastCalledWith(false);
    const command = onDispatch.mock.calls[0]?.[0];
    expect(command).toMatchObject({ type: 'set_notes', source: 'human' });
    expect(command.args.notes[0]).toEqual({ p: 61, s: 2, d: 1, v: 0.8 });
  });

  it('guards a drag with the revision where the gesture began', () => {
    const onDispatch = vi.fn();
    const initial = song();
    const view = render(
      <PianoRoll
        song={initial}
        trackId="melody"
        gesture={{ setGestureActive: vi.fn() }}
        onDispatch={onDispatch}
      />,
    );
    fireEvent.pointerDown(screen.getByRole('img'), {
      clientX: 110,
      clientY: 356,
      pointerId: 1,
    });
    view.rerender(
      <PianoRoll
        song={{ ...initial, revision: 1 }}
        trackId="melody"
        gesture={{ setGestureActive: vi.fn() }}
        onDispatch={onDispatch}
      />,
    );
    fireEvent.pointerUp(screen.getByRole('img'), {
      clientX: 158,
      clientY: 344,
      pointerId: 1,
    });

    expect(onDispatch).toHaveBeenCalledOnce();
    expect(onDispatch.mock.calls[0]?.[0]).toMatchObject({ expected_revision: 0 });
  });

  it('clicks empty space to add and Delete removes the selected note', () => {
    const onDispatch = vi.fn();
    const view = render(
      <PianoRoll
        song={song()}
        trackId="melody"
        gesture={{ setGestureActive: vi.fn() }}
        onDispatch={onDispatch}
      />,
    );
    const canvas = screen.getByRole('img');
    fireEvent.pointerDown(canvas, { clientX: 300, clientY: 310 });
    expect(onDispatch.mock.calls[0]?.[0].args).toMatchObject({ bar_from: 2 });
    expect(onDispatch.mock.calls[0]?.[0].args.notes).toHaveLength(1);
    view.rerender(
      <PianoRoll
        song={song()}
        trackId="melody"
        gesture={{ setGestureActive: vi.fn() }}
        onDispatch={onDispatch}
      />,
    );
    fireEvent.pointerDown(screen.getByRole('img'), { clientX: 110, clientY: 356 });
    fireEvent.keyDown(screen.getByRole('region', { name: 'Piano roll' }), { key: 'Delete' });
    expect(onDispatch.mock.calls.at(-1)?.[0].args.notes).toEqual([]);
  });

  it('scrolls and flashes the bars targeted by an agent result', () => {
    render(
      <PianoRoll
        song={song()}
        trackId="melody"
        targetBars={[3, 4]}
        gesture={{ setGestureActive: vi.fn() }}
        onDispatch={vi.fn()}
      />,
    );
    const scroll = screen.getByTestId('roll-scroll');
    expect(scroll).toHaveClass('target-flash');
    expect(scroll.scrollLeft).toBe(384);
  });

  it('recentres vertically when switching between empty, low and high tracks', () => {
    const baseNote = melody.notes[0];
    if (!baseNote) throw new Error('The roll fixture needs one note.');
    const low: Track = { ...melody, id: 'low', notes: [{ ...baseNote, p: 24 }] };
    const high: Track = { ...melody, id: 'high', notes: [{ ...baseNote, p: 96 }] };
    const empty: Track = { ...melody, id: 'empty', notes: [] };
    const switched = { ...song(), tracks: [low, high, empty] };
    const view = render(
      <PianoRoll
        song={switched}
        trackId="low"
        gesture={{ setGestureActive: vi.fn() }}
        onDispatch={vi.fn()}
      />,
    );
    const scroll = screen.getByTestId('roll-scroll');
    const lowTop = scroll.scrollTop;

    view.rerender(
      <PianoRoll
        song={switched}
        trackId="high"
        gesture={{ setGestureActive: vi.fn() }}
        onDispatch={vi.fn()}
      />,
    );
    expect(scroll.scrollTop).toBeLessThan(lowTop);

    view.rerender(
      <PianoRoll
        song={switched}
        trackId="empty"
        gesture={{ setGestureActive: vi.fn() }}
        onDispatch={vi.fn()}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Lead melody notes across 8 bars',
    );
    expect(scroll.scrollTop).toBeGreaterThan(0);
  });

  it('shows a missing-track error instead of drawing stale notes', () => {
    render(
      <PianoRoll
        song={song()}
        trackId="missing"
        gesture={{ setGestureActive: vi.fn() }}
        onDispatch={vi.fn()}
      />,
    );
    expect(screen.getByText('Track missing is not in the song.')).toBeInTheDocument();
  });
});
