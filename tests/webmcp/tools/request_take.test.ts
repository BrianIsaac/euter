import { describe, expect, it } from 'vitest';
import { createHarness } from '../../helpers/harness.ts';

interface RequestEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: {
    request_id: string | null;
    track_id: string;
    prompt: string;
    next: string;
    target_bars: [number, number];
  };
}

describe('request_take', () => {
  it('arms the request on the song and hands the prompt back with its bars', async () => {
    const harness = createHarness();
    const envelope = (await harness.invoke('request_take', {
      track_id: 'bass',
      bar_from: 1,
      bar_to: 4,
      prompt: 'Hum me a bassline for these four bars',
      why: 'You know how the low line should move better than I do.',
    })) as RequestEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.revision).toBe(1);
    expect(envelope.summary).toBe('Requested a take for bars 1-4');
    expect(envelope.data).toMatchObject({
      request_id: 'request-1',
      track_id: 'bass',
      prompt: 'Hum me a bassline for these four bars',
      target_bars: [1, 4],
    });
    expect(envelope.changed).toContain('take_request');

    const song = harness.engine.store.getDocument();
    expect(song.take_request).toEqual({
      id: 'request-1',
      track_id: 'bass',
      bar_from: 1,
      bar_to: 4,
      prompt: 'Hum me a bassline for these four bars',
    });
    expect(song.notes_log.at(-1)).toMatchObject({
      why: 'You know how the low line should move better than I do.',
      bars: [1, 4],
      track_id: 'bass',
      source: 'agent',
    });
    harness.engine.dispose();
  });

  it('refuses a track that is not on the song', async () => {
    const harness = createHarness();
    await expect(
      harness.invoke('request_take', {
        track_id: 'horns',
        bar_from: 1,
        bar_to: 2,
        prompt: 'Sing the horn line',
        why: 'There is no horns track.',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'TRACK_NOT_FOUND',
      message: 'Track "horns" does not exist.',
    });
    expect(harness.engine.store.getDocument().take_request).toBeNull();
    harness.engine.dispose();
  });

  it('refuses bars past the end of the song', async () => {
    const harness = createHarness();
    await expect(
      harness.invoke('request_take', {
        track_id: 'melody',
        bar_from: 7,
        bar_to: 12,
        prompt: 'Sing the last four bars',
        why: 'Those bars do not exist yet.',
      }),
    ).resolves.toMatchObject({ ok: false, code: 'OUT_OF_RANGE', message: 'The song has 8 bars.' });
    expect(harness.engine.store.getDocument().take_request).toBeNull();
    expect(harness.engine.store.getDocument().revision).toBe(0);
    harness.engine.dispose();
  });
});
