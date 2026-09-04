import { describe, expect, it } from 'vitest';
import type { TransportPort } from '../../src/input/transportPort.ts';

describe('Lane B transport port', () => {
  it('keeps the count-in and clock boundary structural for Lane A', async () => {
    const port: TransportPort = {
      getAudioContext: () => null,
      getBpm: () => 96,
      getTimeSignature: () => [4, 4],
      getPositionSeconds: () => 2.5,
      countIn: async ({ bars }) => ({
        durationSeconds: (bars * 4 * 60) / 96,
        recordingStartContextTime: 7.5,
      }),
    };
    expect(port.getBpm()).toBe(96);
    expect(await port.countIn({ bars: 1, metronome: true })).toEqual({
      durationSeconds: 2.5,
      recordingStartContextTime: 7.5,
    });
  });
});
