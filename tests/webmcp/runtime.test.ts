import { describe, expect, it } from 'vitest';
import { createRuntime } from '../../src/webmcp/runtime.ts';
import { createFakeContext } from '../helpers/fakeContext.ts';

describe('runtime', () => {
  it('wires the bus, queue, environment and registry with the probe tools', async () => {
    const context = createFakeContext();
    const runtime = createRuntime({ contexts: () => [context] });
    expect(runtime.bus.getDocument().title).toBe('Probe');
    expect(runtime.registry.tools.map((tool) => tool.name)).toEqual(['get_diagnostics', 'ping']);
    expect(await runtime.registry.register()).toEqual({ kind: 'ready', count: 2 });
    const envelope = await runtime.registry.invoke('ping', { message: 'x' });
    expect(envelope).toMatchObject({ ok: true, revision: 1 });
    expect(runtime.environment.get().snapshot.userAgent).toBe(navigator.userAgent);
  });

  it('is unavailable without a context', async () => {
    const runtime = createRuntime();
    expect(await runtime.registry.register()).toEqual({ kind: 'unavailable' });
  });
});
