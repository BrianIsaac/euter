import { describe, expect, it } from 'vitest';
import type { Note, SongDocument, Take } from '../../../src/song/types.ts';
import type { Command, CommandBus } from '../../../src/webmcp/bus.ts';
import { ToolError } from '../../../src/webmcp/envelope.ts';
import {
  boundTakeRead,
  dispatch,
  requireTake,
  takeContext,
  takeData,
  targetBars,
  TAKE_NOTE_FLOOR,
  TAKE_NOTE_LIMIT,
  type TakeData,
} from '../../../src/webmcp/tools/shared.ts';
import type { ToolContext } from '../../../src/webmcp/types.ts';
import { createHarness, makeTake, type Harness } from '../../helpers/harness.ts';

/**
 * Builds a tool context over the real store, recording every command the helpers send.
 *
 * @param harness - The harness whose engine and environment the context wraps.
 * @param commands - The array each dispatched command is pushed onto.
 * @returns The context.
 */
function contextFor(harness: Harness, commands: Command[]): ToolContext {
  const store = harness.engine.store;
  const bus: CommandBus<SongDocument> = {
    dispatch(command) {
      commands.push(command);
      return store.dispatch(command);
    },
    getDocument: () => store.getDocument(),
    getActivities: () => store.getActivities(),
    subscribe: (listener) => store.subscribe(listener),
  };
  return {
    bus,
    engine: harness.engine,
    environment: harness.runtime.environment,
    registry: { statusText: () => 'ready (28)', toolCount: () => 28, callCount: () => 0 },
    signal: new AbortController().signal,
  };
}

/**
 * Builds a take with more notes than one payload may carry and readings that need rounding.
 *
 * @returns The take, starting part-way through the third bar.
 */
function longTake(): Take {
  const notes: Note[] = Array.from({ length: 30 }, (_, index) => ({
    p: 60 + (index % 5),
    s: 9.5 + index * 0.5,
    d: 0.4444,
    v: 0.7777,
    source: 'take',
  }));
  return {
    ...makeTake('take-2', notes),
    duration_s: 12.345_67,
    voiced_ratio: 0.666_66,
    median_clarity: 0.812_34,
    pitch_range: [59.6, 72.4],
    tempo_hint: 91.6,
  };
}

describe('shared tool helpers', () => {
  it('dispatches as the agent with the reason and no expected_revision key when none was given', () => {
    const harness = createHarness();
    const commands: Command[] = [];
    const context = contextFor(harness, commands);

    const result = dispatch(
      context,
      'set_tempo',
      { bpm: 100 },
      { why: 'A little faster under the chorus.', expected_revision: undefined },
    );

    expect(commands).toHaveLength(1);
    const command = commands[0] as Command;
    expect(command).toMatchObject({
      type: 'set_tempo',
      args: { bpm: 100 },
      source: 'agent',
      why: 'A little faster under the chorus.',
    });
    expect(Object.hasOwn(command, 'expected_revision')).toBe(false);
    expect(result.revision).toBe(1);
    expect(harness.engine.store.getActivities().at(-1)).toMatchObject({
      why: 'A little faster under the chorus.',
      source: 'agent',
    });
    expect(targetBars(result)).toEqual({ target_bars: [1, 8] });
    harness.engine.dispose();
  });

  it('passes expected_revision through when the tool was given one, and omits absent bars', () => {
    const harness = createHarness();
    const commands: Command[] = [];
    const context = contextFor(harness, commands);
    dispatch(context, 'set_tempo', { bpm: 100 }, { why: 'A little faster.' });

    let thrown: unknown;
    try {
      dispatch(
        context,
        'set_tempo',
        { bpm: 104 },
        { why: 'Working from an old reading.', expected_revision: 0 },
      );
    } catch (error) {
      thrown = error;
    }

    expect(commands.at(-1)).toMatchObject({ expected_revision: 0 });
    expect(thrown).toBeInstanceOf(ToolError);
    expect((thrown as ToolError).code).toBe('STALE_REVISION');
    expect(harness.engine.store.getDocument().bpm).toBe(100);
    expect(targetBars({ revision: 1, changed: [], summary: 'No bars were touched.' })).toEqual({});
    harness.engine.dispose();
  });

  it('finds a take by id and refuses an unknown one with TAKE_NOT_FOUND', () => {
    const harness = createHarness();
    harness.engine.addTake(makeTake('take-1'), 'Kept your hum.', 'agent');
    const song = harness.engine.store.getDocument();

    expect(requireTake(song, 'take-1').id).toBe('take-1');

    let thrown: unknown;
    try {
      requireTake(song, 'take-9');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ToolError);
    expect(thrown).toMatchObject({
      code: 'TAKE_NOT_FOUND',
      recoverable: true,
      message: 'Take "take-9" does not exist. Read get_song_state for the takes waiting.',
    });
    harness.engine.dispose();
  });

  it('bounds a take to the note limit, rounds the readings and starts from its first bar', () => {
    const take = longTake();
    const data = takeData(take);

    expect(data.notes).toHaveLength(TAKE_NOTE_LIMIT);
    expect(data.notes_total).toBe(30);
    expect(data.notes[0]).toEqual({ p: 60, s: 1.5, d: 0.444, v: 0.778 });
    expect(data.notes[1]).toMatchObject({ s: 2 });
    expect(data).toMatchObject({
      take_id: 'take-2',
      source: 'mic',
      duration_s: 12.346,
      voiced_ratio: 0.667,
      median_clarity: 0.812,
      pitch_range: [60, 72],
      tempo_hint: 92,
    });
    expect(Object.hasOwn(data, 'refining_job_id')).toBe(false);
    expect(takeData({ ...take, refining_job_id: 'job-3' }).refining_job_id).toBe('job-3');
  });

  it('gives the added context ground before the notes get_take always returned', () => {
    const harness = createHarness();
    const take = {
      ...makeTake(
        'take-long',
        Array.from({ length: TAKE_NOTE_LIMIT }, (_, index) => ({
          p: 60,
          s: index * 0.25,
          d: 0.2,
          v: 0.8,
          source: 'take' as const,
        })),
      ),
      target_track_id: 'melody',
      target_bars: [1, 8] as [number, number],
    };
    const song = harness.engine.store.getDocument();
    const full: TakeData = { ...takeData(take, 4), context: takeContext(song, take) };
    const measure = (candidate: TakeData): number => JSON.stringify(candidate).length;

    const bounded = boundTakeRead(full, measure, measure(full) - 1);

    expect(bounded.notes).toHaveLength(TAKE_NOTE_LIMIT);
    expect(bounded.context?.other_tracks.length).toBeLessThan(3);
    expect(bounded.context?.bounded).toBe(true);
    harness.engine.dispose();
  });

  it('never trims a take read below the note floor', () => {
    const harness = createHarness();
    const take = { ...makeTake('take-1'), target_track_id: 'melody' };
    const song = harness.engine.store.getDocument();
    const full: TakeData = { ...takeData(take, 4), context: takeContext(song, take) };

    const bounded = boundTakeRead(full, () => Number.MAX_SAFE_INTEGER, 10);

    expect(bounded.notes.length).toBe(Math.min(TAKE_NOTE_FLOOR, full.notes.length));
    expect(bounded.notes_total).toBe(full.notes_total);
    expect(bounded.context).toMatchObject({ sections: [], chords: [], other_tracks: [] });
    harness.engine.dispose();
  });

  it('keeps a silent requested take in the bars the person was asked to perform', () => {
    const harness = createHarness();
    const take = {
      ...makeTake('take-silent', []),
      target_track_id: 'melody',
      target_bars: [5, 8] as [number, number],
    };

    expect(takeContext(harness.engine.store.getDocument(), take)).toMatchObject({
      target_bars: [5, 8],
      target_track_id: 'melody',
      sections: [{ name: 'Chorus', bar_from: 5, bar_to: 8 }],
      chords: [
        { bar: 5, symbol: 'C' },
        { bar: 6, symbol: 'F' },
        { bar: 7, symbol: 'Dm' },
        { bar: 8, symbol: 'G' },
      ],
    });
    harness.engine.dispose();
  });
});
