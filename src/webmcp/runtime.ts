/**
 * Wires the bus, queue, environment store and registry into one object the UI is given. Tests
 * build their own with fake contexts (landscape §4.4, the Vercel smoke-test shape).
 */
import type { SongDocument } from '../song/types.ts';
import { createCommandBus, type CommandBus, type Reducer } from './bus.ts';
import { createEnvironmentStore, readEnvironment, type EnvironmentStore } from './environment.ts';
import { createProbeDocument, probeReducer } from './probe.ts';
import { createQueue, type CommandQueue } from './queue.ts';
import { createRegistry, type Registry, type RegistryDeps } from './registry.ts';
import { tools as allTools } from './tools/index.ts';
import type { ModelContext, ToolDefinition } from './types.ts';

export interface Runtime {
  bus: CommandBus<SongDocument>;
  queue: CommandQueue;
  environment: EnvironmentStore;
  registry: Registry;
}

export interface RuntimeOptions {
  reducer?: Reducer<SongDocument>;
  document?: SongDocument;
  tools?: readonly ToolDefinition[];
  contexts?: () => ModelContext[];
  window?: Window;
}

/**
 * Creates the runtime; call `registry.register()` afterwards.
 *
 * @param options - Overrides for tests; the defaults are the probe reducer and every tool.
 * @returns The runtime.
 */
export function createRuntime(options: RuntimeOptions = {}): Runtime {
  const bus = createCommandBus(
    options.reducer ?? probeReducer,
    options.document ?? createProbeDocument(),
  );
  const queue = createQueue();
  const environment = createEnvironmentStore(readEnvironment(options.window ?? window));
  const deps: RegistryDeps = { tools: options.tools ?? allTools, bus, environment, queue };
  if (options.contexts) {
    deps.contexts = options.contexts;
  }
  const registry = createRegistry(deps);
  return { bus, queue, environment, registry };
}
