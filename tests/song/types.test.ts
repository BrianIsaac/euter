import { describe, expect, it } from 'vitest';
import { cloneSong, createEmptySong, type Note, type SongDocument } from '../../src/song/types.ts';

describe('song types', () => {
  it('creates an empty song at revision 0 with the plan shape', () => {
    const song = createEmptySong('Test');
    expect(song.revision).toBe(0);
    expect(song.title).toBe('Test');
    expect(song.time_sig).toEqual([4, 4]);
    expect(song.key).toEqual({ name: 'C major', confidence: 0, alternatives: [] });
    expect(song.tracks).toEqual([]);
    expect(song.takes).toEqual([]);
    expect(song.chords).toEqual([]);
    expect(song.sections).toEqual([]);
    expect(song.notes_log).toEqual([]);
    expect(song.option_sets).toEqual([]);
    expect(song.take_request).toBeNull();
    expect(Object.keys(song).sort()).toEqual(
      [
        'bars',
        'bpm',
        'chords',
        'key',
        'notes_log',
        'option_sets',
        'revision',
        'sections',
        'takes',
        'take_request',
        'time_sig',
        'title',
        'tracks',
      ].sort(),
    );
  });

  it('defaults the title', () => {
    expect(createEmptySong().title).toBe('Untitled');
  });

  it('deep-clones history snapshots', () => {
    const song = createEmptySong();
    const clone = cloneSong(song);
    clone.key.alternatives.push({ name: 'A minor', confidence: 0.5 });
    expect(song.key.alternatives).toEqual([]);
  });

  it('types notes in beats with MIDI pitches and optional raw timing', () => {
    const note: Note = { p: 60, s: 0, d: 1, v: 0.8, s_raw: 0.03, source: 'take' };
    const song: SongDocument = {
      ...createEmptySong(),
      tracks: [
        {
          id: 't1',
          name: 'Melody',
          kind: 'melody',
          instrument: 'piano',
          volume_db: 0,
          pan: 0,
          mute: false,
          solo: false,
          notes_rev: 1,
          notes: [note],
        },
      ],
    };
    expect(song.tracks[0]?.notes[0]?.p).toBe(60);
  });
});
