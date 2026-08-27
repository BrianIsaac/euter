import { describe, expect, it } from 'vitest';
import { loadExampleSong, SONG_STORAGE_KEY } from '../../src/song/serialise.ts';
import { createRuntime, safeStorage } from '../../src/webmcp/runtime.ts';
import { createFakeContext } from '../helpers/fakeContext.ts';
import { createTestEngine } from '../helpers/harness.ts';

describe('runtime', () => {
  it('wires the engine, bus, queue, environment and registry', async () => {
    const context = createFakeContext();
    const { engine } = createTestEngine();
    const runtime = createRuntime({ engine, contexts: () => [context] });
    expect(runtime.bus).toBe(engine.store);
    expect(runtime.bus.getDocument().title).toBe('First Light');
    const status = await runtime.registry.register();
    expect(status).toEqual({ kind: 'ready', count: runtime.registry.tools.length });
    expect(runtime.environment.get().snapshot.userAgent).toBe(navigator.userAgent);
  });

  it('builds its own engine over storage when none is given', () => {
    const saved = { ...loadExampleSong(), title: 'Saved Song' };
    const storage = {
      getItem: () => JSON.stringify(saved),
      setItem: () => undefined,
    };
    const runtime = createRuntime({ storage, contexts: () => [] });
    expect(runtime.bus.getDocument().title).toBe('Saved Song');
    expect(runtime.engine.store).toBe(runtime.bus);
    runtime.engine.dispose();
  });

  it('starts from the example song when storage holds nothing usable', () => {
    const runtime = createRuntime({ storage: null, contexts: () => [] });
    expect(runtime.bus.getDocument().title).toBe('First Light');
    runtime.engine.dispose();
  });

  it('is unavailable without a context', async () => {
    const { engine } = createTestEngine();
    const runtime = createRuntime({ engine, contexts: () => [] });
    expect(await runtime.registry.register()).toEqual({ kind: 'unavailable' });
  });

  it('reads localStorage defensively', () => {
    expect(safeStorage(window)).toBe(window.localStorage);
    expect(
      safeStorage({
        get localStorage(): Storage {
          throw new Error('blocked');
        },
      } as unknown as Window),
    ).toBeNull();
    expect(SONG_STORAGE_KEY).toBe('euter.song.v1');
  });
});
