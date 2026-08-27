import { describe, expect, it } from 'vitest';
import {
  selectChords,
  selectSongState,
  selectTrackNotes,
  selectTrackSummary,
  SONG_STATE_BUDGET,
} from '../../src/song/selectors.ts';
import { loadExampleSong } from '../../src/song/serialise.ts';
import { createEmptySong, type Track } from '../../src/song/types.ts';
import { ToolError } from '../../src/webmcp/envelope.ts';

describe('song selectors', () => {
  it('keeps the orientation response valid and under 1,200 characters', () => {
    const song = loadExampleSong();
    const result = selectSongState(song, {
      instrument_names: Array.from({ length: 100 }, (_, index) => `instrument-${index}`),
      jobs: Array.from({ length: 30 }, (_, index) => ({
        id: `job-${index}`,
        kind: 'render',
        state: 'running',
        progress_pct: index,
      })),
    });
    expect(result.length).toBeLessThanOrEqual(SONG_STATE_BUDGET);
    expect(JSON.parse(result)).toMatchObject({ revision: 0, title: 'First Light', bpm: 92 });
  });

  it('pages notes by bar and returns relative starts', () => {
    const song = loadExampleSong();
    expect(selectTrackNotes(song, 'melody', 2, 2)).toEqual([
      {
        bar: 2,
        notes: [
          { p: 65, s: 0, d: 2, v: 0.78 },
          { p: 64, s: 2, d: 1, v: 0.78 },
          { p: 62, s: 3, d: 1, v: 0.78 },
        ],
      },
    ]);
  });

  it('limits note reads to eight bars and reports missing tracks as data errors', () => {
    const song = { ...loadExampleSong(), bars: 16 };
    expect(() => selectTrackNotes(song, 'melody', 1, 9)).toThrowError(
      expect.objectContaining({ code: 'RESULT_TOO_LARGE' }),
    );
    let thrown: unknown;
    try {
      selectTrackNotes(song, 'missing', 1, 1);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ToolError);
    expect((thrown as ToolError).code).toBe('TRACK_NOT_FOUND');
  });

  it('summarises tracks in one line', () => {
    const track: Track = {
      id: 'lead',
      name: 'Lead',
      kind: 'melody',
      instrument: 'grand-piano',
      volume_db: 0,
      pan: 0,
      mute: false,
      solo: false,
      notes_rev: 1,
      notes: [
        { p: 60, s: 0, d: 1, v: 1, source: 'human' },
        { p: 67, s: 12, d: 1, v: 1, source: 'human' },
      ],
    };
    expect(selectTrackSummary(track)).toBe('lead bars 1-4: melody 60-67 2 notes; grand-piano');
  });

  it('adds Roman numerals in the current key', () => {
    expect(selectChords(loadExampleSong(), 1, 4).map(({ roman }) => roman)).toEqual([
      'I',
      'IV',
      'VIm',
      'V',
    ]);
    expect(() => selectChords(createEmptySong(), 0, 1)).toThrow(ToolError);
  });
});
