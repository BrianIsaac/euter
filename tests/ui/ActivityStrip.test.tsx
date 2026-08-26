import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActivityStrip } from '../../src/ui/ActivityStrip.tsx';
import { createCommandBus } from '../../src/webmcp/bus.ts';
import { createProbeDocument, probeReducer } from '../../src/webmcp/probe.ts';

describe('ActivityStrip', () => {
  it('shows the empty state and then every command from the bus, newest first', () => {
    const bus = createCommandBus(probeReducer, createProbeDocument());
    render(<ActivityStrip bus={bus} />);
    expect(screen.getByText(/No commands yet/)).toBeInTheDocument();
    act(() => {
      bus.dispatch({ type: 'ping', args: { message: 'one' }, source: 'agent', why: 'checking' });
      bus.dispatch({ type: 'ping', args: { message: 'two' }, source: 'human' });
    });
    const items = screen.getAllByTestId('activity');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('r2');
    expect(items[0]).toHaveTextContent('ping: two');
    expect(items[1]).toHaveTextContent('agent');
    expect(items[1]).toHaveTextContent('checking');
    expect(screen.getByText('2 command(s)')).toBeInTheDocument();
  });
});
