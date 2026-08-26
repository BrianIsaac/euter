/**
 * A fake `ModelContext` with the spec's registration semantics (landscape §1.2, §1.5): duplicate
 * names reject with `InvalidStateError`, aborting the registration signal unregisters, and
 * `executeTool` returns the JSON string the browser would hand the agent.
 */
import type {
  ModelContext,
  ModelContextRegisterToolOptions,
  ModelContextTool,
  RegisteredTool,
} from '../../src/webmcp/types.ts';

export interface FakeContext extends ModelContext {
  readonly registered: Map<string, ModelContextTool>;
  readonly registerCalls: number;
}

export interface FakeContextOptions {
  /** Makes every registration reject with this error. */
  rejectWith?: Error;
  /** Names that already exist, so registering them rejects with InvalidStateError. */
  preRegistered?: string[];
}

/**
 * Creates the fake.
 *
 * @param options - Failure modes.
 * @returns The context.
 */
export function createFakeContext(options: FakeContextOptions = {}): FakeContext {
  const registered = new Map<string, ModelContextTool>();
  for (const name of options.preRegistered ?? []) {
    registered.set(name, { name, description: 'pre-registered', execute: () => null });
  }
  let registerCalls = 0;
  const target = new EventTarget();
  const context: FakeContext = {
    get registered() {
      return registered;
    },
    get registerCalls() {
      return registerCalls;
    },
    ontoolchange: null,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    registerTool(tool: ModelContextTool, registerOptions: ModelContextRegisterToolOptions = {}) {
      registerCalls += 1;
      if (options.rejectWith) {
        return Promise.reject(options.rejectWith);
      }
      if (registered.has(tool.name)) {
        return Promise.reject(
          new DOMException(
            `A tool named "${tool.name}" is already registered.`,
            'InvalidStateError',
          ),
        );
      }
      if (registerOptions.signal?.aborted) {
        return Promise.reject(
          registerOptions.signal.reason ?? new DOMException('aborted', 'AbortError'),
        );
      }
      registered.set(tool.name, tool);
      registerOptions.signal?.addEventListener('abort', () => {
        registered.delete(tool.name);
        target.dispatchEvent(new Event('toolchange'));
      });
      target.dispatchEvent(new Event('toolchange'));
      return Promise.resolve();
    },
    getTools() {
      const tools: RegisteredTool[] = [...registered.values()]
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .map((tool) => {
          const entry: RegisteredTool = {
            name: tool.name,
            description: tool.description,
            window,
            origin: 'https://euter.test',
          };
          if (tool.title !== undefined) {
            entry.title = tool.title;
          }
          if (tool.inputSchema !== undefined) {
            entry.inputSchema = JSON.parse(JSON.stringify(tool.inputSchema)) as object;
          }
          if (tool.annotations !== undefined) {
            entry.annotations = tool.annotations;
          }
          return entry;
        });
      return Promise.resolve(tools);
    },
    async executeTool(tool, inputObject = {}, executeOptions = {}) {
      const registeredTool = registered.get(tool.name);
      if (!registeredTool) {
        throw new DOMException('No such tool.', 'UnknownError');
      }
      const signal = executeOptions.signal ?? new AbortController().signal;
      const result = await registeredTool.execute(inputObject as Record<string, unknown>, {
        signal,
      });
      return JSON.stringify(result);
    },
  };
  return context;
}

/**
 * Installs contexts on `document` and `navigator` for the duration of a test.
 *
 * @param documentContext - The value for `document.modelContext`, or undefined to leave it absent.
 * @param navigatorContext - The value for `navigator.modelContext`, or undefined.
 * @returns A restore function.
 */
export function installContexts(
  documentContext: ModelContext | undefined,
  navigatorContext: ModelContext | undefined,
): () => void {
  const define = (target: object, value: ModelContext | undefined): void => {
    if (value === undefined) {
      Reflect.deleteProperty(target, 'modelContext');
    } else {
      Object.defineProperty(target, 'modelContext', { value, configurable: true, writable: true });
    }
  };
  define(document, documentContext);
  define(navigator, navigatorContext);
  return () => {
    Reflect.deleteProperty(document, 'modelContext');
    Reflect.deleteProperty(navigator, 'modelContext');
  };
}
