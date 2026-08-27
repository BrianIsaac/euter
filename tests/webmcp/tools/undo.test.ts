import { describe, expect, it } from 'vitest';
import { createHarness } from '../../helpers/harness.ts';

interface UndoEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: { undone: boolean; edits: number };
}

describe('undo', () => {
  it('takes back the last edit the agent made', async () => {
    const harness = createHarness();
    await harness.invoke('set_tempo', { bpm: 120, why: 'Lifting the feel for the chorus.' });
    expect(harness.engine.store.getDocument().bpm).toBe(120);

    const envelope = (await harness.invoke('undo')) as UndoEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.summary).toBe('Undid Set tempo to 120 bpm');
    expect(envelope.data).toEqual({ undone: true, edits: 1 });

    const song = harness.engine.store.getDocument();
    expect(song.bpm).toBe(92);
    expect(song.revision).toBe(envelope.revision);
    expect(song.notes_log).toEqual([]);
    harness.engine.dispose();
  });

  it('takes back an edit the person made, from the same stack', async () => {
    const harness = createHarness();
    harness.engine.store.dispatch({
      type: 'set_key',
      args: { key: 'A minor' },
      source: 'human',
      why: 'It sounded darker than C.',
    });
    expect(harness.engine.store.getDocument().key.name).toBe('A minor');

    const envelope = (await harness.invoke('undo')) as UndoEnvelope;

    expect(envelope.data).toEqual({ undone: true, edits: 1 });
    expect(envelope.summary).toBe('Undid Set key to A minor');
    expect(harness.engine.store.getDocument().key.name).toBe('C major');
    harness.engine.dispose();
  });

  it('reports that there is nothing to undo without moving the song', async () => {
    const harness = createHarness();

    const envelope = (await harness.invoke('undo')) as UndoEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.summary).toBe('Nothing to undo yet.');
    expect(envelope.data).toEqual({ undone: false, edits: 0 });
    expect(envelope.revision).toBe(0);
    expect(harness.engine.store.getDocument().revision).toBe(0);
    harness.engine.dispose();
  });
});
