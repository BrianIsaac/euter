import { describe, expect, it } from 'vitest';
import { SONG_STATE_BUDGET } from '../../../src/song/selectors.ts';
import { loadExampleSong } from '../../../src/song/serialise.ts';
import { getSongState } from '../../../src/webmcp/tools/get_song_state.ts';
import { createHarness, makeTake } from '../../helpers/harness.ts';

describe('get_song_state', () => {
  it('returns the orientation object inside the 1,200-character budget', async () => {
    const harness = createHarness();
    harness.engine.addTake(makeTake('take-1'), 'Kept your hum.', 'agent');
    const envelope = (await harness.invoke('get_song_state')) as {
      ok: true;
      revision: number;
      summary: string;
      data: Record<string, unknown>;
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.summary).toContain('First Light');
    expect(envelope.data.bars).toBe(8);
    expect(envelope.data.key).toMatchObject({ name: 'C major' });
    expect(envelope.data.takes).toEqual([{ id: 'take-1', source: 'mic' }]);
    expect(envelope.data.styles).toEqual(['pop', 'soul', 'lofi']);
    expect(JSON.stringify(envelope.data).length).toBeLessThanOrEqual(SONG_STATE_BUDGET);
    harness.engine.dispose();
  });

  it('reports the transport, the audio lock and running jobs', async () => {
    const harness = createHarness();
    harness.audio.setState('suspended');
    const locked = (await harness.invoke('get_song_state')) as { data: Record<string, unknown> };
    expect(locked.data.audio).toEqual({ state: 'locked', microphone: 'unknown' });

    await harness.engine.activate();
    await harness.engine.play({ from_bar: 2 });
    harness.engine.startExport('wav', 1, 8);
    const running = (await harness.invoke('get_song_state')) as { data: Record<string, unknown> };
    expect(running.data.audio).toMatchObject({ state: 'running' });
    expect(running.data.transport).toMatchObject({ playing: true, position_bar: 2 });
    expect(running.data.jobs).toEqual([expect.objectContaining({ id: 'job-1', kind: 'wav' })]);
    harness.engine.dispose();
  });

  it('is a read that echoes names the person typed, so it is marked untrusted', () => {
    expect(getSongState.kind).toBe('read');
    expect(getSongState.untrustedContent).toBe(true);
  });

  it('stays successful and bounded for a 64-bar song with 24 tracks', async () => {
    const song = loadExampleSong();
    const template = song.tracks[0];
    if (!template) throw new Error('example track missing');
    const templateNote = template.notes[0];
    if (!templateNote) throw new Error('example note missing');
    song.bars = 64;
    song.sections = Array.from({ length: 16 }, (_, index) => ({
      name: `Person section ${index + 1}`,
      bar_from: index * 4 + 1,
      bar_to: index * 4 + 4,
    }));
    song.tracks = Array.from({ length: 24 }, (_, index) => ({
      ...template,
      id: `track-${index + 1}`,
      name: `Person track ${index + 1}`,
      notes: [{ ...templateNote, s: index * 4 }],
    }));
    const harness = createHarness({ engine: { document: song } });
    const envelope = (await harness.invoke('get_song_state')) as {
      ok: boolean;
      revision: number;
      data: { bars: number; truncated?: boolean };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.revision).toBe(0);
    expect(envelope.data.bars).toBe(64);
    expect(JSON.stringify(envelope).length).toBeLessThanOrEqual(1500);
    expect(harness.engine.store.getDocument().revision).toBe(0);
    harness.engine.dispose();
  });
});
