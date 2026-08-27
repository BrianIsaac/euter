import { describe, expect, it } from 'vitest';
import { createHarness } from '../../helpers/harness.ts';

interface StopEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: { playing: boolean; position_bar: number };
}

const proposal = {
  kind: 'chords',
  bar_from: 1,
  bar_to: 2,
  options: [
    {
      label: 'Lift it',
      why: 'The minor turn opens into the chorus.',
      chords: [
        { bar: 1, symbol: 'Am7' },
        { bar: 2, symbol: 'Fmaj7' },
      ],
    },
    {
      label: 'Stay home',
      why: 'It keeps the calm of your hum.',
      chords: [
        { bar: 1, symbol: 'C' },
        { bar: 2, symbol: 'F' },
      ],
    },
  ],
  why: 'Two ways to harmonise the opening.',
};

describe('stop', () => {
  it('stops the transport, says where it stopped and edits nothing', async () => {
    const harness = createHarness();
    await harness.invoke('play', { from_bar: 5 });

    const envelope = (await harness.invoke('stop')) as StopEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.revision).toBe(0);
    expect(envelope.changed).toEqual([]);
    expect(envelope.summary).toBe('Stopped at bar 5');
    expect(envelope.data).toEqual({ playing: false, position_bar: 5 });
    expect(harness.transport.calls.stop).toBe(1);
    expect(harness.transport.getSnapshot().playing).toBe(false);
    expect(harness.engine.store.getDocument().revision).toBe(0);
    harness.engine.dispose();
  });

  it('drops an option preview back to the live song', async () => {
    const harness = createHarness();
    await harness.invoke('propose_options', proposal);
    await harness.invoke('audition_option', { option_id: 'option-1' });

    expect(harness.engine.playback.getPreview()?.chords[0]?.symbol).toBe('Am7');
    expect(harness.engine.getSnapshot().preview).toMatchObject({
      option_id: 'option-1',
      label: 'Lift it',
    });
    const revision = harness.engine.store.getDocument().revision;

    const envelope = (await harness.invoke('stop')) as StopEnvelope;

    expect(envelope.revision).toBe(revision);
    expect(envelope.data.playing).toBe(false);
    expect(harness.engine.playback.getPreview()).toBeNull();
    expect(harness.engine.getSnapshot().preview).toBeNull();
    expect(harness.engine.playback.getDocument()).toBe(harness.engine.store.getDocument());
    expect(harness.engine.store.getDocument().chords[0]?.symbol).toBe('C');
    harness.engine.dispose();
  });
});
