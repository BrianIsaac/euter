import { describe, expect, it } from 'vitest';
import type { PitchFrame } from '../../src/song/types.ts';
import {
  alignPitchTrack,
  analysePcm,
  createTakeFromPitchTrack,
  transcribePcmToTake,
} from '../../src/transcribe/takes.ts';

function sine(hz: number, seconds: number, sampleRate: number): Float32Array {
  return Float32Array.from({ length: Math.round(seconds * sampleRate) }, (_, index) =>
    Math.sin((2 * Math.PI * hz * index) / sampleRate),
  );
}

describe('take transcription', () => {
  it('aligns frames by capture clock plus browser-reported input and output latency', () => {
    const frames: PitchFrame[] = [
      { t: 1, hz: 261.63, clarity: 0.9 },
      { t: 1.1, hz: 261.63, clarity: 0.9 },
      { t: 1.2, hz: 261.63, clarity: 0.9 },
    ];
    expect(
      alignPitchTrack(frames, {
        captureOffsetSeconds: 0.98,
        inputLatency: 0.02,
        baseLatency: 0.04,
        outputLatency: 0.06,
      }),
    ).toEqual([
      { t: 0, hz: 261.63, clarity: 0.9 },
      { t: 0.1, hz: 261.63, clarity: 0.9 },
    ]);
  });

  it('keeps the voiced tail of a note that crosses the count-in boundary', () => {
    const frames: PitchFrame[] = Array.from({ length: 31 }, (_, index) => ({
      t: 0.9 + index * 0.01,
      hz: 261.63,
      clarity: 0.95,
    }));
    const take = createTakeFromPitchTrack(frames, {
      id: 'straddled',
      source: 'mic',
      bpm: 120,
      durationSeconds: 1.3,
      captureOffsetSeconds: 1,
    });

    expect(take.notes).toHaveLength(1);
    expect(take.notes[0]).toMatchObject({ p: 60, s: 0, s_raw: 0, source: 'take' });
    expect(take.notes[0]?.d_raw).toBeGreaterThan(0.35);
    expect(take.pitch_track[0]?.t).toBe(0);
  });

  it('builds take quality metrics, range, raw notes and tempo hint', () => {
    const frames: PitchFrame[] = [
      { t: 1.1, hz: 261.63, clarity: 0.92 },
      { t: 1.12, hz: 261.63, clarity: 0.94 },
      { t: 1.14, hz: 261.63, clarity: 0.93 },
      { t: 1.16, hz: 0, clarity: 0 },
    ];
    const take = createTakeFromPitchTrack(frames, {
      id: 'take-1',
      source: 'mic',
      bpm: 120,
      durationSeconds: 2,
      captureOffsetSeconds: 0.98,
      inputLatency: 0.02,
      baseLatency: 0.04,
      outputLatency: 0.06,
    });
    expect(take).toMatchObject({
      id: 'take-1',
      source: 'mic',
      duration_s: 0.9,
      voiced_ratio: 0.75,
      median_clarity: 0.93,
      tempo_hint: 120,
    });
    expect(take.pitch_range[0]).toBeLessThanOrEqual(60);
    expect(take.pitch_range[1]).toBeGreaterThanOrEqual(60);
    expect(take.notes[0]).toMatchObject({ p: 60, source: 'take', s_raw: 0, d_raw: 0.12 });
  });

  it('detects A4 from PCM through pitchy and the shared take path', () => {
    const pcm = sine(440, 0.6, 16_000);
    const frames = analysePcm(pcm, 16_000);
    expect(frames.length).toBeGreaterThan(10);
    expect(frames.filter((frame) => frame.clarity > 0.8).length).toBeGreaterThan(5);

    const take = transcribePcmToTake(pcm, 16_000, {
      id: 'import-a4',
      source: 'import',
      bpm: 120,
    });
    expect(take.notes).toHaveLength(1);
    expect(take.notes[0]?.p).toBe(69);
    expect(take.voiced_ratio).toBeGreaterThan(0.8);
    expect(take.pitch_range[0]).toBeLessThanOrEqual(69);
    expect(take.pitch_range[1]).toBeGreaterThanOrEqual(69);
  });

  it('returns an empty but valid take for silence', () => {
    const take = transcribePcmToTake(new Float32Array(4096), 16_000, {
      id: 'silent',
      source: 'import',
      bpm: 90,
    });
    expect(take.notes).toEqual([]);
    expect(take.voiced_ratio).toBe(0);
    expect(take.median_clarity).toBe(0);
    expect(take.pitch_range).toEqual([0, 0]);
  });
});
