import { describe, expect, it } from 'vitest';
import { createCommandBus } from '../../src/webmcp/bus.ts';
import { ToolError } from '../../src/webmcp/envelope.ts';
import { createProbeDocument, probeReducer } from '../../src/webmcp/probe.ts';

describe('probe reducer', () => {
  it('creates the probe document', () => {
    expect(createProbeDocument().title).toBe('Probe');
    expect(createProbeDocument().revision).toBe(0);
  });

  it('bumps the revision on ping and echoes the message', () => {
    const bus = createCommandBus(probeReducer, createProbeDocument());
    const result = bus.dispatch({ type: 'ping', args: { message: 'hello' }, source: 'agent' });
    expect(result).toEqual({ revision: 1, changed: ['revision'], summary: 'ping: hello' });
    expect(bus.getDocument().revision).toBe(1);
  });

  it('refuses any other command', () => {
    expect(() =>
      probeReducer(createProbeDocument(), { type: 'set_tempo', args: {}, source: 'agent' }),
    ).toThrow(ToolError);
  });
});
