import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActivityStrip } from '../../src/ui/ActivityStrip.tsx';
import { createTestEngine } from '../helpers/harness.ts';

describe('ActivityStrip', () => {
  it('shows the empty state and then every command from the bus, newest first', () => {
    const { engine } = createTestEngine();
    render(<ActivityStrip bus={engine.store} />);
    expect(screen.getByText(/Nothing yet/u)).toBeInTheDocument();
    act(() => {
      engine.store.dispatch({
        type: 'set_tempo',
        args: { bpm: 96 },
        source: 'agent',
        why: 'A touch faster suits the hum.',
      });
      engine.store.dispatch({
        type: 'set_mix',
        args: { track_id: 'bass', volume_db: -10 },
        source: 'human',
        why: 'Bass was loud.',
      });
    });
    const items = screen.getAllByTestId('activity');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('r2');
    expect(items[0]).toHaveTextContent('Updated the mix for Bass');
    expect(items[1]).toHaveTextContent('agent');
    expect(items[1]).toHaveTextContent('A touch faster suits the hum.');
    expect(screen.getByText('2 command(s)')).toBeInTheDocument();
    engine.dispose();
  });

  it('offers a per-item undo carrying the revision the entry produced', () => {
    const { engine } = createTestEngine();
    const onUndoItem = vi.fn();
    render(<ActivityStrip bus={engine.store} onUndoItem={onUndoItem} />);
    act(() => {
      engine.store.dispatch({
        type: 'set_tempo',
        args: { bpm: 101 },
        source: 'agent',
        why: 'Lifting it.',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: /Undo Set tempo/u }));
    expect(onUndoItem).toHaveBeenCalledWith(1);
    engine.dispose();
  });
});
