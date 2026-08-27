import { describe, expect, it } from 'vitest';
import type { TakeData } from '../../../src/webmcp/tools/shared.ts';
import { createHarness, makeTake, type Harness } from '../../helpers/harness.ts';

interface StopEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: TakeData & { placed_on_track: string | null; next: string };
}

/**
 * Arms the recorder on the melody track the way the person's Record button does.
 *
 * @param harness - The harness under test.
 * @returns A promise that settles once the recorder is running.
 */
async function startMelody(harness: Harness): Promise<void> {
  await harness.invoke('start_recording', { count_in_bars: 1, metronome: true });
}

describe('stop_recording', () => {
  it('lands the take in the song, pins the reason and hands back the notes', async () => {
    const harness = createHarness();
    await startMelody(harness);
    const envelope = (await harness.invoke('stop_recording', {
      why: 'Keeping the four bars you just hummed.',
    })) as StopEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.revision).toBe(1);
    expect(envelope.changed).toContain('takes');
    expect(envelope.data).toMatchObject({
      take_id: 'take-1',
      source: 'mic',
      notes_total: 4,
      duration_s: 4,
      median_clarity: 0.82,
      placed_on_track: 'melody',
      next: 'Next: set_key, then suggest_chords or set_chords.',
    });
    expect(envelope.data.notes.map(({ p }) => p)).toEqual([60, 62, 64, 65]);

    const song = harness.engine.store.getDocument();
    expect(song.takes.map(({ id }) => id)).toEqual(['take-1']);
    expect(song.notes_log.at(-1)).toMatchObject({
      revision: 1,
      why: 'Keeping the four bars you just hummed.',
      source: 'agent',
      track_id: null,
    });
    expect(harness.engine.pendingTake()?.id).toBe('take-1');
    expect(harness.recorder.getSnapshot().status).toBe('idle');
    harness.engine.dispose();
  });

  it('offers another take when the recording is noisy', async () => {
    const harness = createHarness();
    harness.recorder.nextTake = { ...makeTake('take-1'), median_clarity: 0.35 };
    await startMelody(harness);
    const envelope = (await harness.invoke('stop_recording', {
      why: 'Keeping what you sang.',
    })) as StopEnvelope;

    expect(envelope.data.next).toBe('The take is noisy; offer another before committing it.');
    harness.engine.dispose();
  });

  it('reports a capture failure and a stop with nothing recording', async () => {
    const harness = createHarness();
    harness.recorder.nextTake = null;
    await startMelody(harness);
    await expect(
      harness.invoke('stop_recording', { why: 'Keeping what you sang.' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'INTERNAL',
      message: 'The recorded audio did not arrive from the worklet.',
    });
    expect(harness.engine.store.getDocument().takes).toEqual([]);

    await expect(
      harness.invoke('stop_recording', { why: 'Nothing is running.' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
      message: 'No take is currently recording.',
    });
    expect(harness.engine.store.getDocument().revision).toBe(0);
    harness.engine.dispose();
  });
});
