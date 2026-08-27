import { describe, expect, it } from 'vitest';
import { createEmptySong } from '../../../src/song/types.ts';
import { createHarness } from '../../helpers/harness.ts';

interface KeyEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: {
    key: string;
    confidence: number;
    alternatives: { name: string; confidence: number }[];
  };
}

describe('set_key', () => {
  it('sets the key and reports how well the melody fits it, with the ranked alternatives', async () => {
    const harness = createHarness();
    const envelope = (await harness.invoke('set_key', {
      key: 'A minor',
      why: 'Your hum keeps falling to A, so we will call it the relative minor.',
    })) as KeyEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.revision).toBe(1);
    expect(envelope.summary).toBe('Set key to A minor');
    expect(envelope.data.key).toBe('A minor');
    expect(envelope.data.confidence).toBe(0.83);
    expect(envelope.data.alternatives).toEqual([
      { name: 'C major', confidence: 1 },
      { name: 'F major', confidence: 0.91 },
      { name: 'E minor', confidence: 0.8 },
    ]);

    const song = harness.engine.store.getDocument();
    expect(song.key.name).toBe('A minor');
    expect(song.notes_log.at(-1)).toMatchObject({
      why: 'Your hum keeps falling to A, so we will call it the relative minor.',
      bars: [1, 8],
      track_id: null,
      source: 'agent',
    });
    harness.engine.dispose();
  });

  it('names the key the melody actually sits in as its own best reading', async () => {
    const harness = createHarness();
    const envelope = (await harness.invoke('set_key', {
      key: 'C major',
      why: 'Your hum starts and ends on C.',
    })) as KeyEnvelope;

    expect(envelope.data.confidence).toBe(1);
    expect(envelope.data.alternatives.map(({ name }) => name)).not.toContain('C major');
    expect(envelope.data.alternatives[0]).toEqual({ name: 'F major', confidence: 0.91 });
    harness.engine.dispose();
  });

  it('refuses a key it cannot parse and leaves the song where it was', async () => {
    const harness = createHarness();
    await expect(
      harness.invoke('set_key', { key: 'H sharp lydianish', why: 'Not a key.' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
      message: 'Use a key such as "C major" or "A minor".',
      recoverable: true,
    });
    const song = harness.engine.store.getDocument();
    expect(song.key.name).toBe('C major');
    expect(song.revision).toBe(0);
    harness.engine.dispose();
  });

  it('sets a requested key without inventing alternatives when there is no melody evidence', async () => {
    const harness = createHarness({ engine: { document: createEmptySong('Blank') } });
    const envelope = (await harness.invoke('set_key', {
      key: 'A minor',
      why: 'Start this empty sketch in A minor.',
    })) as KeyEnvelope;

    expect(envelope).toMatchObject({
      ok: true,
      data: { key: 'A minor', confidence: 0, alternatives: [] },
    });
    expect(harness.engine.store.getDocument().key).toEqual({
      name: 'A minor',
      confidence: 0,
      alternatives: [],
    });
    harness.engine.dispose();
  });
});
