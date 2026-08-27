/** Agent-to-person take request state (plan Decision 13, `request_take`). */
import type { BarRange } from './recorder.ts';

export interface TakeRequestInput {
  trackId: string;
  barFrom: number;
  barTo: number;
  prompt: string;
}

export interface SongTakeRequestPort {
  id: string;
  track_id: string;
  bar_from: number;
  bar_to: number;
  prompt: string;
}

export interface ArmedTakeRequest {
  id: string;
  trackId: string;
  targetBars: BarRange;
  prompt: string;
  armedAt: number;
}

export type ArmTakeResult =
  | { ok: true; data: ArmedTakeRequest }
  | { ok: false; code: 'INVALID_ARGUMENT'; message: string; recoverable: true };

export interface TakeRequestController {
  arm(input: TakeRequestInput): ArmTakeResult;
  clear(id?: string): void;
  getSnapshot(): ArmedTakeRequest | null;
  subscribe(listener: () => void): () => void;
}

export interface TakeRequestOptions {
  now?: () => number;
  makeId?: () => string;
}

/** Maps Lane A's persisted song request into the TakePanel/recorder view shape. */
export function armedTakeRequestFromSong(
  request: SongTakeRequestPort,
  armedAt = 0,
): ArmedTakeRequest {
  return {
    id: request.id,
    trackId: request.track_id,
    targetBars: { barFrom: request.bar_from, barTo: request.bar_to },
    prompt: request.prompt,
    armedAt,
  };
}

/** Arms a visible prompt; the person starts audio with the TakePanel's Record button. */
export function createTakeRequestController(
  options: TakeRequestOptions = {},
): TakeRequestController {
  const now = options.now ?? (() => Date.now());
  const makeId = options.makeId ?? (() => crypto.randomUUID());
  const listeners = new Set<() => void>();
  let current: ArmedTakeRequest | null = null;
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    arm(input) {
      const prompt = input.prompt.trim();
      if (
        input.trackId.trim() === '' ||
        !Number.isInteger(input.barFrom) ||
        !Number.isInteger(input.barTo) ||
        input.barFrom < 1 ||
        input.barTo < input.barFrom ||
        prompt.length < 1 ||
        prompt.length > 200
      ) {
        return {
          ok: false,
          code: 'INVALID_ARGUMENT',
          message:
            'request_take needs a track, an ordered positive bar range and a 1-200 character prompt.',
          recoverable: true,
        };
      }
      current = {
        id: makeId(),
        trackId: input.trackId,
        targetBars: { barFrom: input.barFrom, barTo: input.barTo },
        prompt,
        armedAt: now(),
      };
      notify();
      return { ok: true, data: current };
    },
    clear(id) {
      if (id !== undefined && current?.id !== id) return;
      current = null;
      notify();
    },
    getSnapshot() {
      return current;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
