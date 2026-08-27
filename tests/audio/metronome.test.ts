import { describe, expect, it, vi } from 'vitest';
import {
  createMetronome,
  type MetronomeClick,
  type MetronomeTransport,
} from '../../src/audio/metronome.ts';

function dependencies() {
  let id = 1;
  const scheduled = new Map<number, { callback: (time: number) => void; position: string }>();
  const repeated = new Map<number, (time: number) => void>();
  const transport: MetronomeTransport = {
    bpm: { value: 90 },
    position: '2:0:0',
    schedule: vi.fn((callback, position) => {
      const next = id++;
      scheduled.set(next, { callback, position });
      return next;
    }),
    scheduleRepeat: vi.fn((callback) => {
      const next = id++;
      repeated.set(next, callback);
      return next;
    }),
    clear: vi.fn((clearId) => {
      scheduled.delete(clearId);
      repeated.delete(clearId);
    }),
    start: vi.fn(),
  };
  const click: MetronomeClick = { play: vi.fn(), dispose: vi.fn() };
  return { transport, click, scheduled, repeated };
}

describe('transport metronome', () => {
  it('schedules a two-bar count-in with accented downbeats', async () => {
    const deps = dependencies();
    const onBeat = vi.fn();
    const onComplete = vi.fn();
    const metronome = createMetronome(async () => deps);
    const countIn = await metronome.scheduleCountIn({
      bars: 2,
      bpm: 120,
      onBeat,
      onComplete,
    });
    expect(countIn.duration_s).toBe(4);
    expect(deps.transport).toMatchObject({ bpm: { value: 120 }, position: '0:0:0' });
    expect([...deps.scheduled.values()].map(({ position }) => position)).toEqual([
      '0:0:0',
      '0:1:0',
      '0:2:0',
      '0:3:0',
      '1:0:0',
      '1:1:0',
      '1:2:0',
      '1:3:0',
      '2:0:0',
    ]);
    deps.scheduled.get(1)?.callback(0.5);
    deps.scheduled.get(2)?.callback(1);
    deps.scheduled.get(9)?.callback(4.5);
    expect(deps.click.play).toHaveBeenNthCalledWith(1, 0.5, true);
    expect(deps.click.play).toHaveBeenNthCalledWith(2, 1, false);
    expect(onBeat).toHaveBeenNthCalledWith(1, {
      bar: 1,
      beat: 1,
      accented: true,
      time: 0.5,
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(deps.transport.start).toHaveBeenCalledTimes(1);
  });

  it('continues the click and clears every scheduled event', async () => {
    const deps = dependencies();
    const metronome = createMetronome(async () => deps);
    const scheduled = await metronome.scheduleCountIn({
      bars: 1,
      bpm: 90,
      continueClick: true,
    });
    deps.repeated.get(6)?.(3);
    expect(deps.click.play).toHaveBeenCalledWith(3, true);
    expect(deps.transport.scheduleRepeat).toHaveBeenCalledWith(expect.any(Function), '4n', '1:0:0');
    scheduled.cancel();
    expect(deps.scheduled.size).toBe(0);
    expect(deps.repeated.size).toBe(0);
    metronome.dispose();
    expect(deps.click.dispose).toHaveBeenCalledTimes(1);
  });

  it('rejects unusable tempos before importing Tone', async () => {
    const provider = vi.fn(async () => dependencies());
    await expect(createMetronome(provider).scheduleCountIn({ bars: 1, bpm: 20 })).rejects.toThrow(
      RangeError,
    );
    expect(provider).not.toHaveBeenCalled();
  });
});
