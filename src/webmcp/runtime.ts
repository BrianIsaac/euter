/**
 * Wires the engine, bus, queue, environment store and registry into one object the UI is given.
 * Tests build their own with fake contexts (landscape §4.4, the Vercel smoke-test shape).
 */
import type { SongDocument } from '../song/types.ts';
import { loadExampleSong } from '../song/serialise.ts';
import type { CommandBus } from './bus.ts';
import { createEngine, type Engine, type EngineOptions } from './engine.ts';
import { createEnvironmentStore, readEnvironment, type EnvironmentStore } from './environment.ts';
import { createQueue, type CommandQueue } from './queue.ts';
import { createRegistry, type Registry, type RegistryDeps } from './registry.ts';
import { tools as allTools } from './tools/index.ts';
import type { ModelContext, ToolDefinition } from './types.ts';

export interface Runtime {
  engine: Engine;
  bus: CommandBus<SongDocument>;
  queue: CommandQueue;
  environment: EnvironmentStore;
  registry: Registry;
}

export interface RuntimeOptions {
  engine?: Engine | undefined;
  document?: SongDocument | undefined;
  /** `null` turns persistence off; the default is the window's `localStorage`. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null | undefined;
  engineOptions?: EngineOptions | undefined;
  tools?: readonly ToolDefinition[] | undefined;
  contexts?: (() => ModelContext[]) | undefined;
  window?: Window | undefined;
}

export const EXAMPLE_QUERY_PARAM = 'example';

/** Returns whether the current URL explicitly asks to start from First Light. */
export function startsWithExample(search: string): boolean {
  return new URLSearchParams(search).get(EXAMPLE_QUERY_PARAM) === '1';
}

/**
 * Reads `localStorage` without throwing where a browser refuses it.
 *
 * @param win - The window to read.
 * @returns The storage, or null when it is unavailable.
 */
export function safeStorage(win: Window): Storage | null {
  try {
    return win.localStorage;
  } catch {
    return null;
  }
}

/**
 * Creates the runtime; call `registry.register()` afterwards.
 *
 * @param options - Overrides for tests; the defaults are the real engine and every tool.
 * @returns The runtime.
 */
export function createRuntime(options: RuntimeOptions = {}): Runtime {
  const win = options.window ?? window;
  const environment = createEnvironmentStore(readEnvironment(win));
  const queryDocument =
    options.document === undefined &&
    options.engineOptions?.document === undefined &&
    startsWithExample(win.location.search)
      ? loadExampleSong()
      : undefined;
  const engine =
    options.engine ??
    createEngine({
      environment,
      storage: options.storage === undefined ? safeStorage(win) : options.storage,
      ...((options.document ?? queryDocument)
        ? { document: options.document ?? queryDocument }
        : {}),
      ...options.engineOptions,
    });
  const queue = createQueue();
  const deps: RegistryDeps = {
    tools: options.tools ?? allTools,
    bus: engine.store,
    engine,
    environment,
    queue,
  };
  if (options.contexts) {
    deps.contexts = options.contexts;
  }
  const registry = createRegistry(deps);
  return { engine, bus: engine.store, queue, environment, registry };
}
