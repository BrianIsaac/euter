import { describe, expect, it, vi } from 'vitest';
import {
  armedTakeRequestFromSong,
  createTakeRequestController,
} from '../../src/input/requestTake.ts';

describe('request_take arming', () => {
  it('arms a track and bar range with the teacher-producer prompt', () => {
    const controller = createTakeRequestController({ now: () => 123, makeId: () => 'request-1' });
    const listener = vi.fn();
    controller.subscribe(listener);
    const result = controller.arm({
      trackId: 'bass',
      barFrom: 9,
      barTo: 16,
      prompt: 'Hum me a bassline for the chorus',
    });
    expect(result).toEqual({
      ok: true,
      data: {
        id: 'request-1',
        trackId: 'bass',
        targetBars: { barFrom: 9, barTo: 16 },
        prompt: 'Hum me a bassline for the chorus',
        armedAt: 123,
      },
    });
    expect(controller.getSnapshot()).toEqual(result.ok ? result.data : null);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('rejects bad ranges and prompt lengths as data', () => {
    const controller = createTakeRequestController();
    expect(controller.arm({ trackId: '', barFrom: 0, barTo: 1, prompt: '' })).toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
      recoverable: true,
    });
    expect(
      controller.arm({ trackId: 'bass', barFrom: 3, barTo: 2, prompt: 'Try this' }),
    ).toMatchObject({ ok: false });
  });

  it('only clears the matching request when an id is supplied', () => {
    const controller = createTakeRequestController({ makeId: () => 'request-1' });
    controller.arm({ trackId: 'bass', barFrom: 1, barTo: 4, prompt: 'Your turn' });
    controller.clear('another-request');
    expect(controller.getSnapshot()?.id).toBe('request-1');
    controller.clear('request-1');
    expect(controller.getSnapshot()).toBeNull();
  });

  it('maps Lane A persisted request fields for TakePanel', () => {
    expect(
      armedTakeRequestFromSong({
        id: 'request-song',
        track_id: 'bass',
        bar_from: 5,
        bar_to: 8,
        prompt: 'Play this part',
      }),
    ).toEqual({
      id: 'request-song',
      trackId: 'bass',
      targetBars: { barFrom: 5, barTo: 8 },
      prompt: 'Play this part',
      armedAt: 0,
    });
  });
});
