import { describe, expect, it } from 'vitest';
import { decodeTakeAudio, encodeTakeAudio } from '../../src/audio/clips.ts';

describe('retained take audio', () => {
  it('round-trips mono PCM with its measured alignment metadata', () => {
    const input = Float32Array.from([-1, -0.25, 0, 0.25, 1]);
    const encoded = encodeTakeAudio(input, 48_000, 0.037, 8);
    let channel = new Float32Array();
    const context = {
      createBuffer: (_channels: number, length: number, sampleRate: number) => {
        channel = new Float32Array(length);
        return {
          sampleRate,
          length,
          numberOfChannels: 1,
          duration: length / sampleRate,
          getChannelData: () => channel,
        } as unknown as AudioBuffer;
      },
    };

    const decoded = decodeTakeAudio(encoded, context);

    expect(encoded).toMatchObject({
      encoding: 'pcm16-base64',
      sample_rate: 48_000,
      channels: 1,
      trim_start_s: 0.037,
      start_beat: 8,
    });
    expect(decoded.sampleRate).toBe(48_000);
    expect([...channel]).toEqual(expect.arrayContaining([-1, 0, 1]));
    expect(channel[1]).toBeCloseTo(-0.25, 4);
    expect(channel[3]).toBeCloseTo(0.25, 4);
  });

  it('rejects invalid alignment metadata and malformed PCM', () => {
    expect(() => encodeTakeAudio(new Float32Array(), 0)).toThrow('sample rate');
    expect(() => encodeTakeAudio(new Float32Array(), 48_000, -1)).toThrow('trim start');
    expect(() => encodeTakeAudio(new Float32Array(), 48_000, 0, -1)).toThrow('start beat');
    expect(() =>
      decodeTakeAudio(
        {
          encoding: 'pcm16-base64',
          sample_rate: 48_000,
          channels: 1,
          samples: btoa('x'),
          trim_start_s: 0,
          start_beat: 0,
        },
        { createBuffer: () => ({}) as AudioBuffer },
      ),
    ).toThrow('odd byte length');
  });
});
