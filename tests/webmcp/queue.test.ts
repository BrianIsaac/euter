import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueue } from '../../src/webmcp/queue.ts';

describe('queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs tasks one after another in order', async () => {
    const queue = createQueue();
    const order: string[] = [];
    const first = queue.enqueue(async () => {
      order.push('first-start');
      await Promise.resolve();
      order.push('first-end');
      return 1;
    });
    const second = queue.enqueue(() => {
      order.push('second');
      return 2;
    });
    expect(queue.pending).toBe(2);
    expect(await first).toBe(1);
    expect(await second).toBe(2);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
    expect(queue.pending).toBe(0);
  });

  it('keeps the chain alive after a task throws', async () => {
    const queue = createQueue();
    await expect(queue.enqueue(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await queue.enqueue(() => 'next')).toBe('next');
    expect(queue.pending).toBe(0);
  });

  it('rejects with the abort reason when the signal is aborted before the task runs', async () => {
    const queue = createQueue();
    const controller = new AbortController();
    controller.abort(new DOMException('cancelled', 'AbortError'));
    const ran = vi.fn();
    await expect(queue.enqueue(ran, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(ran).not.toHaveBeenCalled();
  });

  it('holds tasks while a gesture is active and releases when it ends', async () => {
    const queue = createQueue();
    queue.setGestureActive(true);
    const ran = vi.fn(() => 'done');
    const promise = queue.enqueue(ran);
    await vi.advanceTimersByTimeAsync(300);
    expect(ran).not.toHaveBeenCalled();
    queue.setGestureActive(false);
    expect(await promise).toBe('done');
    expect(queue.gestureActive).toBe(false);
  });

  it('holds tasks for at most the hold time', async () => {
    const queue = createQueue({ gestureHoldMs: 1000 });
    queue.setGestureActive(true);
    const ran = vi.fn(() => 'done');
    const promise = queue.enqueue(ran);
    await vi.advanceTimersByTimeAsync(999);
    expect(ran).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await promise).toBe('done');
    expect(queue.gestureActive).toBe(true);
  });

  it('lets an abort during the hold cancel the task without running it', async () => {
    const queue = createQueue();
    queue.setGestureActive(true);
    const controller = new AbortController();
    const ran = vi.fn();
    const promise = queue.enqueue(ran, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(ran).not.toHaveBeenCalled();
  });
});
