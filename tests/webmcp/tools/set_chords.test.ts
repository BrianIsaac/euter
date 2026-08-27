import { describe, expect, it } from 'vitest';
import { createHarness } from '../../helpers/harness.ts';

describe('set_chords', () => {
  it('sets the chords, pins the reason and returns Roman numerals in the key', async () => {
    const harness = createHarness();
    const envelope = (await harness.invoke('set_chords', {
      chords: [
        { bar: 1, symbol: 'Am7' },
        { bar: 2, symbol: 'Fmaj7' },
      ],
      why: 'A softer pair under your first phrase.',
    })) as { ok: true; revision: number; data: { chords: { bar: number; roman: string }[] } };

    expect(envelope.ok).toBe(true);
    expect(envelope.revision).toBe(1);
    expect(envelope.data.chords).toEqual([
      { bar: 1, symbol: 'Am7', roman: expect.any(String) },
      { bar: 2, symbol: 'Fmaj7', roman: expect.any(String) },
    ]);
    const song = harness.engine.store.getDocument();
    expect(song.chords.find(({ bar }) => bar === 1)?.symbol).toBe('Am7');
    expect(song.notes_log.at(-1)).toMatchObject({
      why: 'A softer pair under your first phrase.',
      source: 'agent',
      bars: [1, 2],
    });
    harness.engine.dispose();
  });

  it('refuses a symbol tonal cannot parse and a bar past the song', async () => {
    const harness = createHarness();
    await expect(
      harness.invoke('set_chords', { chords: [{ bar: 1, symbol: 'Zzz9' }], why: 'Nonsense.' }),
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    await expect(
      harness.invoke('set_chords', { chords: [{ bar: 99, symbol: 'C' }], why: 'Past the end.' }),
    ).resolves.toMatchObject({ ok: false, code: 'OUT_OF_RANGE' });
    expect(harness.engine.store.getDocument().revision).toBe(0);
    harness.engine.dispose();
  });

  it('refuses a stale expected_revision and says what changed', async () => {
    const harness = createHarness();
    await harness.invoke('set_tempo', { bpm: 96, why: 'A little faster.' });
    const envelope = (await harness.invoke('set_chords', {
      chords: [{ bar: 1, symbol: 'G' }],
      why: 'Working from an old reading.',
      expected_revision: 0,
    })) as { ok: false; code: string; message: string };
    expect(envelope.code).toBe('STALE_REVISION');
    expect(envelope.message).toContain('Set tempo to 96 bpm');
    harness.engine.dispose();
  });
});
