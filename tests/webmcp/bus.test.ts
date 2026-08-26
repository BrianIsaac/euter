import { describe, expect, it, vi } from 'vitest';
import { createCommandBus, type Reducer } from '../../src/webmcp/bus.ts';
import { ToolError } from '../../src/webmcp/envelope.ts';

interface Doc {
  revision: number;
  count: number;
}

const reducer: Reducer<Doc> = (document, command) => {
  if (command.type === 'fail') {
    throw new ToolError('OUT_OF_RANGE', 'nope', true);
  }
  const by = typeof command.args.by === 'number' ? command.args.by : 1;
  return {
    document: { ...document, count: document.count + by },
    changed: ['count'],
    summary: `count +${by}`,
    target_bars: [1, 2],
  };
};

describe('command bus', () => {
  it('applies a command, bumps the revision and records the activity', () => {
    let time = 100;
    const bus = createCommandBus(reducer, { revision: 0, count: 0 }, { now: () => time });
    const listener = vi.fn();
    bus.subscribe(listener);
    const result = bus.dispatch({ type: 'add', args: { by: 2 }, source: 'agent', why: 'because' });
    expect(result).toEqual({
      revision: 1,
      changed: ['count'],
      summary: 'count +2',
      target_bars: [1, 2],
    });
    expect(bus.getDocument()).toEqual({ revision: 1, count: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
    time = 200;
    bus.dispatch({ type: 'add', args: {}, source: 'human' });
    expect(bus.getActivities()).toEqual([
      {
        id: 1,
        at: 100,
        type: 'add',
        source: 'agent',
        why: 'because',
        revision: 1,
        changed: ['count'],
        summary: 'count +2',
        target_bars: [1, 2],
      },
      {
        id: 2,
        at: 200,
        type: 'add',
        source: 'human',
        revision: 2,
        changed: ['count'],
        summary: 'count +1',
        target_bars: [1, 2],
      },
    ]);
  });

  it('refuses a stale expected_revision and says what changed since', () => {
    const bus = createCommandBus(reducer, { revision: 0, count: 0 });
    bus.dispatch({ type: 'add', args: {}, source: 'human' });
    bus.dispatch({ type: 'add', args: { by: 5 }, source: 'human' });
    let thrown: unknown;
    try {
      bus.dispatch({ type: 'add', args: {}, source: 'agent', expected_revision: 0 });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ToolError);
    const error = thrown as ToolError;
    expect(error.code).toBe('STALE_REVISION');
    expect(error.message).toContain('revision 2, not 0');
    expect(error.message).toContain('count +1; count +5');
    expect(bus.getDocument().revision).toBe(2);
    expect(
      bus.dispatch({ type: 'add', args: {}, source: 'agent', expected_revision: 2 }).revision,
    ).toBe(3);
  });

  it('leaves the document untouched when the reducer refuses', () => {
    const bus = createCommandBus(reducer, { revision: 0, count: 0 });
    expect(() => bus.dispatch({ type: 'fail', args: {}, source: 'agent' })).toThrow(ToolError);
    expect(bus.getDocument()).toEqual({ revision: 0, count: 0 });
    expect(bus.getActivities()).toEqual([]);
  });

  it('caps the activity log and keeps the array reference stable between changes', () => {
    const bus = createCommandBus(reducer, { revision: 0, count: 0 }, { activityLimit: 3 });
    for (let index = 0; index < 5; index += 1) {
      bus.dispatch({ type: 'add', args: {}, source: 'human' });
    }
    const activities = bus.getActivities();
    expect(activities.map((entry) => entry.revision)).toEqual([3, 4, 5]);
    expect(bus.getActivities()).toBe(activities);
  });

  it('unsubscribes', () => {
    const bus = createCommandBus(reducer, { revision: 0, count: 0 });
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);
    unsubscribe();
    bus.dispatch({ type: 'add', args: {}, source: 'human' });
    expect(listener).not.toHaveBeenCalled();
  });
});
