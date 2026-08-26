import { describe, expect, it } from 'vitest';
import { createCommandBus } from '../../../src/webmcp/bus.ts';
import { createEnvironmentStore, readEnvironment } from '../../../src/webmcp/environment.ts';
import { createProbeDocument, probeReducer } from '../../../src/webmcp/probe.ts';
import { ping } from '../../../src/webmcp/tools/ping.ts';

describe('ping', () => {
  it('is a write that bumps the revision and echoes the message', () => {
    const bus = createCommandBus(probeReducer, createProbeDocument());
    const envelope = ping.execute(
      { message: 'hello' },
      {
        bus,
        environment: createEnvironmentStore(readEnvironment()),
        registry: { statusText: () => 'ready (2)', toolCount: () => 2, callCount: () => 0 },
        signal: new AbortController().signal,
      },
    );
    expect(envelope).toEqual({
      ok: true,
      revision: 1,
      changed: ['revision'],
      summary: 'ping: hello',
      data: { message: 'hello' },
    });
    expect(ping.kind).toBe('write');
    expect(bus.getActivities()[0]).toMatchObject({ type: 'ping', source: 'agent' });
  });
});
