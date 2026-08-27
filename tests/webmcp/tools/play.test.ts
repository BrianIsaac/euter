import { describe, expect, it } from 'vitest';
import { createHarness } from '../../helpers/harness.ts';

interface PlayEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: {
    playing: boolean;
    from_bar: number;
    loop?: { bar_from: number; bar_to: number };
    audio: string;
  };
}

describe('play', () => {
  it('starts the transport from the bar it is given and edits nothing', async () => {
    const harness = createHarness();

    const envelope = (await harness.invoke('play', { from_bar: 3 })) as PlayEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.revision).toBe(0);
    expect(envelope.changed).toEqual([]);
    expect(envelope.summary).toBe('Playing from bar 3');
    expect(envelope.data).toEqual({ playing: true, from_bar: 3, audio: 'running' });
    expect(harness.transport.calls.play).toEqual([{ from_bar: 3 }]);
    expect(harness.transport.getSnapshot()).toMatchObject({ playing: true, position_bar: 3 });
    expect(harness.engine.store.getDocument().revision).toBe(0);
    harness.engine.dispose();
  });

  it('loops the range it is given', async () => {
    const harness = createHarness();

    const envelope = (await harness.invoke('play', {
      from_bar: 1,
      loop: { bar_from: 1, bar_to: 4 },
    })) as PlayEnvelope;

    expect(envelope.summary).toBe('Looping bars 1-4');
    expect(envelope.data).toEqual({
      playing: true,
      from_bar: 1,
      loop: { bar_from: 1, bar_to: 4 },
      audio: 'running',
    });
    expect(harness.transport.calls.play).toEqual([
      { from_bar: 1, loop: { bar_from: 1, bar_to: 4 } },
    ]);
    expect(harness.transport.getSnapshot().loop).toEqual({ bar_from: 1, bar_to: 4 });
    harness.engine.dispose();
  });

  it('refuses while the audio is locked and refuses a bar past the last one', async () => {
    const harness = createHarness();
    harness.audio.setState('uninitialised');

    await expect(harness.invoke('play', { from_bar: 1 })).resolves.toMatchObject({
      ok: false,
      code: 'AUDIO_LOCKED',
      recoverable: true,
    });
    expect(harness.transport.calls.play).toEqual([]);

    harness.audio.setState('running');
    await expect(harness.invoke('play', { from_bar: 9 })).resolves.toMatchObject({
      ok: false,
      code: 'OUT_OF_RANGE',
    });
    expect(harness.transport.calls.play).toEqual([]);
    expect(harness.transport.getSnapshot().playing).toBe(false);
    harness.engine.dispose();
  });
});
