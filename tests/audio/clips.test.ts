import { describe, expect, it } from 'vitest';
import { decodeTakeAudio, encodeTakeAudio, scheduleVocalAudio } from '../../src/audio/clips.ts';
import type { Take } from '../../src/song/types.ts';

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

  it('uses overlapping grains for explicit key-aware correction without changing duration', () => {
    const starts: number[][] = [];
    const rates: number[] = [];
    const ramps: number[][] = [];
    const context = {
      createBufferSource: () => {
        const playbackRate = { value: 1 };
        return {
          buffer: null,
          playbackRate,
          connect: () => undefined,
          start: (...args: number[]) => {
            starts.push(args);
            rates.push(playbackRate.value);
          },
        };
      },
      createGain: () => ({
        gain: {
          setValueAtTime: (value: number, time: number) => ramps.push([value, time]),
          linearRampToValueAtTime: (value: number, time: number) => ramps.push([value, time]),
        },
        connect: () => undefined,
      }),
    } as unknown as BaseAudioContext;
    const audio = encodeTakeAudio(new Float32Array(8_000), 8_000);
    const take: Take = {
      id: 'voice',
      source: 'mic',
      notes: [{ p: 61, s: 0, d: 1, v: 0.8, source: 'take' }],
      pitch_track: [{ t: 0, hz: 277.18, clarity: 0.95 }],
      duration_s: 1,
      voiced_ratio: 1,
      median_clarity: 0.95,
      pitch_range: [61, 61],
      tempo_hint: 60,
      audio,
    };
    const buffer = { duration: 1 } as AudioBuffer;

    const grains = scheduleVocalAudio({
      context,
      destination: {},
      buffer,
      take,
      clip: { id: 'voice', take_id: 'voice', s: 0, tuning_strength: 1 },
      keyName: 'C major',
      bpm: 60,
      whenSeconds: 2,
      clipElapsedSeconds: 0,
      durationSeconds: 0.12,
    });

    expect(grains).toBe(4);
    expect(starts[0]?.[0]).toBe(2);
    expect(starts.at(-1)?.[0]).toBeCloseTo(2.09, 6);
    expect(rates.every((rate) => rate < 1)).toBe(true);
    expect(rates[0]).toBeCloseTo(2 ** (-1 / 12), 3);
    expect(ramps).toHaveLength(grains * 3);
  });

  it('warps grain source positions so performed attacks move toward the selected grid', () => {
    const starts: number[][] = [];
    const context = {
      createBufferSource: () => ({
        buffer: null,
        playbackRate: { value: 1 },
        connect: () => undefined,
        start: (...args: number[]) => starts.push(args),
      }),
      createGain: () => ({
        gain: {
          setValueAtTime: () => undefined,
          linearRampToValueAtTime: () => undefined,
        },
        connect: () => undefined,
      }),
    } as unknown as BaseAudioContext;
    const audio = encodeTakeAudio(new Float32Array(8_000), 8_000);
    const take: Take = {
      id: 'voice',
      source: 'mic',
      notes: [{ p: 60, s: 0.13, d: 0.5, v: 0.8, s_raw: 0.13, source: 'take' }],
      pitch_track: [],
      duration_s: 1,
      voiced_ratio: 1,
      median_clarity: 0.95,
      pitch_range: [60, 60],
      tempo_hint: 60,
      audio,
    };

    scheduleVocalAudio({
      context,
      destination: {},
      buffer: { duration: 1 } as AudioBuffer,
      take,
      clip: {
        id: 'voice',
        take_id: 'voice',
        s: 0,
        timing_grid: '16n',
        timing_strength: 1,
      },
      keyName: 'C major',
      bpm: 60,
      whenSeconds: 0,
      clipElapsedSeconds: 0,
      durationSeconds: 0.12,
    });

    expect(starts).toHaveLength(4);
    expect(starts[1]?.[1]).toBeCloseTo(0.0156, 4);
    expect(starts[1]?.[1]).toBeLessThan(starts[1]?.[0] ?? 0);
    expect(starts[0]?.[2]).toBeCloseTo(0.06, 6);
  });
});
