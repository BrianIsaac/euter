import { describe, expect, it } from 'vitest';
import { createHarness, makeTake } from '../../helpers/harness.ts';

interface CommitEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: {
    take_id: string;
    track_id: string;
    grid: string;
    quantize_strength: number;
    target_bars?: [number, number];
  };
}

const commit = {
  take_id: 'take-1',
  track_id: 'melody',
  quantize_strength: 0.75,
  grid: '16n',
  why: 'Tightening the hum onto the grid without losing its feel.',
};

describe('commit_take', () => {
  it('writes the take onto the track and pins the reason', async () => {
    const harness = createHarness();
    harness.engine.addTake(makeTake('take-1'), 'Kept your hum.', 'human');
    const before = harness.engine.store.getDocument();
    const beforeTrack = before.tracks.find(({ id }) => id === 'melody');
    const envelope = (await harness.invoke('commit_take', commit)) as CommitEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.revision).toBe(before.revision + 1);
    expect(envelope.changed).toContain('tracks');
    expect(envelope.data).toEqual({
      take_id: 'take-1',
      track_id: 'melody',
      grid: '16n',
      quantize_strength: 0.75,
      target_bars: [1, 1],
    });
    expect(envelope.summary).toBe('Committed take-1 to Melody');

    const song = harness.engine.store.getDocument();
    const track = song.tracks.find(({ id }) => id === 'melody');
    expect(track?.notes_rev).toBe((beforeTrack?.notes_rev ?? 0) + 1);
    expect(track?.notes.filter(({ s }) => s < 4).map(({ p }) => p)).toEqual([60, 62, 64, 65]);
    expect(track?.notes.filter(({ s }) => s >= 4)).toEqual(
      beforeTrack?.notes.filter(({ s }) => s >= 4),
    );
    expect(song.notes_log.at(-1)).toMatchObject({
      why: 'Tightening the hum onto the grid without losing its feel.',
      source: 'agent',
      track_id: 'melody',
      bars: [1, 1],
    });
    expect(harness.engine.pendingTake()).toBeNull();
    harness.engine.dispose();
  });

  it('clears the take request the agent had armed for that track', async () => {
    const harness = createHarness();
    harness.engine.addTake(makeTake('take-1'), 'Kept your hum.', 'human');
    await harness.invoke('request_take', {
      track_id: 'melody',
      bar_from: 1,
      bar_to: 4,
      prompt: 'Hum me the first line',
      why: 'You hear the tune better than I do.',
    });
    expect(harness.engine.takeRequest()?.trackId).toBe('melody');

    await expect(harness.invoke('commit_take', commit)).resolves.toMatchObject({ ok: true });
    expect(harness.engine.store.getDocument().take_request).toBeNull();
    expect(harness.engine.takeRequest()).toBeNull();
    harness.engine.dispose();
  });

  it('refuses an unknown take and an unknown track', async () => {
    const harness = createHarness();
    harness.engine.addTake(makeTake('take-1'), 'Kept your hum.', 'human');
    await expect(
      harness.invoke('commit_take', { ...commit, take_id: 'take-9' }),
    ).resolves.toMatchObject({ ok: false, code: 'TAKE_NOT_FOUND', recoverable: true });
    await expect(
      harness.invoke('commit_take', { ...commit, track_id: 'strings' }),
    ).resolves.toMatchObject({ ok: false, code: 'TRACK_NOT_FOUND', recoverable: true });
    expect(harness.engine.store.getDocument().revision).toBe(1);
    harness.engine.dispose();
  });
});
