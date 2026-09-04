import { describe, expect, it } from 'vitest';
import { createHarness, makeTake } from '../../helpers/harness.ts';
import { encodeTakeAudio } from '../../../src/audio/clips.ts';

function harnessWithVocal() {
  const take = makeTake('voice-1');
  take.audio = encodeTakeAudio(new Float32Array(32_000), 8_000);
  const harness = createHarness();
  const song = harness.engine.store.getDocument();
  song.takes.push(take);
  const melody = song.tracks[0];
  if (melody) {
    melody.clips.push({ id: 'voice-1', take_id: 'voice-1', s: 0 });
    melody.clips_rev += 1;
  }
  return harness;
}

describe('tune_vocal', () => {
  it('writes explicit key-aware strength through the normal revision and why envelope', async () => {
    const harness = harnessWithVocal();

    const envelope = await harness.invoke('tune_vocal', {
      track_id: 'melody',
      strength: 0.35,
      why: 'A gentle correction keeps the original phrasing.',
    });

    expect(envelope).toMatchObject({
      ok: true,
      revision: 1,
      changed: ['tracks', 'track:melody:clips', 'notes_log'],
      summary: 'Tuned Melody to C major at 35%',
      data: {
        track_id: 'melody',
        key: 'C major',
        strength: 0.35,
        clips_updated: 1,
        reversible: true,
        target_bars: [1, 1],
      },
    });
    expect(harness.engine.store.getDocument().tracks[0]?.clips[0]?.tuning_strength).toBe(0.35);
    expect(harness.engine.store.getDocument().notes_log.at(-1)?.why).toBe(
      'A gentle correction keeps the original phrasing.',
    );
    await harness.invoke('undo', {});
    expect(harness.engine.store.getDocument().tracks[0]?.clips[0]?.tuning_strength).toBeUndefined();
    await harness.invoke('redo', {});
    expect(harness.engine.store.getDocument().tracks[0]?.clips[0]?.tuning_strength).toBe(0.35);
    harness.engine.dispose();
  });

  it('restores raw pitch at zero and rejects tracks without retained audio', async () => {
    const harness = harnessWithVocal();
    await harness.invoke('tune_vocal', {
      track_id: 'melody',
      strength: 0.8,
      why: 'A stronger first pass.',
    });
    await expect(
      harness.invoke('tune_vocal', {
        track_id: 'melody',
        strength: 0,
        why: 'Restore the performed pitch.',
      }),
    ).resolves.toMatchObject({ ok: true, data: { strength: 0, reversible: true } });

    await expect(
      harness.invoke('tune_vocal', {
        track_id: 'bass',
        strength: 0.5,
        why: 'There is no vocal here.',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
      message: expect.stringContaining('no retained voice clips'),
    });
    harness.engine.dispose();
  });
});
