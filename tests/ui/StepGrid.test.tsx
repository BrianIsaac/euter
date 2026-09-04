import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Track } from '../../src/song/types.ts';
import { StepGrid } from '../../src/ui/StepGrid.tsx';

const drums: Track = {
  id: 'drums',
  name: 'Drum machine',
  kind: 'drums',
  instrument: '808',
  volume_db: 0,
  pan: 0,
  mute: false,
  solo: false,
  notes_rev: 1,
  notes: [{ p: 36, s: 0, d: 0.25, v: 0.8, source: 'agent' }],
  clips_rev: 0,
  clips: [],
};

describe('StepGrid', () => {
  it('renders 16 steps per lane and removes an active drum hit', () => {
    const onDispatch = vi.fn();
    render(<StepGrid track={drums} onDispatch={onDispatch} />);
    const active = screen.getByLabelText('Kick, bar 1, step 1, velocity 80%');
    expect(active).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Closed hat, bar 1, step 16')).toBeInTheDocument();
    fireEvent.click(active);
    expect(onDispatch).toHaveBeenCalledOnce();
    const command = onDispatch.mock.calls[0]?.[0];
    expect(command).toMatchObject({ type: 'set_notes', source: 'human' });
    expect(command.args.notes).toEqual([]);
  });

  it('adds a human hit at the selected velocity', () => {
    const onDispatch = vi.fn();
    render(<StepGrid track={drums} onDispatch={onDispatch} />);
    fireEvent.change(screen.getByLabelText('Step velocity'), { target: { value: '0.55' } });
    fireEvent.click(screen.getByLabelText('Snare, bar 1, step 2'));
    const notes = onDispatch.mock.calls[0]?.[0].args.notes;
    expect(notes).toContainEqual({ p: 38, s: 0.25, d: 0.25, v: 0.55 });
  });

  it('refuses a non-drums track visibly', () => {
    render(<StepGrid track={{ ...drums, kind: 'melody' }} onDispatch={vi.fn()} />);
    expect(screen.getByText('Choose a drums track for the step grid.')).toBeInTheDocument();
  });
});
