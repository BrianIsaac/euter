import { describe, expect, it } from 'vitest';
import type { PitchFrame } from '../../src/song/types.ts';
import { segmentPitchTrack } from '../../src/transcribe/segment.ts';

function hz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function pitchedFrames(
  midiAt: (time: number) => number,
  from: number,
  to: number,
  clarity = 0.95,
): PitchFrame[] {
  const frames: PitchFrame[] = [];
  for (let time = from; time <= to + 1e-9; time += 0.01) {
    frames.push({ t: Number(time.toFixed(3)), hz: hz(midiAt(time)), clarity });
  }
  return frames;
}

describe('segmentPitchTrack', () => {
  it('turns a steady pitch into one note on the known grid', () => {
    const notes = segmentPitchTrack(
      pitchedFrames(() => 60, 0, 0.19),
      { bpm: 120 },
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ p: 60, s: 0 });
    expect(notes[0]?.d).toBeCloseTo(0.4);
    expect(notes[0]?.v).toBeGreaterThan(0.9);
  });

  it('splits a glide when it moves by more than 0.8 semitones', () => {
    const glide = pitchedFrames((time) => 60 + time * 12, 0, 0.4);
    const notes = segmentPitchTrack(glide, { bpm: 100 });
    expect(notes.length).toBeGreaterThanOrEqual(3);
    expect(notes[0]?.p).toBeLessThan(notes.at(-1)?.p ?? 0);
  });

  it('folds an isolated short octave blip between agreeing neighbours', () => {
    const track = [
      ...pitchedFrames(() => 60, 0, 0.14),
      ...pitchedFrames(() => 72, 0.15, 0.21),
      ...pitchedFrames(() => 60, 0.22, 0.37),
    ];
    const notes = segmentPitchTrack(track, { bpm: 120 });
    expect(notes).toHaveLength(1);
    expect(notes[0]?.p).toBe(60);
  });

  it('bridges a 20 ms breath but splits a longer unvoiced gap', () => {
    const before = pitchedFrames(() => 64, 0, 0.09);
    const shortGap = segmentPitchTrack([...before, ...pitchedFrames(() => 64, 0.12, 0.2)], {
      bpm: 120,
    });
    const longGap = segmentPitchTrack([...before, ...pitchedFrames(() => 64, 0.14, 0.22)], {
      bpm: 120,
    });
    expect(shortGap).toHaveLength(1);
    expect(longGap).toHaveLength(2);
  });

  it('drops a sub-50 ms note and a low-clarity noisy tail', () => {
    const short = pitchedFrames(() => 67, 0, 0.02);
    const clear = pitchedFrames(() => 69, 0.1, 0.2);
    const noisyTail = pitchedFrames((time) => 69 + Math.sin(time * 500) * 5, 0.21, 0.4, 0.3);
    const notes = segmentPitchTrack([...short, ...clear, ...noisyTail], { bpm: 120 });
    expect(notes).toHaveLength(1);
    expect(notes[0]?.p).toBe(69);
    expect(notes[0]?.d).toBeCloseTo(0.22);
  });
});
