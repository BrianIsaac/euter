/**
 * One FIFO promise chain for every tool execution (plan Decision 14; Webroom's chain, landscape
 * §4.5). Nothing in the spec serialises executions (landscape §1.4), so the app does. A human
 * gesture (a drag on the piano roll) holds agent commands for up to one second.
 */

export interface EnqueueOptions {
  signal?: AbortSignal;
}

export interface CommandQueue {
  /** Runs `task` after every task enqueued before it; rejects with the abort reason if cancelled first. */
  enqueue<T>(task: () => Promise<T> | T, options?: EnqueueOptions): Promise<T>;
  /** Marks a human gesture in progress; agent tasks wait for it to end, for at most `gestureHoldMs`. */
  setGestureActive(active: boolean): void;
  readonly gestureActive: boolean;
  /** Tasks enqueued and not yet finished. */
  readonly pending: number;
}

export interface QueueOptions {
  gestureHoldMs?: number;
}

/**
 * Creates the queue.
 *
 * @param options - `gestureHoldMs` defaults to 1,000.
 * @returns The queue.
 */
export function createQueue(options: QueueOptions = {}): CommandQueue {
  const gestureHoldMs = options.gestureHoldMs ?? 1000;
  let chain: Promise<unknown> = Promise.resolve();
  let gestureActive = false;
  let pending = 0;
  const gestureWaiters = new Set<() => void>();

  function abortReason(signal: AbortSignal): unknown {
    return signal.reason ?? new DOMException('The call was aborted.', 'AbortError');
  }

  function holdForGesture(signal: AbortSignal | undefined): Promise<void> {
    if (!gestureActive) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        gestureWaiters.delete(done);
        signal?.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, gestureHoldMs);
      gestureWaiters.add(done);
      signal?.addEventListener('abort', done);
    });
  }

  return {
    enqueue<T>(task: () => Promise<T> | T, enqueueOptions: EnqueueOptions = {}): Promise<T> {
      const { signal } = enqueueOptions;
      pending += 1;
      const run = chain.then(async () => {
        if (signal?.aborted) {
          throw abortReason(signal);
        }
        await holdForGesture(signal);
        if (signal?.aborted) {
          throw abortReason(signal);
        }
        return task();
      });
      chain = run.then(
        () => {
          pending -= 1;
        },
        () => {
          pending -= 1;
        },
      );
      return run;
    },
    setGestureActive(active: boolean): void {
      gestureActive = active;
      if (!active) {
        for (const waiter of [...gestureWaiters]) {
          waiter();
        }
      }
    },
    get gestureActive(): boolean {
      return gestureActive;
    },
    get pending(): number {
      return pending;
    },
  };
}
