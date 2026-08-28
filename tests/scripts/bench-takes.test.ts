import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { benchmarkTake, decodePcm16Wav, runTakeBench } from '../../scripts/bench-takes.ts';

const fixture = (name: string): string => resolve('tests/fixtures', name);

describe('take benchmark', () => {
  it('decodes the checked-in mono PCM16 WAV shape', () => {
    const path = fixture('original-hum-scale.wav');
    const decoded = decodePcm16Wav(readFileSync(path));
    expect(decoded.sampleRate).toBe(16_000);
    expect(decoded.pcm.length).toBeGreaterThan(16_000);
  });

  it('keeps all three original fixtures below 300 KB and measures their expected notes', () => {
    const files = [
      'original-hum-scale.wav',
      'original-octave-blip.wav',
      'original-breath-noise.wav',
    ];
    for (const file of files) expect(statSync(fixture(file)).size).toBeLessThan(300_000);
    const results = files.map((file) => benchmarkTake(fixture(file)));
    expect(results.map((result) => result.expectedNotes)).toEqual([4, 1, 1]);
    expect(results.map((result) => result.wrongOctaves)).toEqual([0, 0, 0]);
    expect(results.map((result) => result.splitNotes)).toEqual([0, 0, 0]);
  });

  it('discovers fixture and operator-take subdirectories in one command', () => {
    const log = console.log;
    console.log = () => undefined;
    try {
      expect(runTakeBench(resolve('tests/fixtures'))).toHaveLength(13);
    } finally {
      console.log = log;
    }
  });

  it('reproduces the six note-count failures measured on the ten real hummed takes', () => {
    const names = [
      'take-01-ascending',
      'take-02-descending',
      'take-03-low-register',
      'take-04-octave-leap',
      'take-05-repeated-note',
      'take-06-held-notes',
      'take-07-scale',
      'take-08-phrase',
      'take-09-quiet',
      'take-10-wide',
    ];
    const results = names.map((name) => benchmarkTake(fixture(`takes/${name}.wav`)));

    expect(results.map(({ notes }) => notes)).toEqual([4, 4, 6, 5, 3, 3, 6, 4, 3, 7]);
    expect(results.map(({ expectedNotes }) => expectedNotes)).toEqual([
      4, 4, 4, 3, 4, 2, 5, 4, 3, 4,
    ]);
    expect(results.filter(({ notes, expectedNotes }) => notes !== expectedNotes)).toHaveLength(6);
    expect(results[2]?.pitches).toEqual([47, 50, 52, 40, 51, 57]);
  });
});
