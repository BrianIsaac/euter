import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fail, ok, ToolError } from '../../src/webmcp/envelope.ts';
import { createEnvironmentStore, readEnvironment } from '../../src/webmcp/environment.ts';
import { createQueue } from '../../src/webmcp/queue.ts';
import {
  coerceInput,
  createRegistry,
  discoverContexts,
  formatStatus,
  type RegistryDeps,
} from '../../src/webmcp/registry.ts';
import { tools } from '../../src/webmcp/tools/index.ts';
import type { ToolDefinition } from '../../src/webmcp/types.ts';
import { createFakeContext, installContexts } from '../helpers/fakeContext.ts';
import { createTestEngine } from '../helpers/harness.ts';

function deps(overrides: Partial<RegistryDeps> = {}): RegistryDeps {
  const { engine } = createTestEngine();
  return {
    tools,
    bus: engine.store,
    engine,
    environment: createEnvironmentStore(readEnvironment()),
    queue: createQueue(),
    nextTick: () => Promise.resolve(),
    ...overrides,
  };
}

const echoInput = z.strictObject({ text: z.string() });

function customTool(execute: ToolDefinition<typeof echoInput>['execute']): ToolDefinition {
  return {
    name: 'echo_text',
    title: 'Echo',
    kind: 'write',
    description: 'Echo text.',
    input: echoInput,
    example: { text: 'a' },
    badExample: { text: 1 },
    execute,
  } as ToolDefinition;
}

describe('registry', () => {
  afterEach(() => {
    installContexts(undefined, undefined);
  });

  it('formats every status', () => {
    expect(formatStatus({ kind: 'initialising' })).toBe('initialising');
    expect(formatStatus({ kind: 'ready', count: 2 })).toBe('ready (2)');
    expect(formatStatus({ kind: 'unavailable' })).toBe('unavailable');
    expect(formatStatus({ kind: 'error', message: 'x' })).toBe('error: x');
  });

  it('discovers document.modelContext first and deduplicates the navigator alias', () => {
    const shared = createFakeContext();
    installContexts(shared, shared);
    expect(discoverContexts()).toEqual([shared]);
    const other = createFakeContext();
    installContexts(shared, other);
    expect(discoverContexts()).toEqual([shared, other]);
    installContexts(undefined, other);
    expect(discoverContexts()).toEqual([other]);
    installContexts(undefined, undefined);
    expect(discoverContexts()).toEqual([]);
  });

  it('registers both tools on both contexts with readOnlyHint on the read', async () => {
    const documentContext = createFakeContext();
    const navigatorContext = createFakeContext();
    const registry = createRegistry(deps({ contexts: () => [documentContext, navigatorContext] }));
    expect(registry.getStatus()).toEqual({ kind: 'initialising' });
    expect(await registry.register()).toEqual({ kind: 'ready', count: tools.length });
    for (const context of [documentContext, navigatorContext]) {
      const listed = await context.getTools();
      expect(listed).toHaveLength(tools.length);
      expect(listed.map((tool) => tool.name)).toContain('get_song_state');
      const read = listed.find((tool) => tool.name === 'get_song_state');
      const write = listed.find((tool) => tool.name === 'set_chords');
      expect(read?.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
      expect(write?.annotations).toEqual({ readOnlyHint: false, untrustedContentHint: false });
      expect(write?.inputSchema).toMatchObject({ additionalProperties: false });
    }
  });

  it('is unavailable when no context exists', async () => {
    const registry = createRegistry(deps());
    expect(await registry.register()).toEqual({ kind: 'unavailable' });
  });

  it('uses the discovered global contexts by default', async () => {
    const shared = createFakeContext();
    installContexts(shared, shared);
    const registry = createRegistry(deps());
    expect(await registry.register()).toEqual({ kind: 'ready', count: tools.length });
    expect(shared.registerCalls).toBe(tools.length);
  });

  it('stays ready when the second context is an alias over the same tool map', async () => {
    const documentContext = createFakeContext();
    const alias = createFakeContext({ preRegistered: tools.map(({ name }) => name) });
    const registry = createRegistry(deps({ contexts: () => [documentContext, alias] }));
    expect(await registry.register()).toEqual({ kind: 'ready', count: tools.length });
  });

  it('reports an error when registration is refused everywhere', async () => {
    const broken = createFakeContext({ rejectWith: new Error('tools policy denied') });
    const registry = createRegistry(deps({ contexts: () => [broken] }));
    expect(await registry.register()).toEqual({ kind: 'error', message: 'tools policy denied' });
    const duplicate = createFakeContext({ preRegistered: ['set_tempo'] });
    const second = createRegistry(deps({ contexts: () => [duplicate] }));
    expect((await second.register()).kind).toBe('error');
  });

  it('aborts both contexts on dispose and registers again without duplicates', async () => {
    const documentContext = createFakeContext();
    const navigatorContext = createFakeContext();
    const registry = createRegistry(deps({ contexts: () => [documentContext, navigatorContext] }));
    await registry.register();
    registry.dispose();
    expect(registry.getStatus()).toEqual({ kind: 'unavailable' });
    expect(await documentContext.getTools()).toEqual([]);
    expect(await navigatorContext.getTools()).toEqual([]);
    expect(await registry.register()).toEqual({ kind: 'ready', count: tools.length });
    expect((await documentContext.getTools()).map((tool) => tool.name)).toContain('set_tempo');
    expect(await documentContext.getTools()).toHaveLength(tools.length);
  });

  it('runs a tool through the browser path and returns the envelope as JSON', async () => {
    const context = createFakeContext();
    const bus = createTestEngine().engine.store;
    const registry = createRegistry(deps({ bus, contexts: () => [context] }));
    await registry.register();
    const tempoTool = (await context.getTools()).find((tool) => tool.name === 'set_tempo');
    if (!tempoTool || !context.executeTool) {
      throw new Error('set_tempo was not registered');
    }
    const raw = await context.executeTool(tempoTool, { bpm: 96, why: 'A touch faster.' });
    expect(JSON.parse(raw)).toEqual({
      ok: true,
      revision: 1,
      changed: ['bpm', 'notes_log'],
      summary: 'Set tempo to 96 bpm',
      data: { bpm: 96 },
    });
    expect(bus.getDocument().revision).toBe(1);
    expect(bus.getActivities()).toHaveLength(1);
  });

  it('survives execute being called without options and with a JSON-string input', async () => {
    const bus = createTestEngine().engine.store;
    const registry = createRegistry(deps({ bus }));
    const tempoTool = registry.describe().find((tool) => tool.name === 'set_tempo');
    if (!tempoTool) {
      throw new Error('set_tempo not described');
    }
    const noOptions = (await tempoTool.execute({ bpm: 96, why: 'Bare call.' })) as {
      ok: boolean;
      revision: number;
    };
    expect(noOptions).toMatchObject({ ok: true, revision: 1 });
    const asString = (await tempoTool.execute(
      JSON.stringify({ bpm: 101, why: 'As a JSON string.' }) as unknown as Record<string, unknown>,
    )) as {
      ok: boolean;
      summary: string;
    };
    expect(asString).toMatchObject({ ok: true, summary: 'Set tempo to 101 bpm' });
    const garbage = (await tempoTool.execute('not json' as unknown as Record<string, unknown>)) as {
      ok: boolean;
      code: string;
    };
    expect(garbage).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    expect(coerceInput({ a: 1 })).toEqual({ a: 1 });
    expect(coerceInput(undefined)).toBeUndefined();
  });

  it('parses before enqueueing and returns INVALID_ARGUMENT as data', async () => {
    const bus = createTestEngine().engine.store;
    const registry = createRegistry(deps({ bus }));
    const envelope = await registry.invoke('set_tempo', { bpm: 'fast', why: 'Not a number.' });
    expect(envelope).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT', recoverable: true });
    expect(bus.getDocument().revision).toBe(0);
  });

  it('catches everything a tool throws into ok:false', async () => {
    const throwing = customTool(() => {
      throw new Error('kaboom');
    });
    const refusing = customTool(() => {
      throw new ToolError('AUDIO_LOCKED', 'Press play once.', true);
    });
    const registry = createRegistry(deps({ tools: [throwing] }));
    expect(await registry.invoke('echo_text', { text: 'a' })).toEqual({
      ok: false,
      code: 'INTERNAL',
      message: 'kaboom',
      recoverable: false,
    });
    const second = createRegistry(deps({ tools: [refusing] }));
    expect(await second.invoke('echo_text', { text: 'a' })).toEqual({
      ok: false,
      code: 'AUDIO_LOCKED',
      message: 'Press play once.',
      recoverable: true,
    });
    expect(await registry.invoke('no_such_tool', {})).toMatchObject({
      ok: false,
      code: 'INTERNAL',
    });
  });

  it('forwards options.signal to the queue and reports CANCELLED', async () => {
    const ran = vi.fn(() => ok(0, [], 'ran', null));
    const registry = createRegistry(deps({ tools: [customTool(ran)] }));
    const controller = new AbortController();
    controller.abort();
    expect(await registry.invoke('echo_text', { text: 'a' }, controller.signal)).toMatchObject({
      ok: false,
      code: 'CANCELLED',
    });
    expect(ran).not.toHaveBeenCalled();
  });

  it('hands the execute context the signal, bus, environment and registry view', async () => {
    const seen = vi.fn((args: { text: string }, context) => {
      expect(context.signal).toBeInstanceOf(AbortSignal);
      expect(context.registry.toolCount()).toBe(1);
      expect(context.registry.statusText()).toBe('initialising');
      expect(context.bus.getDocument().revision).toBe(0);
      expect(context.environment.get().snapshot.userAgent).toBe(navigator.userAgent);
      return ok(0, [], args.text, null);
    });
    const registry = createRegistry(deps({ tools: [customTool(seen)] }));
    await registry.invoke('echo_text', { text: 'seen' });
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('refuses an output over the budget', async () => {
    const big = customTool(() => ok(0, [], 'big', { text: 'x'.repeat(2000) }));
    const registry = createRegistry(deps({ tools: [big] }));
    expect(await registry.invoke('echo_text', { text: 'a' })).toMatchObject({
      ok: false,
      code: 'RESULT_TOO_LARGE',
    });
  });

  it('passes a tool that returns an error envelope through unchanged', async () => {
    const tool = customTool(() => fail('MIC_DENIED', 'No microphone.', false));
    const registry = createRegistry(deps({ tools: [tool] }));
    expect(await registry.invoke('echo_text', { text: 'a' })).toEqual({
      ok: false,
      code: 'MIC_DENIED',
      message: 'No microphone.',
      recoverable: false,
    });
  });

  it('logs the last twenty calls with arguments, status and duration', async () => {
    let time = 0;
    const registry = createRegistry(deps({ now: () => (time += 5), callLimit: 20 }));
    const listener = vi.fn();
    registry.subscribe(listener);
    for (let index = 0; index < 21; index += 1) {
      await registry.invoke('set_tempo', { bpm: 100 + index, why: `m${index}` });
    }
    await registry.invoke('set_tempo', { bpm: 900, why: 'Too fast.' });
    const calls = registry.getCalls();
    expect(calls).toHaveLength(20);
    expect(calls[0]?.args).toEqual({ bpm: 102, why: 'm2' });
    expect(calls.at(-1)).toMatchObject({
      tool: 'set_tempo',
      status: 'error',
      code: 'INVALID_ARGUMENT',
      args: { bpm: 900, why: 'Too fast.' },
    });
    expect(calls.at(-2)).toMatchObject({
      status: 'ok',
      code: null,
      summary: 'Set tempo to 120 bpm',
      durationMs: 5,
    });
    expect(listener).toHaveBeenCalled();
    expect(registry.getCalls()).toBe(calls);
  });

  it('serialises concurrent calls through the queue', async () => {
    const bus = createTestEngine().engine.store;
    const registry = createRegistry(deps({ bus }));
    const results = await Promise.all([
      registry.invoke('set_tempo', { bpm: 96, why: 'First.' }),
      registry.invoke('set_tempo', { bpm: 101, why: 'Second.' }),
      registry.invoke('get_song_state', {}),
    ]);
    expect(results.map((envelope) => (envelope.ok ? envelope.revision : -1))).toEqual([1, 2, 2]);
  });

  it('describes tools with the registered description and title', () => {
    const registry = createRegistry(deps());
    const described = registry.describe();
    expect(described.map((tool) => tool.name)).toEqual(tools.map(({ name }) => name));
    const read = described.find((tool) => tool.name === 'get_song_state');
    const write = described.find((tool) => tool.name === 'set_chords');
    const probe = described.find((tool) => tool.name === 'play');
    expect(read?.title).toBe('Read the song');
    expect(read?.description).not.toContain('Include why.');
    expect(write?.description).toMatch(/Include why\. Returns revision, changed and summary/u);
    expect(write?.description).toMatch(/on error returns ok:false with a code\.$/u);
    expect(probe?.description).toMatch(/on error returns ok:false with a code\.$/u);
    expect(probe?.description).not.toContain('Include why.');
  });
});
