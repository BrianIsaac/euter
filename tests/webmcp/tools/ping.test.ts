import { describe, expect, it } from 'vitest';
import { createEnvironmentStore, readEnvironment } from '../../../src/webmcp/environment.ts';
import { ping } from '../../../src/webmcp/tools/ping.ts';
import { createTestEngine } from '../../helpers/harness.ts';

describe('ping', () => {
  it('is a write that bumps the revision and echoes the message', () => {
    const { engine } = createTestEngine();
    const bus = engine.store;
    const envelope = ping.execute(
      { message: 'hello' },
      {
        bus,
        engine,
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
