import { describe, expect, it } from 'vitest';
import { createCommandBus } from '../../../src/webmcp/bus.ts';
import { createEnvironmentStore, readEnvironment } from '../../../src/webmcp/environment.ts';
import { createProbeDocument, probeReducer } from '../../../src/webmcp/probe.ts';
import {
  buildDiagnostics,
  DIAGNOSTICS_PAYLOAD_LENGTH,
  getDiagnostics,
  TAIL_MARKER,
} from '../../../src/webmcp/tools/get_diagnostics.ts';

const view = { statusText: () => 'ready (2)', toolCount: () => 2, callCount: () => 4 };

describe('get_diagnostics', () => {
  it('serialises to exactly 1,400 characters with tail_marker last', () => {
    const store = createEnvironmentStore(readEnvironment());
    store.update({
      headers: {
        status: 200,
        permissionsPolicy: 'tools=(self)',
        originAgentCluster: '?1',
        error: null,
      },
      permissions: { microphone: 'granted', midi: 'prompt' },
      audio: {
        before: { state: 'suspended', sampleRate: 48000, baseLatency: 0.01, outputLatency: null },
        after: { state: 'running', sampleRate: 48000, baseLatency: 0.01, outputLatency: 0.02 },
      },
    });
    const envelope = buildDiagnostics(store.get(), view, 3, '0.1.0');
    const text = JSON.stringify(envelope);
    expect(text.length).toBe(DIAGNOSTICS_PAYLOAD_LENGTH);
    expect(DIAGNOSTICS_PAYLOAD_LENGTH).toBe(1400);
    expect(Object.keys(envelope.data).at(-1)).toBe('tail_marker');
    expect(text.endsWith(`"tail_marker":"${TAIL_MARKER}"}}`)).toBe(true);
    expect(envelope.data).toMatchObject({
      app: { name: 'Euterpe', version: '0.1.0' },
      tools: { status: 'ready (2)', count: 2, calls_logged: 4 },
      audio: {
        before: 'suspended @ 48000 Hz, base latency 0.0100s',
        after: 'running @ 48000 Hz, base latency 0.0100s',
      },
      permissions: { microphone: 'granted', midi: 'prompt' },
      headers: { permissions_policy: 'tools=(self)', origin_agent_cluster: '?1' },
      revision: 3,
    });
    expect(envelope.changed).toEqual([]);
  });

  it('pads less when the facts are longer and never below zero', () => {
    const store = createEnvironmentStore({
      ...readEnvironment(),
      userAgent: 'U'.repeat(300),
      brands: [{ brand: 'Chromium', version: '151' }],
    });
    const envelope = buildDiagnostics(store.get(), view, 0, '0.1.0');
    expect(JSON.stringify(envelope).length).toBe(DIAGNOSTICS_PAYLOAD_LENGTH);
    expect(envelope.data.brands).toBe('Chromium/151');
    const tiny = buildDiagnostics(store.get(), view, 0, '0.1.0', 10);
    expect(tiny.data.padding).toBe('');
  });

  it('reads from the context as a read tool with untrusted content', async () => {
    const bus = createCommandBus(probeReducer, createProbeDocument());
    const envelope = await getDiagnostics.execute(
      {},
      {
        bus,
        environment: createEnvironmentStore(readEnvironment()),
        registry: view,
        signal: new AbortController().signal,
      },
    );
    expect(envelope.ok).toBe(true);
    expect(getDiagnostics.kind).toBe('read');
    expect(getDiagnostics.untrustedContent).toBe(true);
    if (envelope.ok) {
      expect(JSON.stringify(envelope).length).toBe(1400);
      expect((envelope.data as { audio: { before: null } }).audio.before).toBeNull();
    }
  });
});
