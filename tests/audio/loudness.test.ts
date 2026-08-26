import { describe, expect, it } from 'vitest';
import {
  analyseAudioBuffer,
  analyseLoudness,
  analyseTrackLoudness,
} from '../../src/audio/loudness.ts';

function sine(
  frequency: number,
  amplitude: number,
  seconds = 1,
  sampleRate = 48_000,
): Float32Array {
  return Float32Array.from(
    { length: seconds * sampleRate },
    (_, index) => amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate),
  );
}

describe('offline loudness analysis', () => {
  it('reports silence without NaN', () => {
    expect(analyseLoudness([new Float32Array(100)], 48_000)).toEqual({
      peak: 0,
      peak_dbfs: -Infinity,
      k_weighted_rms: 0,
      loudness_dbfs: -Infinity,
    });
  });

  it('reports peak dBFS and a K-weighted RMS for a sine', () => {
    const reading = analyseLoudness([sine(1000, 0.5)], 48_000);
    expect(reading.peak).toBe(0.5);
    expect(reading.peak_dbfs).toBeCloseTo(-6.021, 3);
    expect(reading.k_weighted_rms).toBeGreaterThan(0.3);
    expect(reading.loudness_dbfs).toBeLessThan(0);
  });

  it('attenuates sub-bass and weights high-frequency energy', () => {
    const low = analyseLoudness([sine(20, 0.5)], 48_000);
    const high = analyseLoudness([sine(5000, 0.5)], 48_000);
    expect(high.k_weighted_rms).toBeGreaterThan(low.k_weighted_rms * 2);
  });

  it('analyses native buffers and returns per-track readings', () => {
    const data = sine(440, 0.25);
    const buffer = {
      numberOfChannels: 1,
      sampleRate: 48_000,
      getChannelData: () => data,
    } as unknown as AudioBuffer;
    expect(analyseAudioBuffer(buffer).peak).toBe(0.25);
    const tracks = analyseTrackLoudness({ melody: [data], bass: [sine(80, 0.1)] }, 48_000);
    expect(Object.keys(tracks)).toEqual(['melody', 'bass']);
    expect(tracks.melody?.peak_dbfs).toBeCloseTo(-12.041, 3);
  });

  it('rejects invalid sample rates and handles no channels', () => {
    expect(() => analyseLoudness([], 0)).toThrow(RangeError);
    expect(analyseLoudness([], 48_000).peak_dbfs).toBe(-Infinity);
  });
});
