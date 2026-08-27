import { describe, expect, it } from 'vitest';
import type { Note, Track } from '../../../src/song/types.ts';
import { createHarness } from '../../helpers/harness.ts';

interface ArrangeEnvelope {
  ok: true;
  revision: number;
  changed: string[];
  summary: string;
  data: {
    bars: number;
    sections: { name: string; bar_from: number; bar_to: number }[];
    target_bars: [number, number];
  };
}

function track(tracks: readonly Track[], id: string): Track {
  const found = tracks.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`The example song has no "${id}" track.`);
  return found;
}

function shifted(notes: readonly Note[], beats: number): Note[] {
  return notes.map((note) => ({ ...note, s: note.s + beats, source: 'agent' as const }));
}

describe('arrange', () => {
  it('repeats a section, copies its notes and chords on and extends the song', async () => {
    const harness = createHarness();
    const verseMelody = [...track(harness.engine.store.getDocument().tracks, 'melody').notes];

    const envelope = (await harness.invoke('arrange', {
      sections: [
        { name: 'Verse', bar_from: 1, bar_to: 4, repeat: true },
        { name: 'Chorus', bar_from: 9, bar_to: 12 },
      ],
      why: 'Repeating the verse and leaving four bars for a chorus that lifts.',
    })) as ArrangeEnvelope;

    expect(envelope.ok).toBe(true);
    expect(envelope.revision).toBe(1);
    expect(envelope.summary).toBe('Arranged 2 sections across 12 bars');
    expect(envelope.data).toEqual({
      bars: 12,
      sections: [
        { name: 'Verse', bar_from: 1, bar_to: 8 },
        { name: 'Chorus', bar_from: 9, bar_to: 12 },
      ],
      target_bars: [1, 12],
    });

    const song = harness.engine.store.getDocument();
    expect(song.bars).toBe(12);
    expect(song.sections).toEqual(envelope.data.sections);

    const melody = track(song.tracks, 'melody');
    expect(melody.notes).toHaveLength(verseMelody.length * 2);
    expect(melody.notes.filter(({ s }) => s >= 16)).toEqual(shifted(verseMelody, 16));

    expect(song.chords.map(({ symbol }) => symbol)).toEqual([
      'C',
      'F',
      'Am',
      'G',
      'C',
      'F',
      'Am',
      'G',
    ]);
    expect(song.notes_log.at(-1)).toMatchObject({
      why: 'Repeating the verse and leaving four bars for a chorus that lifts.',
      source: 'agent',
      bars: [1, 12],
    });
    harness.engine.dispose();
  });

  it('appends one copy for each repeat asked for', async () => {
    const harness = createHarness();
    const verseMelody = [...track(harness.engine.store.getDocument().tracks, 'melody').notes];

    const envelope = (await harness.invoke('arrange', {
      sections: [{ name: 'Verse', bar_from: 1, bar_to: 4, repeat: 2 }],
      why: 'Three passes of the verse to sing over.',
    })) as ArrangeEnvelope;

    expect(envelope.data.bars).toBe(12);
    expect(envelope.data.sections).toEqual([{ name: 'Verse', bar_from: 1, bar_to: 12 }]);

    const song = harness.engine.store.getDocument();
    const melody = track(song.tracks, 'melody');
    expect(melody.notes).toHaveLength(verseMelody.length * 3);
    expect(melody.notes.filter(({ s }) => s >= 32)).toEqual(shifted(verseMelody, 32));
    expect(song.chords.filter(({ bar }) => bar > 8).map(({ symbol }) => symbol)).toEqual([
      'C',
      'F',
      'Am',
      'G',
    ]);
    harness.engine.dispose();
  });

  it('refuses an inverted range and sections that overlap once they are repeated', async () => {
    const harness = createHarness();

    await expect(
      harness.invoke('arrange', {
        sections: [{ name: 'Verse', bar_from: 4, bar_to: 1 }],
        why: 'Inverted range.',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
      message: expect.stringContaining('inverted range'),
    });

    await expect(
      harness.invoke('arrange', {
        sections: [
          { name: 'Verse', bar_from: 1, bar_to: 4 },
          { name: 'Chorus', bar_from: 3, bar_to: 6 },
        ],
        why: 'These two share bars three and four.',
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
      message: 'Expanded sections must not overlap.',
    });

    await expect(
      harness.invoke('arrange', {
        sections: [
          { name: 'Verse', bar_from: 1, bar_to: 4, repeat: true },
          { name: 'Chorus', bar_from: 5, bar_to: 8 },
        ],
        why: 'The repeat would run over the chorus.',
      }),
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });

    const song = harness.engine.store.getDocument();
    expect(song.revision).toBe(0);
    expect(song.bars).toBe(8);
    expect(song.sections).toEqual([
      { name: 'Verse', bar_from: 1, bar_to: 4 },
      { name: 'Chorus', bar_from: 5, bar_to: 8 },
    ]);
    harness.engine.dispose();
  });
});
