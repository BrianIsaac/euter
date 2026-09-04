import { describe, expect, it } from 'vitest';
import type { Note } from '../../../src/song/types.ts';
import { createHarness, makeTake, type Harness } from '../../helpers/harness.ts';

interface QuantizeEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: {
    track_id: string;
    grid: '8n' | '16n';
    strength: number;
    reversible: boolean;
    target_bars: [number, number];
  };
}

/**
 * Commits the sung take onto the melody track with its recorded timing intact.
 *
 * @param harness - The harness to write into.
 */
async function commitSungTake(harness: Harness): Promise<void> {
  harness.engine.addTake(makeTake('take-1'), 'Keeping your hum.', 'agent');
  await harness.invoke('commit_take', {
    take_id: 'take-1',
    track_id: 'melody',
    quantize_strength: 0,
    grid: '16n',
    why: 'Your timing exactly as you sang it.',
  });
}

/**
 * Reads the notes that came from the take.
 *
 * @param harness - The harness to read.
 * @returns The take notes on the melody track, in order.
 */
function sungNotes(harness: Harness): Note[] {
  const melody = harness.engine.store.getDocument().tracks.find(({ id }) => id === 'melody');
  return (melody?.notes ?? []).filter(({ source }) => source === 'take');
}

describe('set_quantize', () => {
  it('snaps the sung timing onto the grid and says the change is reversible', async () => {
    const harness = createHarness();
    await commitSungTake(harness);
    expect(sungNotes(harness).map(({ s }) => s)).toEqual([0.06, 1.06, 2.06, 3.06]);

    const envelope = (await harness.invoke('set_quantize', {
      track_id: 'melody',
      grid: '16n',
      strength: 1,
      why: 'Tightening the hum onto the semiquavers.',
    })) as QuantizeEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.summary).toBe('Quantised Melody to 16n at 100%');
    expect(envelope.data).toEqual({
      track_id: 'melody',
      grid: '16n',
      strength: 1,
      reversible: true,
      target_bars: [1, 4],
    });
    expect(sungNotes(harness).map(({ s }) => s)).toEqual([0, 1, 2, 3]);
    expect(sungNotes(harness).map(({ d }) => d)).toEqual([1, 1, 1, 1]);
    harness.engine.dispose();
  });

  it('restores the recorded timing at strength 0', async () => {
    const harness = createHarness();
    await commitSungTake(harness);
    await harness.invoke('set_quantize', {
      track_id: 'melody',
      grid: '16n',
      strength: 1,
      why: 'Tightening the hum onto the semiquavers.',
    });

    await harness.invoke('set_quantize', {
      track_id: 'melody',
      grid: '16n',
      strength: 0,
      why: 'Your own timing was better; putting it back.',
    });

    const restored = sungNotes(harness);
    expect(restored.map(({ s }) => s)).toEqual([0.06, 1.06, 2.06, 3.06]);
    expect(restored.map(({ d }) => d)).toEqual([0.9, 0.9, 0.9, 0.9]);
    for (const note of restored) {
      expect(note.s).toBe(note.s_raw);
      expect(note.d).toBe(note.d_raw);
    }
    harness.engine.dispose();
  });

  it('writes the same reversible grid and strength onto retained audio', async () => {
    const harness = createHarness();
    const melody = harness.engine.store.getDocument().tracks[0];
    if (melody) melody.clips.push({ id: 'voice-1', take_id: 'voice-1', s: 0 });

    const envelope = (await harness.invoke('set_quantize', {
      track_id: 'melody',
      grid: '8n',
      strength: 0.65,
      swing: 0.2,
      why: 'Line the vocal attacks up with the swung quaver grid.',
    })) as QuantizeEnvelope;

    expect(envelope.changed).toContain('track:melody:clips');
    const updated = harness.engine.store.getDocument().tracks[0];
    expect(updated?.clips[0]).toMatchObject({
      timing_grid: '8n',
      timing_strength: 0.65,
      timing_swing: 0.2,
    });
    expect(updated?.clips_rev).toBe(1);
    harness.engine.dispose();
  });

  it('refuses a track that is not on the song', async () => {
    const harness = createHarness();
    await expect(
      harness.invoke('set_quantize', {
        track_id: 'strings',
        grid: '16n',
        strength: 1,
        why: 'There is no strings track.',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'TRACK_NOT_FOUND',
      message: 'Track "strings" does not exist.',
    });
    expect(harness.engine.store.getDocument().revision).toBe(0);
    harness.engine.dispose();
  });
});
