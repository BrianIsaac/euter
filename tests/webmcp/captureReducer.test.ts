import { describe, expect, it } from 'vitest';
import { loadExampleSong } from '../../src/song/serialise.ts';
import { createCaptureReducer, isTake } from '../../src/webmcp/captureReducer.ts';
import { ToolError } from '../../src/webmcp/envelope.ts';
import { makeTake } from '../helpers/harness.ts';

const reducer = createCaptureReducer();

describe('capture reducer', () => {
  it('lands a take in the document with its bars and producer note', () => {
    const song = loadExampleSong();
    const take = makeTake('take-a');
    const result = reducer(song, {
      type: 'add_take',
      args: { take },
      source: 'agent',
      why: 'Kept what you hummed so we can build on it.',
    });
    expect(result.document.takes).toHaveLength(1);
    expect(result.document.takes[0]?.id).toBe('take-a');
    expect(result.changed).toEqual(['takes', 'notes_log']);
    expect(result.summary).toContain('take-a');
    expect(result.target_bars).toEqual([1, 1]);
    expect(result.document.notes_log.at(-1)).toMatchObject({
      why: 'Kept what you hummed so we can build on it.',
      track_id: null,
      source: 'agent',
    });
  });

  it('keeps the log untouched when no why is given', () => {
    const song = loadExampleSong();
    const result = reducer(song, {
      type: 'add_take',
      args: { take: makeTake('take-b') },
      source: 'human',
    });
    expect(result.changed).toEqual(['takes']);
    expect(result.document.notes_log).toHaveLength(0);
  });

  it('refuses a malformed take and a duplicate id', () => {
    const song = loadExampleSong();
    expect(() =>
      reducer(song, { type: 'add_take', args: { take: { id: 'x' } }, source: 'agent' }),
    ).toThrow(ToolError);
    const withTake = reducer(song, {
      type: 'add_take',
      args: { take: makeTake('take-c') },
      source: 'agent',
    }).document;
    expect(() =>
      reducer(withTake, { type: 'add_take', args: { take: makeTake('take-c') }, source: 'agent' }),
    ).toThrow(/already in the song/u);
  });

  it('delegates every other command to the song reducer', () => {
    const song = loadExampleSong();
    const result = reducer(song, {
      type: 'set_tempo',
      args: { bpm: 100 },
      source: 'agent',
      why: 'Lifting the tempo a little.',
    });
    expect(result.document.bpm).toBe(100);
  });

  it('recognises the take shapes the capture path produces', () => {
    expect(isTake(makeTake())).toBe(true);
    expect(isTake(null)).toBe(false);
    expect(isTake({ ...makeTake(), source: 'radio' })).toBe(false);
    expect(isTake({ ...makeTake(), tempo_hint: null })).toBe(true);
  });

  it('rejects destination fields the persisted song could not hold', () => {
    expect(isTake({ ...makeTake(), target_track_id: 'melody' })).toBe(true);
    expect(isTake({ ...makeTake(), target_track_id: '' })).toBe(false);
    expect(isTake({ ...makeTake(), target_track_id: '   ' })).toBe(false);
    expect(isTake({ ...makeTake(), target_bars: [1, 4] })).toBe(true);
    expect(isTake({ ...makeTake(), target_bars: [0, 4] })).toBe(false);
    expect(isTake({ ...makeTake(), target_bars: [4, 1] })).toBe(false);
    expect(isTake({ ...makeTake(), target_bars: [1.5, 4] })).toBe(false);
    expect(isTake({ ...makeTake(), target_bars: [1] })).toBe(false);
  });

  it('refuses a take whose destination fields would silently break persistence', () => {
    const song = loadExampleSong();
    expect(() =>
      reducer(song, {
        type: 'add_take',
        args: { take: { ...makeTake('take-bad'), target_track_id: '' } },
        source: 'human',
        why: 'Imported with no track selected.',
      }),
    ).toThrow(ToolError);
    expect(song.takes).toEqual([]);
  });
});
