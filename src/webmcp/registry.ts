/**
 * The WebMCP registration layer (plan Architecture item 9; Decisions 12, 16, 17, 23). Builds each
 * tool from its zod schema and description, wraps `execute` as parse -> enqueue -> execute ->
 * await one macrotask -> envelope, catches everything into `{ok:false}`, registers on
 * `document.modelContext` first and `navigator.modelContext` as fallback with one
 * `AbortController` per context, and exposes status and the last twenty calls to the UI.
 */
import type { SongDocument } from '../song/types.ts';
import type { CommandBus } from './bus.ts';
import type { Engine } from './engine.ts';
import { registeredDescription } from './descriptions.ts';
import { enforceOutputBudget, envelopeFromThrown, type Envelope } from './envelope.ts';
import type { EnvironmentStore } from './environment.ts';
import { createQueue, type CommandQueue } from './queue.ts';
import { parseInput, toInputSchema } from './schemas.ts';
import type { ModelContext, ModelContextTool, RegistryView, ToolDefinition } from './types.ts';

export type RegistryStatus =
  | { kind: 'initialising' }
  | { kind: 'ready'; count: number }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

export type CallStatus = 'running' | 'ok' | 'error';

export interface ToolCall {
  id: number;
  tool: string;
  args: unknown;
  status: CallStatus;
  code: string | null;
  summary: string | null;
  startedAt: number;
  durationMs: number | null;
}

export interface Registry {
  readonly tools: readonly ToolDefinition[];
  /** Registers on every context found; resolves to the resulting status. */
  register(): Promise<RegistryStatus>;
  /** Aborts every registration. */
  dispose(): void;
  getStatus(): RegistryStatus;
  /** The last calls, oldest first; the array reference changes only when the log does. */
  getCalls(): readonly ToolCall[];
  subscribe(listener: () => void): () => void;
  /** Runs a tool exactly as the browser would, for tests and the diagnostics panel. */
  invoke(name: string, input: unknown, signal?: AbortSignal): Promise<Envelope>;
  /** The tools as handed to `registerTool`. */
  describe(): ModelContextTool[];
}

export interface RegistryDeps {
  tools: readonly ToolDefinition[];
  bus: CommandBus<SongDocument>;
  engine: Engine;
  environment: EnvironmentStore;
  queue?: CommandQueue;
  /** Where to register; defaults to `discoverContexts()`. */
  contexts?: () => ModelContext[];
  now?: () => number;
  callLimit?: number;
  /** Waits one macrotask so React commits before the envelope returns; defaults to `setTimeout(0)`. */
  nextTick?: () => Promise<void>;
}

/**
 * Formats a status for the header and the diagnostics tool.
 *
 * @param status - The registry status.
 * @returns `initialising`, `ready (n)`, `unavailable` or `error: message`.
 */
export function formatStatus(status: RegistryStatus): string {
  switch (status.kind) {
    case 'initialising':
      return 'initialising';
    case 'ready':
      return `ready (${status.count})`;
    case 'unavailable':
      return 'unavailable';
    case 'error':
      return `error: ${status.message}`;
  }
}

/**
 * Finds the model context objects, `document.modelContext` first (landscape §2.2).
 *
 * @param doc - The document; defaults to the global.
 * @param nav - The navigator; defaults to the global.
 * @returns The distinct contexts in registration order.
 */
export function discoverContexts(
  doc: Document = document,
  nav: Navigator = navigator,
): ModelContext[] {
  const contexts: ModelContext[] = [];
  for (const candidate of [doc.modelContext, nav.modelContext]) {
    if (
      candidate &&
      typeof candidate.registerTool === 'function' &&
      !contexts.includes(candidate)
    ) {
      contexts.push(candidate);
    }
  }
  return contexts;
}

function isDuplicateRegistration(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'InvalidStateError'
  );
}

/**
 * Accepts the input as the browser hands it over: an object per the spec, or a JSON string as
 * Chrome's in-page `executeTool` documents (landscape §2.2). Anything unparseable is passed
 * through so validation reports it.
 *
 * @param inputObject - The raw input.
 * @returns The input as an object where possible.
 */
export function coerceInput(inputObject: unknown): unknown {
  if (typeof inputObject !== 'string') {
    return inputObject;
  }
  try {
    return JSON.parse(inputObject) as unknown;
  } catch {
    return inputObject;
  }
}

function defaultNextTick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Creates the registry.
 *
 * @param deps - Tools, bus, environment store and optional test seams.
 * @returns The registry, not yet registered.
 */
export function createRegistry(deps: RegistryDeps): Registry {
  const { tools, bus, engine, environment } = deps;
  const queue = deps.queue ?? createQueue();
  const now = deps.now ?? (() => Date.now());
  const callLimit = deps.callLimit ?? 20;
  const nextTick = deps.nextTick ?? defaultNextTick;
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const listeners = new Set<() => void>();
  let status: RegistryStatus = { kind: 'initialising' };
  let calls: readonly ToolCall[] = [];
  let controllers: AbortController[] = [];
  let nextCallId = 1;

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function setStatus(next: RegistryStatus): void {
    status = next;
    notify();
  }

  function recordCall(call: ToolCall): void {
    calls = [...calls.filter((entry) => entry.id !== call.id), call].slice(-callLimit);
    notify();
  }

  const view: RegistryView = {
    statusText: () => formatStatus(status),
    toolCount: () => tools.length,
    callCount: () => calls.length,
  };

  async function invoke(name: string, input: unknown, signal?: AbortSignal): Promise<Envelope> {
    const call: ToolCall = {
      id: nextCallId,
      tool: name,
      args: input,
      status: 'running',
      code: null,
      summary: null,
      startedAt: now(),
      durationMs: null,
    };
    nextCallId += 1;
    recordCall(call);
    let envelope: Envelope;
    try {
      const definition = byName.get(name);
      if (!definition) {
        throw new Error(`No tool named "${name}".`);
      }
      const args = parseInput(definition.input, input);
      const result = await queue.enqueue(
        () =>
          definition.execute(args, {
            bus,
            engine,
            environment,
            registry: view,
            signal: signal ?? new AbortController().signal,
          }),
        signal ? { signal } : {},
      );
      await nextTick();
      envelope = enforceOutputBudget(result);
    } catch (thrown) {
      envelope = envelopeFromThrown(thrown);
    }
    recordCall({
      ...call,
      status: envelope.ok ? 'ok' : 'error',
      code: envelope.ok ? null : envelope.code,
      summary: envelope.ok ? envelope.summary : envelope.message,
      durationMs: now() - call.startedAt,
    });
    return envelope;
  }

  function describe(): ModelContextTool[] {
    return tools.map((definition) => {
      const inputSchema = toInputSchema(definition.input);
      const hasWhy = 'why' in inputSchema.properties;
      return {
        name: definition.name,
        title: definition.title,
        description: registeredDescription(definition.description, definition.kind, hasWhy),
        inputSchema,
        annotations: {
          readOnlyHint: definition.kind === 'read',
          untrustedContentHint: definition.untrustedContent ?? false,
        },
        execute: (inputObject, options) =>
          invoke(definition.name, coerceInput(inputObject), options?.signal),
      };
    });
  }

  async function registerOn(context: ModelContext): Promise<'registered' | 'duplicate' | Error> {
    const controller = new AbortController();
    controllers.push(controller);
    const outcomes = await Promise.all(
      describe().map((tool) =>
        context.registerTool(tool, { signal: controller.signal }).then(
          () => null,
          (error: unknown) => error,
        ),
      ),
    );
    const failures = outcomes.filter((outcome) => outcome !== null);
    if (failures.length === 0) {
      return 'registered';
    }
    controller.abort();
    if (failures.every(isDuplicateRegistration)) {
      return 'duplicate';
    }
    const first = failures.find((failure) => !isDuplicateRegistration(failure));
    return first instanceof Error ? first : new Error(String(first));
  }

  return {
    tools,
    async register(): Promise<RegistryStatus> {
      setStatus({ kind: 'initialising' });
      const contexts = deps.contexts ? deps.contexts() : discoverContexts();
      if (contexts.length === 0) {
        setStatus({ kind: 'unavailable' });
        return status;
      }
      let registered = 0;
      let failure: Error | null = null;
      for (const context of contexts) {
        const outcome = await registerOn(context);
        if (outcome === 'registered') {
          registered += 1;
        } else if (outcome === 'duplicate' && registered > 0) {
          continue;
        } else if (outcome instanceof Error) {
          failure ??= outcome;
        } else {
          failure ??= new Error('A tool with the same name is already registered.');
        }
      }
      if (registered > 0) {
        setStatus({ kind: 'ready', count: tools.length });
      } else {
        setStatus({ kind: 'error', message: failure?.message ?? 'registration failed' });
      }
      return status;
    },
    dispose(): void {
      for (const controller of controllers) {
        controller.abort();
      }
      controllers = [];
      setStatus({ kind: 'unavailable' });
    },
    getStatus: () => status,
    getCalls: () => calls,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    invoke,
    describe,
  };
}
