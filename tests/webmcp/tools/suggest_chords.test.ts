import { describe, expect, it } from 'vitest';
import { createHarness } from '../../helpers/harness.ts';

interface SuggestionEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: {
    key: string;
    style: string;
    weakest_fit: number;
    chords: { bar: number; symbol: string; fit: number }[];
  };
}

describe('suggest_chords', () => {
  it('proposes one chord per bar with a fit score and changes nothing', async () => {
    const harness = createHarness();
    const before = harness.engine.store.getDocument();
    const envelope = (await harness.invoke('suggest_chords', {
      bar_from: 1,
      bar_to: 4,
      style: 'pop',
    })) as SuggestionEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.changed).toEqual([]);
    expect(envelope.data.key).toBe('C major');
    expect(envelope.data.style).toBe('pop');
    expect(envelope.data.chords.map(({ bar }) => bar)).toEqual([1, 2, 3, 4]);
    for (const { symbol, fit } of envelope.data.chords) {
      expect(symbol.length).toBeGreaterThan(0);
      expect(fit).toBeGreaterThan(0);
      expect(fit).toBeLessThanOrEqual(1);
      expect(fit).toBe(Math.round(fit * 100) / 100);
    }
    expect(envelope.data.chords.slice(2).map(({ symbol }) => symbol)).toEqual(['G', 'C']);
    expect(envelope.data.weakest_fit).toBe(Math.min(...envelope.data.chords.map(({ fit }) => fit)));
    expect(envelope.summary).toBe('4 pop chords for bars 1-4 in C major');

    const after = harness.engine.store.getDocument();
    expect(after.revision).toBe(before.revision);
    expect(envelope.revision).toBe(before.revision);
    expect(after.chords).toEqual(before.chords);
    harness.engine.dispose();
  });

  it('refuses more than sixteen bars in one call', async () => {
    const harness = createHarness();
    harness.engine.store.dispatch({
      type: 'arrange',
      args: { sections: [{ name: 'Verse', bar_from: 1, bar_to: 8, repeat: 2 }] },
      source: 'agent',
      why: 'Longer song.',
    });
    expect(harness.engine.store.getDocument().bars).toBe(24);

    await expect(
      harness.invoke('suggest_chords', { bar_from: 1, bar_to: 17, style: 'lofi' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'RESULT_TOO_LARGE',
      message: 'Ask for at most 16 bars at a time.',
    });
    harness.engine.dispose();
  });

  it('refuses a range past the end of the song and an inverted range', async () => {
    const harness = createHarness();
    await expect(
      harness.invoke('suggest_chords', { bar_from: 5, bar_to: 9, style: 'soul' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'OUT_OF_RANGE',
      message: 'The song has 8 bars.',
    });
    await expect(
      harness.invoke('suggest_chords', { bar_from: 4, bar_to: 2, style: 'soul' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
      message: 'Give an ordered, one-based bar range.',
    });
    harness.engine.dispose();
  });
});
