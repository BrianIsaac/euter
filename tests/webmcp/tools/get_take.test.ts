import { describe, expect, it } from 'vitest';
import type { TakeData } from '../../../src/webmcp/tools/shared.ts';
import { createHarness, makeTake } from '../../helpers/harness.ts';

interface TakeEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: TakeData;
}

describe('get_take', () => {
  it('returns the notes and the quality readings, and points at commit_take', async () => {
    const harness = createHarness();
    harness.engine.addTake(makeTake('take-1'), 'Kept your hum.', 'agent');
    const envelope = (await harness.invoke('get_take', { take_id: 'take-1' })) as TakeEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.changed).toEqual([]);
    expect(envelope.data).toEqual({
      take_id: 'take-1',
      source: 'mic',
      notes: [
        { p: 60, s: 0, d: 0.9, v: 0.8 },
        { p: 62, s: 1, d: 0.9, v: 0.8 },
        { p: 64, s: 2, d: 0.9, v: 0.8 },
        { p: 65, s: 3, d: 0.9, v: 0.8 },
      ],
      notes_total: 4,
      duration_s: 4,
      voiced_ratio: 0.8,
      median_clarity: 0.82,
      pitch_range: [60, 65],
      tempo_hint: 92,
    });
    expect(envelope.summary).toBe('Take take-1: 4 notes, 4s, clarity 0.82. Next: commit_take.');
    harness.engine.dispose();
  });

  it('reports onsets relative to the bar the take starts in', async () => {
    const harness = createHarness();
    const late = makeTake('take-1', [
      { p: 67, s: 8, d: 1, v: 0.7, s_raw: 8.05, d_raw: 1, source: 'take' },
      { p: 69, s: 9.5, d: 0.5, v: 0.7, s_raw: 9.55, d_raw: 0.5, source: 'take' },
    ]);
    harness.engine.addTake(late, 'Kept the third bar.', 'human');
    const envelope = (await harness.invoke('get_take', { take_id: 'take-1' })) as TakeEnvelope;

    expect(envelope.data.notes.map(({ s }) => s)).toEqual([0, 1.5]);
    expect(envelope.data.notes_total).toBe(2);
    harness.engine.dispose();
  });

  it('asks for another take when the clarity is low', async () => {
    const harness = createHarness();
    harness.engine.addTake(
      { ...makeTake('take-1'), median_clarity: 0.41 },
      'Kept the noisy one for now.',
      'agent',
    );
    const envelope = (await harness.invoke('get_take', { take_id: 'take-1' })) as TakeEnvelope;

    expect(envelope.data.median_clarity).toBe(0.41);
    expect(envelope.summary).toContain('The take is noisy; ask for another.');
    expect(envelope.summary).not.toContain('commit_take');
    harness.engine.dispose();
  });

  it('refuses a take that is not in the song', async () => {
    const harness = createHarness();
    await expect(harness.invoke('get_take', { take_id: 'take-9' })).resolves.toMatchObject({
      ok: false,
      code: 'TAKE_NOT_FOUND',
      recoverable: true,
    });
    harness.engine.dispose();
  });
});
