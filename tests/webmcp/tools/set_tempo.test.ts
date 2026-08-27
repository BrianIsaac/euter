import { describe, expect, it } from 'vitest';
import { createHarness } from '../../helpers/harness.ts';

interface TempoEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: { bpm: number };
}

describe('set_tempo', () => {
  it('moves the tempo on the document and hands it back', async () => {
    const harness = createHarness();
    expect(harness.engine.store.getDocument().bpm).toBe(92);

    const envelope = (await harness.invoke('set_tempo', {
      bpm: 84,
      why: 'Slowing it a little so the words have room.',
    })) as TempoEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.summary).toBe('Set tempo to 84 bpm');
    expect(envelope.data).toEqual({ bpm: 84 });
    expect(envelope.changed).toContain('bpm');

    const song = harness.engine.store.getDocument();
    expect(song.bpm).toBe(84);
    expect(song.notes_log.at(-1)).toMatchObject({
      why: 'Slowing it a little so the words have room.',
      bars: [1, 8],
      source: 'agent',
    });
    harness.engine.dispose();
  });

  it('bumps the revision by exactly one per call', async () => {
    const harness = createHarness();
    const first = (await harness.invoke('set_tempo', { bpm: 96, why: 'A touch faster.' })) as {
      revision: number;
    };
    const second = (await harness.invoke('set_tempo', { bpm: 100, why: 'Faster again.' })) as {
      revision: number;
    };
    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect(harness.engine.store.getDocument().revision).toBe(2);
    harness.engine.dispose();
  });

  it('refuses a tempo outside 40 to 220 before anything is dispatched', async () => {
    const harness = createHarness();
    for (const bpm of [30, 900]) {
      const envelope = (await harness.invoke('set_tempo', { bpm, why: 'Out of range.' })) as {
        ok: false;
        code: string;
        message: string;
      };
      expect(envelope.ok).toBe(false);
      expect(envelope.code).toBe('INVALID_ARGUMENT');
      expect(envelope.message).toContain('bpm');
    }
    const song = harness.engine.store.getDocument();
    expect(song.bpm).toBe(92);
    expect(song.revision).toBe(0);
    harness.engine.dispose();
  });
});
