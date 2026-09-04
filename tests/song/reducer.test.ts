import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/webmcp/bus.ts';
import { ToolError } from '../../src/webmcp/envelope.ts';
import { createSongReducer } from '../../src/song/reducer.ts';
import { loadExampleSong } from '../../src/song/serialise.ts';
import { createSongStore } from '../../src/song/store.ts';
import { createEmptySong, type SongDocument } from '../../src/song/types.ts';
import { encodeTakeAudio } from '../../src/audio/clips.ts';

const agent = (
  type: string,
  args: Record<string, unknown>,
  why = 'It supports the song.',
): Command => ({
  type,
  args,
  source: 'agent',
  why,
});

function store(song = loadExampleSong(), recordingTrackId: () => string | null = () => null) {
  let id = 1;
  return createSongStore(
    song,
    createSongReducer({
      recordingTrackId,
      idFactory: (prefix) => `${prefix}-${id++}`,
    }),
    { now: () => 100 },
  );
}

describe('song reducer and command bus', () => {
  it('uses the reducer snapshot path for both a new song and the example', () => {
    const songStore = store();
    const emptied = songStore.dispatch({
      type: '__restore_snapshot',
      args: { document: createEmptySong(), summary: 'Started a new song' },
      source: 'human',
    });
    expect(emptied).toMatchObject({
      revision: 1,
      changed: ['song'],
      summary: 'Started a new song',
    });
    expect(songStore.getDocument()).toMatchObject({
      revision: 1,
      title: 'Untitled',
      tracks: [{ id: 'melody', notes: [] }],
    });

    const loaded = songStore.dispatch({
      type: '__restore_snapshot',
      args: { document: loadExampleSong(), summary: 'Loaded the example song' },
      source: 'human',
    });
    expect(loaded).toMatchObject({
      revision: 2,
      changed: ['song'],
      summary: 'Loaded the example song',
    });
    expect(songStore.getDocument()).toMatchObject({ revision: 2, title: 'First Light' });
    expect(songStore.getDocument().tracks.map(({ id }) => id)).toEqual([
      'melody',
      'chords',
      'bass',
      'drums',
    ]);
  });

  it('keeps ping working on the song reducer', () => {
    const songStore = store();
    expect(
      songStore.dispatch({ type: 'ping', args: { message: 'hello' }, source: 'agent' }),
    ).toMatchObject({
      revision: 1,
      summary: 'ping: hello',
    });
    expect(songStore.history.getPast()).toEqual([]);
  });

  it('adds a track, changes its instrument and mix, and sets tempo atomically', () => {
    const songStore = store();
    songStore.dispatch(agent('add_track', { kind: 'bass', instrument: 'sub-bass', name: 'Low' }));
    const id = songStore.getDocument().tracks.at(-1)?.id;
    expect(id).toBe('bass-1');
    songStore.dispatch(agent('set_instrument', { track_id: id, instrument: 'vcsl-strings' }));
    songStore.dispatch(agent('set_mix', { track_id: id, volume_db: -10, pan: -0.1, mute: true }));
    songStore.dispatch(agent('set_tempo', { bpm: 101.5 }));
    expect(songStore.getDocument()).toMatchObject({ bpm: 101.5, revision: 4 });
    expect(songStore.getDocument().tracks.at(-1)).toMatchObject({
      name: 'Low',
      instrument: 'vcsl-strings',
      volume_db: -10,
      pan: -0.1,
      mute: true,
    });
    expect(songStore.getDocument().notes_log).toHaveLength(4);
    expect(() =>
      songStore.dispatch(
        agent('set_instrument', { track_id: id, instrument: 'imaginary-orchestra' }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_ARGUMENT' }));
    expect(songStore.getDocument().revision).toBe(4);
  });

  it('translates set_notes from its starting bar and makes quantisation reversible', () => {
    const songStore = store();
    songStore.dispatch(
      agent('set_notes', {
        track_id: 'melody',
        bar_from: 2,
        notes: [{ p: 61, s: 0.13, d: 0.82, v: 0.7 }],
        replace: true,
      }),
    );
    expect(songStore.getDocument().tracks[0]?.notes.find(({ p }) => p === 61)).toMatchObject({
      s: 4.13,
      d: 0.82,
    });
    songStore.dispatch(
      agent('set_quantize', { track_id: 'melody', grid: '16n', strength: 1, swing: 0 }),
    );
    expect(songStore.getDocument().tracks[0]?.notes.find(({ p }) => p === 61)).toMatchObject({
      s: 4.25,
      d: 0.75,
      s_raw: 4.13,
      d_raw: 0.82,
    });
    songStore.dispatch(agent('set_quantize', { track_id: 'melody', grid: '16n', strength: 0 }));
    expect(songStore.getDocument().tracks[0]?.notes.find(({ p }) => p === 61)).toMatchObject({
      s: 4.13,
      d: 0.82,
    });
  });

  it('keeps swung quantisation inside the fixed song boundary', () => {
    const song = loadExampleSong();
    const melody = song.tracks[0];
    if (!melody) throw new Error('Example song has no melody track.');
    song.tracks[0] = {
      ...melody,
      notes: [{ p: 60, s: 31.9, d: 0.1, v: 0.8, source: 'human' }],
    };
    const songStore = store(song);
    songStore.dispatch(
      agent('set_quantize', { track_id: 'melody', grid: '8n', strength: 1, swing: 0.5 }),
    );
    const note = songStore.getDocument().tracks[0]?.notes[0];
    expect((note?.s ?? 0) + (note?.d ?? 0)).toBeLessThanOrEqual(32);
    expect(note?.s_raw).toBe(31.9);
  });

  it('restores raw timing exactly at quantisation strength zero', () => {
    const song = loadExampleSong();
    const melody = song.tracks[0];
    if (!melody) throw new Error('Example song has no melody track.');
    song.tracks[0] = {
      ...melody,
      notes: [{ p: 60, s: 0.123456, d: 0.654321, v: 0.8, source: 'take' }],
    };
    const songStore = store(song);
    songStore.dispatch(
      agent('set_quantize', { track_id: 'melody', grid: '16n', strength: 0, swing: 0.5 }),
    );
    expect(songStore.getDocument().tracks[0]?.notes[0]).toMatchObject({
      s: 0.123456,
      d: 0.654321,
      s_raw: 0.123456,
      d_raw: 0.654321,
    });
  });

  it('validates every chord before applying and sets a ranked key', () => {
    const songStore = store();
    const before = JSON.stringify(songStore.getDocument());
    expect(() =>
      songStore.dispatch(
        agent('set_chords', {
          chords: [
            { bar: 1, symbol: 'Dm7' },
            { bar: 2, symbol: 'not a chord' },
          ],
        }),
      ),
    ).toThrow(ToolError);
    expect(JSON.stringify(songStore.getDocument())).toBe(before);

    songStore.dispatch(agent('set_chords', { chords: [{ bar: 1, symbol: 'Dm7' }] }));
    songStore.dispatch(agent('set_key', { key: 'D minor' }));
    expect(songStore.getDocument().chords[0]).toEqual({ bar: 1, symbol: 'Dm7' });
    expect(songStore.getDocument().key.name).toBe('D minor');
    expect(songStore.getDocument().key.alternatives.length).toBeGreaterThan(0);
  });

  it('returns stale revision detail and never applies the stale edit', () => {
    const songStore = store();
    songStore.dispatch(agent('set_tempo', { bpm: 100 }));
    let thrown: unknown;
    try {
      songStore.dispatch({
        ...agent('set_tempo', { bpm: 110 }),
        expected_revision: 0,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ToolError);
    expect((thrown as ToolError).code).toBe('STALE_REVISION');
    expect((thrown as Error).message).toContain('revision 1, not 0');
    expect((thrown as Error).message).toContain('Set tempo to 100 bpm');
    expect(songStore.getDocument()).toMatchObject({ revision: 1, bpm: 100 });
  });

  it('locks only the track currently being recorded', () => {
    const songStore = store(loadExampleSong(), () => 'melody');
    expect(() =>
      songStore.dispatch(
        agent('set_notes', { track_id: 'melody', bar_from: 1, notes: [], replace: true }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'RECORDING_IN_PROGRESS' }));
    expect(() =>
      songStore.dispatch(agent('set_mix', { track_id: 'bass', pan: 0.2 })),
    ).not.toThrow();
  });

  it('generates deterministic bass, chord and drum roles', () => {
    const songStore = store();
    for (const [track_id, role] of [
      ['bass', 'bass'],
      ['chords', 'chords'],
      ['drums', 'drums'],
    ] as const) {
      songStore.dispatch(
        agent('generate_part', { track_id, role, style: 'lofi', bar_from: 1, bar_to: 2 }),
      );
    }
    expect(songStore.getDocument().tracks.find(({ id }) => id === 'bass')?.notes[0]).toMatchObject({
      p: 36,
      source: 'agent',
    });
    expect(
      songStore.getDocument().tracks.find(({ id }) => id === 'chords')?.notes.length,
    ).toBeGreaterThan(0);
    expect(
      songStore.getDocument().tracks.find(({ id }) => id === 'drums')?.notes.length,
    ).toBeGreaterThan(0);
  });

  it('extends and repeats notes and chords without sharing note objects', () => {
    const song = loadExampleSong();
    song.bars = 4;
    song.sections = [{ name: 'Loop', bar_from: 1, bar_to: 4 }];
    song.chords = song.chords.slice(0, 4);
    song.tracks = song.tracks.map((track) => ({
      ...track,
      notes: track.notes.filter(({ s }) => s < 16),
    }));
    const songStore = store(song);
    songStore.dispatch(
      agent('arrange', { sections: [{ name: 'Verse', bar_from: 1, bar_to: 4, repeat: true }] }),
    );
    const arranged = songStore.getDocument();
    expect(arranged.bars).toBe(8);
    expect(arranged.sections).toEqual([{ name: 'Verse', bar_from: 1, bar_to: 8 }]);
    expect(arranged.chords.slice(4)).toEqual([
      { bar: 5, symbol: 'C' },
      { bar: 6, symbol: 'F' },
      { bar: 7, symbol: 'Am' },
      { bar: 8, symbol: 'G' },
    ]);
    const first = arranged.tracks[0]?.notes.find(({ s }) => s === 0);
    const copied = arranged.tracks[0]?.notes.find(({ s }) => s === 16);
    expect(copied).toMatchObject({ p: first?.p, source: 'agent' });
    expect(copied).not.toBe(first);
  });

  it('commits a take and clears its matching request', () => {
    const song: SongDocument = {
      ...loadExampleSong(),
      takes: [
        {
          id: 'take-1',
          source: 'mic',
          notes: [{ p: 62, s: 0.12, d: 0.8, v: 0.7, source: 'take' }],
          pitch_track: [],
          duration_s: 1,
          voiced_ratio: 0.9,
          median_clarity: 0.8,
          pitch_range: [62, 62],
          tempo_hint: null,
        },
      ],
      take_request: {
        id: 'request-old',
        track_id: 'melody',
        bar_from: 1,
        bar_to: 1,
        prompt: 'Hum it.',
      },
    };
    const songStore = store(song);
    songStore.dispatch(
      agent('commit_take', {
        take_id: 'take-1',
        track_id: 'melody',
        quantize_strength: 1,
        grid: '8n',
      }),
    );
    expect(songStore.getDocument().tracks[0]?.notes[0]).toMatchObject({
      p: 62,
      s: 0,
      d: 1,
      source: 'take',
    });
    expect(songStore.getDocument().take_request).toBeNull();
  });

  it('commits retained voice to a vocal track and restores the clip through undo and redo', () => {
    const song = loadExampleSong();
    song.tracks.push({
      id: 'vocal',
      name: 'Voice',
      kind: 'vocal',
      instrument: 'recorded-voice',
      volume_db: -3,
      pan: 0,
      mute: false,
      solo: false,
      notes_rev: 0,
      notes: [],
      clips_rev: 0,
      clips: [],
    });
    song.takes = [
      {
        id: 'take-voice',
        source: 'mic',
        target_track_id: 'vocal',
        target_bars: [1, 1],
        notes: [{ p: 60, s: 0.1, d: 0.8, v: 0.8, source: 'take' }],
        pitch_track: [],
        duration_s: 0.25,
        voiced_ratio: 0.8,
        median_clarity: 0.9,
        pitch_range: [60, 60],
        tempo_hint: 92,
        audio: encodeTakeAudio(new Float32Array(2_000).fill(0.2), 8_000, 0.03, 0),
      },
    ];
    const songStore = store(song);

    const committed = songStore.dispatch(
      agent('commit_take', {
        take_id: 'take-voice',
        track_id: 'vocal',
        quantize_strength: 0,
        grid: '16n',
      }),
    );

    expect(committed.changed).toContain('track:vocal:clips');
    expect(songStore.getDocument().tracks.at(-1)).toMatchObject({
      kind: 'vocal',
      clips_rev: 1,
      clips: [{ id: 'take-voice', take_id: 'take-voice', s: 0 }],
    });
    songStore.undo('agent');
    expect(songStore.getDocument().tracks.at(-1)?.clips).toEqual([]);
    songStore.redo('agent');
    expect(songStore.getDocument().tracks.at(-1)?.clips).toEqual([
      { id: 'take-voice', take_id: 'take-voice', s: 0 },
    ]);
  });

  it('registers, chooses and visibly requests teaching options', () => {
    const songStore = store();
    songStore.dispatch(
      agent('propose_options', {
        kind: 'chords',
        options: [
          { label: 'Home', why: 'Resolves clearly.', chords: [{ bar: 1, symbol: 'C' }] },
          { label: 'Lift', why: 'Starts away from home.', chords: [{ bar: 1, symbol: 'F' }] },
        ],
        bar_from: 1,
        bar_to: 4,
      }),
    );
    const optionId = songStore.getDocument().option_sets[0]?.options[1]?.id;
    songStore.dispatch(agent('choose_option', { option_id: optionId }));
    expect(songStore.getDocument().chords[0]).toEqual({ bar: 1, symbol: 'F' });
    expect(songStore.getDocument().option_sets[0]?.chosen_option_id).toBe(optionId);
    songStore.dispatch(
      agent('request_take', {
        track_id: 'bass',
        bar_from: 5,
        bar_to: 8,
        prompt: 'Hum me a bassline for the chorus.',
      }),
    );
    expect(songStore.getDocument().take_request).toMatchObject({
      track_id: 'bass',
      prompt: 'Hum me a bassline for the chorus.',
    });
  });

  it('commits a chosen take reading but keeps the original take unchanged', () => {
    const rawTake = {
      id: 'take-rough',
      source: 'mic' as const,
      target_track_id: 'melody',
      target_bars: [1, 1] as [number, number],
      notes: [
        { p: 60, s: 0.12, d: 0.7, v: 0.8, s_raw: 0.12, d_raw: 0.7, source: 'take' as const },
        { p: 61, s: 0.88, d: 0.2, v: 0.8, s_raw: 0.88, d_raw: 0.2, source: 'take' as const },
        { p: 62, s: 1.1, d: 0.8, v: 0.8, s_raw: 1.1, d_raw: 0.8, source: 'take' as const },
      ],
      pitch_track: [],
      duration_s: 2,
      voiced_ratio: 0.9,
      median_clarity: 0.9,
      pitch_range: [60, 62] as [number, number],
      tempo_hint: 92,
    };
    const song = { ...loadExampleSong(), takes: [rawTake] };
    const songStore = store(song);
    songStore.dispatch(
      agent('propose_options', {
        kind: 'take',
        take_id: rawTake.id,
        track_id: 'melody',
        bar_from: 1,
        bar_to: 1,
        options: [
          {
            label: 'Two clear notes',
            why: 'The short middle segment sounds like drift between two held notes.',
            notes: [
              { p: 60, s: 0.12, d: 0.8 },
              { p: 62, s: 1.1, d: 0.8 },
            ],
          },
          {
            label: 'Three-note turn',
            why: 'The middle pitch could be a deliberate passing note.',
            notes: [
              { p: 60, s: 0.12, d: 0.7 },
              { p: 61, s: 0.88, d: 0.2 },
              { p: 62, s: 1.1, d: 0.8 },
            ],
          },
        ],
      }),
    );
    const set = songStore.getDocument().option_sets[0];
    const readingId = set?.options[0]?.id;
    songStore.dispatch(agent('choose_option', { option_id: readingId }, set?.options[0]?.why));

    const document = songStore.getDocument();
    expect(document.option_sets[0]?.chosen_option_id).toBe(readingId);
    expect(document.tracks[0]?.notes.filter(({ s }) => s < 4).map(({ p }) => p)).toEqual([60, 62]);
    expect(document.tracks[0]?.notes.filter(({ s }) => s < 4)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'agent', s: 0.12, s_raw: 0.12, d_raw: 0.8 }),
      ]),
    );
    expect(document.takes[0]).toEqual(rawTake);
    expect(document.notes_log.at(-1)?.why).toBe(
      'The short middle segment sounds like drift between two held notes.',
    );
  });

  it('replaces the whole advertised range even when the chosen reading is narrower', () => {
    const rawTake = {
      id: 'take-two-bars',
      source: 'mic' as const,
      target_track_id: 'melody',
      target_bars: [1, 2] as [number, number],
      notes: [
        { p: 60, s: 0, d: 1, v: 0.8, s_raw: 0, d_raw: 1, source: 'take' as const },
        { p: 62, s: 5, d: 1, v: 0.8, s_raw: 5, d_raw: 1, source: 'take' as const },
      ],
      pitch_track: [],
      duration_s: 3,
      voiced_ratio: 0.9,
      median_clarity: 0.9,
      pitch_range: [60, 62] as [number, number],
      tempo_hint: 92,
    };
    const songStore = store({ ...loadExampleSong(), takes: [rawTake] });
    songStore.dispatch(
      agent('propose_options', {
        kind: 'take',
        take_id: rawTake.id,
        track_id: 'melody',
        bar_from: 1,
        bar_to: 2,
        options: [
          {
            label: 'One held note',
            why: 'The second segment sounds like breath, not a note.',
            notes: [{ p: 60, s: 0, d: 1 }],
          },
          {
            label: 'Both notes',
            why: 'Both segments are deliberate.',
            notes: [
              { p: 60, s: 0, d: 1 },
              { p: 62, s: 5, d: 1 },
            ],
          },
        ],
      }),
    );
    const narrow = songStore.getDocument().option_sets[0]?.options[0]?.id;
    songStore.dispatch(agent('choose_option', { option_id: narrow }, 'The first reading.'));

    expect(songStore.getDocument().tracks[0]?.notes.filter(({ s }) => s < 8)).toEqual([
      expect.objectContaining({ p: 60, s: 0, source: 'agent' }),
    ]);
  });

  it('refuses to resolve an option set a second time', () => {
    const rawTake = {
      id: 'take-once',
      source: 'mic' as const,
      target_track_id: 'melody',
      target_bars: [1, 1] as [number, number],
      notes: [{ p: 60, s: 0, d: 1, v: 0.8, s_raw: 0, d_raw: 1, source: 'take' as const }],
      pitch_track: [],
      duration_s: 2,
      voiced_ratio: 0.9,
      median_clarity: 0.9,
      pitch_range: [60, 60] as [number, number],
      tempo_hint: 92,
    };
    const songStore = store({ ...loadExampleSong(), takes: [rawTake] });
    songStore.dispatch(
      agent('propose_options', {
        kind: 'take',
        take_id: rawTake.id,
        track_id: 'melody',
        bar_from: 1,
        bar_to: 1,
        options: [
          { label: 'Up', why: 'It climbs.', notes: [{ p: 64, s: 0, d: 1 }] },
          { label: 'Down', why: 'It falls.', notes: [{ p: 57, s: 0, d: 1 }] },
        ],
      }),
    );
    const set = songStore.getDocument().option_sets[0];
    songStore.dispatch(agent('choose_option', { option_id: set?.options[0]?.id }, 'The climb.'));
    const revision = songStore.getDocument().revision;
    const raw = set?.options.find(({ raw_take }) => raw_take)?.id;

    expect(() => songStore.dispatch(agent('choose_option', { option_id: raw }, 'Raw.'))).toThrow(
      ToolError,
    );
    expect(songStore.getDocument().revision).toBe(revision);
    expect(songStore.getDocument().tracks[0]?.notes.filter(({ s }) => s < 4)).toEqual([
      expect.objectContaining({ p: 64, source: 'agent' }),
    ]);
  });

  it('commits the untouched raw take when none of the readings is right', () => {
    const song: SongDocument = {
      ...loadExampleSong(),
      takes: [
        {
          id: 'take-raw',
          source: 'mic',
          target_track_id: 'melody',
          target_bars: [1, 1],
          notes: [
            { p: 60, s: 0.17, d: 0.63, v: 0.7, s_raw: 0.17, d_raw: 0.63, source: 'take' },
            { p: 63, s: 1.21, d: 0.74, v: 0.7, s_raw: 1.21, d_raw: 0.74, source: 'take' },
          ],
          pitch_track: [],
          duration_s: 2,
          voiced_ratio: 0.9,
          median_clarity: 0.9,
          pitch_range: [60, 63],
          tempo_hint: 92,
        },
      ],
    };
    const songStore = store(song);
    songStore.dispatch(
      agent('propose_options', {
        kind: 'take',
        take_id: 'take-raw',
        track_id: 'melody',
        bar_from: 1,
        bar_to: 1,
        options: [
          { label: 'Major shape', why: 'It fits C major.', notes: [{ p: 60, s: 0, d: 1 }] },
          { label: 'Minor colour', why: 'It keeps the blue note.', notes: [{ p: 63, s: 0, d: 1 }] },
        ],
      }),
    );
    const rawOption = songStore
      .getDocument()
      .option_sets[0]?.options.find(({ raw_take }) => raw_take);
    songStore.dispatch(agent('choose_option', { option_id: rawOption?.id }, rawOption?.why));

    expect(songStore.getDocument().tracks[0]?.notes.filter(({ s }) => s < 4)).toEqual([
      expect.objectContaining({ p: 60, s: 0.17, d: 0.63, s_raw: 0.17, d_raw: 0.63 }),
      expect.objectContaining({ p: 63, s: 1.21, d: 0.74, s_raw: 1.21, d_raw: 0.74 }),
    ]);
    expect(rawOption?.label).toBe('None of these — keep what I sang');
    expect(
      songStore
        .getDocument()
        .tracks[0]?.notes.filter(({ s }) => s < 4)
        .every(({ source }) => source === 'take'),
    ).toBe(true);
  });
});
