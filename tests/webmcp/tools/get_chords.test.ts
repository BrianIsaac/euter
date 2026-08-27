import { describe, expect, it } from 'vitest';
import { loadExampleSong } from '../../../src/song/serialise.ts';
import { createHarness } from '../../helpers/harness.ts';

interface ChordsEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: { key: string; chords: { bar: number; symbol: string; roman: string }[] };
}

describe('get_chords', () => {
  it('returns the symbol and its Roman numeral for the requested range', async () => {
    const harness = createHarness();
    const envelope = (await harness.invoke('get_chords', {
      bar_from: 1,
      bar_to: 4,
    })) as ChordsEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.summary).toBe('4 chords in C major');
    expect(envelope.data.key).toBe('C major');
    expect(envelope.data.chords).toEqual([
      { bar: 1, symbol: 'C', roman: 'I' },
      { bar: 2, symbol: 'F', roman: 'IV' },
      { bar: 3, symbol: 'Am', roman: 'VIm' },
      { bar: 4, symbol: 'G', roman: 'V' },
    ]);
    expect(envelope.revision).toBe(0);
    expect(envelope.changed).toEqual([]);
    expect(harness.engine.store.getDocument().revision).toBe(0);
    harness.engine.dispose();
  });

  it('reads the whole song when the range is omitted', async () => {
    const harness = createHarness();
    const envelope = (await harness.invoke('get_chords')) as ChordsEnvelope;

    expect(envelope.data.chords.map(({ bar }) => bar)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(envelope.data.chords.map(({ symbol }) => symbol)).toEqual([
      'C',
      'F',
      'Am',
      'G',
      'C',
      'F',
      'Dm',
      'G',
    ]);
    expect(envelope.summary).toBe('8 chords in C major');
    harness.engine.dispose();
  });

  it('omits the bars that have no chord', async () => {
    const song = loadExampleSong();
    const harness = createHarness({
      engine: { document: { ...song, chords: song.chords.filter(({ bar }) => bar !== 3) } },
    });
    const envelope = (await harness.invoke('get_chords', {
      bar_from: 1,
      bar_to: 4,
    })) as ChordsEnvelope;

    expect(envelope.data.chords.map(({ bar }) => bar)).toEqual([1, 2, 4]);
    expect(envelope.summary).toBe('3 chords in C major');
    harness.engine.dispose();
  });
});
