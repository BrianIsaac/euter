import { describe, expect, it } from 'vitest';
import { createHarness } from '../../helpers/harness.ts';

interface RedoEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: { redone: boolean; edits: number };
}

describe('redo', () => {
  it('puts the undone edit back', async () => {
    const harness = createHarness();
    await harness.invoke('set_tempo', { bpm: 120, why: 'Lifting the feel for the chorus.' });
    await harness.invoke('undo');
    expect(harness.engine.store.getDocument().bpm).toBe(92);

    const envelope = (await harness.invoke('redo')) as RedoEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.summary).toBe('Redid Set tempo to 120 bpm');
    expect(envelope.data).toEqual({ redone: true, edits: 1 });

    const song = harness.engine.store.getDocument();
    expect(song.bpm).toBe(120);
    expect(song.revision).toBe(envelope.revision);
    expect(song.notes_log.at(-1)).toMatchObject({ why: 'Lifting the feel for the chorus.' });
    harness.engine.dispose();
  });

  it('reports that there is nothing to redo on a song nobody has undone', async () => {
    const harness = createHarness();

    const envelope = (await harness.invoke('redo')) as RedoEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.summary).toBe('Nothing to redo.');
    expect(envelope.data).toEqual({ redone: false, edits: 0 });
    expect(envelope.revision).toBe(0);
    harness.engine.dispose();
  });

  it('forgets the undone edit once a new one is made', async () => {
    const harness = createHarness();
    await harness.invoke('set_tempo', { bpm: 120, why: 'Lifting the feel for the chorus.' });
    await harness.invoke('undo');
    await harness.invoke('set_tempo', { bpm: 104, why: 'Somewhere between the two.' });

    const envelope = (await harness.invoke('redo')) as RedoEnvelope;

    expect(envelope.data).toEqual({ redone: false, edits: 0 });
    expect(harness.engine.store.getDocument().bpm).toBe(104);
    harness.engine.dispose();
  });
});
