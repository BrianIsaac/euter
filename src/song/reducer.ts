/** Atomic song reducer for every document-mutating write (plan Architecture item 2). */
import type { Command, Reducer, ReducerResult } from '../webmcp/bus.ts';
import { ToolError } from '../webmcp/envelope.ts';
import { isKnownInstrument } from '../audio/instruments.ts';
import { isValidChord } from '../theory/chords.ts';
import { generateBass } from '../theory/generate/bass.ts';
import { generateChords } from '../theory/generate/chords.ts';
import { generateDrums } from '../theory/generate/drums.ts';
import { detectKey, keyFit, parseKeyName } from '../theory/key.ts';
import { quantizeNotes } from '../theory/quantise.ts';
import { parseSongCommand, type SongCommand } from './commands.ts';
import {
  cloneSong,
  type Note,
  type SongDocument,
  type Take,
  type TeachingOption,
  type Track,
  type TrackKind,
} from './types.ts';

export interface SongReducerOptions {
  /** Transient recording lock owned by the capture engine, not persisted in the song. */
  recordingTrackId?: () => string | null;
  /** Deterministic id source; tests and the UI may supply one. */
  idFactory?: (prefix: string) => string;
}

const MIX_DEFAULTS: Record<TrackKind, Pick<Track, 'volume_db' | 'pan'>> = {
  melody: { volume_db: -3, pan: 0 },
  chords: { volume_db: -9, pan: 0.12 },
  bass: { volume_db: -7, pan: 0 },
  drums: { volume_db: -8, pan: 0 },
};

/** Default reducer for Lane C's generic `createCommandBus`. */
export const songReducer = createSongReducer();

/** Creates a reducer with capture and id boundaries injected. */
export function createSongReducer(options: SongReducerOptions = {}): Reducer<SongDocument> {
  let nextId = 1;
  const idFactory = options.idFactory ?? ((prefix: string) => `${prefix}-${nextId++}`);
  const recordingTrackId = options.recordingTrackId ?? (() => null);

  return (document, genericCommand) => {
    if (genericCommand.type === '__restore_snapshot') {
      return restoreSnapshot(document, genericCommand);
    }
    const command = parseSongCommand(genericCommand);
    if (command.type === 'ping') {
      return {
        document,
        changed: ['revision'],
        summary: `ping: ${command.args.message}`,
      };
    }

    const lockedTrack = recordingTrackId();
    const touchedTrack = trackTouchedBy(command, document);
    if (lockedTrack && touchedTrack === lockedTrack) {
      throw new ToolError(
        'RECORDING_IN_PROGRESS',
        `Track "${lockedTrack}" is being recorded. Stop the recording before editing it.`,
        true,
      );
    }

    switch (command.type) {
      case 'set_notes':
        return setNotes(document, command);
      case 'set_chords':
        return setChords(document, command);
      case 'set_key':
        return setKey(document, command);
      case 'set_tempo':
        return finish(
          document,
          command,
          { bpm: command.args.bpm },
          ['bpm'],
          `Set tempo to ${round(command.args.bpm)} bpm`,
          [1, document.bars],
          null,
        );
      case 'set_quantize':
        return setQuantize(document, command);
      case 'add_track':
        return addTrack(document, command, idFactory);
      case 'set_instrument':
        requireInstrument(command.args.instrument);
        return updateTrack(
          document,
          command,
          (track) => ({
            ...track,
            instrument: command.args.instrument,
          }),
          `Set ${trackName(document, command.args.track_id)} to ${command.args.instrument}`,
          ['tracks', `track:${command.args.track_id}:instrument`],
        );
      case 'set_mix':
        return setMix(document, command);
      case 'generate_part':
        return generatePart(document, command);
      case 'arrange':
        return arrange(document, command);
      case 'commit_take':
        return commitTake(document, command);
      case 'propose_options':
        return proposeOptions(document, command, idFactory);
      case 'choose_option':
        return chooseOption(document, command);
      case 'request_take':
        return requestTake(document, command, idFactory);
    }
  };
}

function setNotes(
  document: SongDocument,
  command: Extract<SongCommand, { type: 'set_notes' }>,
): ReducerResult<SongDocument> {
  const track = requireTrack(document, command.args.track_id);
  const beatsPerBar = document.time_sig[0];
  const maximumEnd = Math.max(0, ...command.args.notes.map(({ s, d }) => s + d));
  const barCount = Math.max(1, Math.ceil(maximumEnd / beatsPerBar));
  if (barCount > 8) {
    throw new ToolError('OUT_OF_RANGE', 'set_notes accepts at most eight bars per call.', true);
  }
  const barTo = command.args.bar_from + barCount - 1;
  validateBarRange(document, command.args.bar_from, barTo);
  const start = (command.args.bar_from - 1) * beatsPerBar;
  const end = start + barCount * beatsPerBar;
  const notes: Note[] = command.args.notes.map(({ p, s, d, v }) => ({
    p,
    s: start + s,
    d,
    v: v ?? 0.8,
    source: command.source,
  }));
  const updated: Track = {
    ...track,
    notes_rev: track.notes_rev + 1,
    notes: [...track.notes.filter((note) => note.s < start || note.s >= end), ...notes].sort(
      noteOrder,
    ),
  };
  return finish(
    document,
    command,
    { tracks: replaceTrack(document.tracks, updated) },
    ['tracks', `track:${track.id}:notes`],
    `Set ${notes.length} notes in bars ${command.args.bar_from}-${barTo} of ${track.name}`,
    [command.args.bar_from, barTo],
    track.id,
  );
}

function setChords(
  document: SongDocument,
  command: Extract<SongCommand, { type: 'set_chords' }>,
): ReducerResult<SongDocument> {
  const bars = command.args.chords.map(({ bar }) => bar);
  if (new Set(bars).size !== bars.length) {
    throw new ToolError('INVALID_ARGUMENT', 'Give at most one chord for each bar.', true);
  }
  for (const chord of command.args.chords) {
    validateBarRange(document, chord.bar, chord.bar);
    if (!isValidChord(chord.symbol)) {
      throw new ToolError('INVALID_ARGUMENT', `Chord "${chord.symbol}" is not recognised.`, true);
    }
  }
  const replacements = new Map(command.args.chords.map((chord) => [chord.bar, chord]));
  const chords = [
    ...document.chords.filter(({ bar }) => !replacements.has(bar)),
    ...command.args.chords,
  ].sort((left, right) => left.bar - right.bar);
  const range: [number, number] = [Math.min(...bars), Math.max(...bars)];
  return finish(
    document,
    command,
    { chords },
    ['chords'],
    `Set ${command.args.chords.length} chord${command.args.chords.length === 1 ? '' : 's'} in bars ${range[0]}-${range[1]}`,
    range,
    null,
  );
}

function setKey(
  document: SongDocument,
  command: Extract<SongCommand, { type: 'set_key' }>,
): ReducerResult<SongDocument> {
  const parsed = parseKeyName(command.args.key);
  if (!parsed) {
    throw new ToolError('INVALID_ARGUMENT', 'Use a key such as "C major" or "A minor".', true);
  }
  const melody = document.tracks
    .filter(({ kind }) => kind === 'melody')
    .flatMap(({ notes }) => notes);
  const name = `${parsed.tonic} ${parsed.mode}`;
  const detected = detectKey(melody);
  const alternatives =
    melody.length === 0
      ? []
      : [
          ...(detected.name === name
            ? []
            : [{ name: detected.name, confidence: detected.confidence }]),
          ...detected.alternatives.filter((alternative) => alternative.name !== name),
        ].slice(0, 3);
  return finish(
    document,
    command,
    { key: { name, confidence: keyFit(melody, name), alternatives } },
    ['key'],
    `Set key to ${name}`,
    [1, document.bars],
    null,
  );
}

function setQuantize(
  document: SongDocument,
  command: Extract<SongCommand, { type: 'set_quantize' }>,
): ReducerResult<SongDocument> {
  const track = requireTrack(document, command.args.track_id);
  const notes = quantizeNotes(
    track.notes,
    command.args.grid,
    command.args.strength,
    command.args.swing ?? 0,
    document.bars * document.time_sig[0],
  );
  const bars = noteRange(notes, document.time_sig[0], document.bars);
  const updated = { ...track, notes, notes_rev: track.notes_rev + 1 };
  return finish(
    document,
    command,
    { tracks: replaceTrack(document.tracks, updated) },
    ['tracks', `track:${track.id}:notes`],
    `Quantised ${track.name} to ${command.args.grid} at ${round(command.args.strength * 100)}%`,
    bars,
    track.id,
  );
}

function addTrack(
  document: SongDocument,
  command: Extract<SongCommand, { type: 'add_track' }>,
  idFactory: (prefix: string) => string,
): ReducerResult<SongDocument> {
  requireInstrument(command.args.instrument);
  const id = uniqueId(document, command.args.kind, idFactory);
  const mix = MIX_DEFAULTS[command.args.kind];
  const track: Track = {
    id,
    name: command.args.name ?? titleCase(command.args.kind),
    kind: command.args.kind,
    instrument: command.args.instrument,
    ...mix,
    mute: false,
    solo: false,
    notes_rev: 0,
    notes: [],
  };
  return finish(
    document,
    command,
    { tracks: [...document.tracks, track] },
    ['tracks', `track:${id}`],
    `Added ${track.name} with ${track.instrument}`,
    [1, document.bars],
    id,
  );
}

function setMix(
  document: SongDocument,
  command: Extract<SongCommand, { type: 'set_mix' }>,
): ReducerResult<SongDocument> {
  const fields = ['volume_db', 'pan', 'mute', 'solo'] as const;
  return updateTrack(
    document,
    command,
    (track) => {
      const updated = { ...track };
      for (const field of fields) {
        const value = command.args[field];
        if (value !== undefined) Object.assign(updated, { [field]: value });
      }
      return updated;
    },
    `Updated the mix for ${trackName(document, command.args.track_id)}`,
    ['tracks', `track:${command.args.track_id}:mix`],
  );
}

function generatePart(
  document: SongDocument,
  command: Extract<SongCommand, { type: 'generate_part' }>,
): ReducerResult<SongDocument> {
  validateBarRange(document, command.args.bar_from, command.args.bar_to);
  const track = requireTrack(document, command.args.track_id);
  if (track.kind !== command.args.role) {
    throw new ToolError(
      'INVALID_ARGUMENT',
      `Track "${track.id}" is ${track.kind}; generate the ${command.args.role} role on a matching track.`,
      true,
    );
  }
  if (document.chords.length === 0 && command.args.role !== 'drums') {
    throw new ToolError('INVALID_ARGUMENT', 'Set chords before generating this part.', true);
  }
  const { role, style, bar_from: barFrom, bar_to: barTo } = command.args;
  const notes =
    role === 'bass'
      ? generateBass(document.chords, document.key.name, style, barFrom, barTo)
      : role === 'chords'
        ? generateChords(document.chords, document.key.name, style, barFrom, barTo)
        : generateDrums(style, barFrom, barTo);
  const start = (barFrom - 1) * document.time_sig[0];
  const end = barTo * document.time_sig[0];
  const updated = {
    ...track,
    notes_rev: track.notes_rev + 1,
    notes: [...track.notes.filter((note) => note.s < start || note.s >= end), ...notes].sort(
      noteOrder,
    ),
  };
  return finish(
    document,
    command,
    { tracks: replaceTrack(document.tracks, updated) },
    ['tracks', `track:${track.id}:notes`],
    `Generated ${style} ${role} in bars ${barFrom}-${barTo}`,
    [barFrom, barTo],
    track.id,
  );
}

function arrange(
  document: SongDocument,
  command: Extract<SongCommand, { type: 'arrange' }>,
): ReducerResult<SongDocument> {
  const expanded = command.args.sections.map((section) => {
    if (section.bar_to < section.bar_from) {
      throw new ToolError(
        'INVALID_ARGUMENT',
        `Section "${section.name}" has an inverted range.`,
        true,
      );
    }
    const copies =
      section.repeat === true ? 1 : typeof section.repeat === 'number' ? section.repeat : 0;
    if (copies > 0 && section.bar_to > document.bars) {
      throw new ToolError(
        'OUT_OF_RANGE',
        `Cannot repeat beyond the current ${document.bars} bars.`,
        true,
      );
    }
    const length = section.bar_to - section.bar_from + 1;
    return {
      section: {
        name: section.name,
        bar_from: section.bar_from,
        bar_to: section.bar_to + copies * length,
      },
      source_from: section.bar_from,
      source_to: section.bar_to,
      copies,
      length,
    };
  });
  const sections = expanded
    .map(({ section }) => section)
    .sort((left, right) => left.bar_from - right.bar_from);
  for (let index = 1; index < sections.length; index += 1) {
    if ((sections[index]?.bar_from ?? 0) <= (sections[index - 1]?.bar_to ?? 0)) {
      throw new ToolError('INVALID_ARGUMENT', 'Expanded sections must not overlap.', true);
    }
  }
  let tracks = document.tracks.map((track) => ({ ...track, notes: [...track.notes] }));
  let chords = [...document.chords];
  for (const item of expanded) {
    for (let copy = 1; copy <= item.copies; copy += 1) {
      const shiftBars = item.length * copy;
      const targetFrom = item.source_from + shiftBars;
      const targetTo = item.source_to + shiftBars;
      const beatShift = shiftBars * document.time_sig[0];
      const sourceStart = (item.source_from - 1) * document.time_sig[0];
      const sourceEnd = item.source_to * document.time_sig[0];
      const targetStart = (targetFrom - 1) * document.time_sig[0];
      const targetEnd = targetTo * document.time_sig[0];
      tracks = tracks.map((track) => {
        const copied = track.notes
          .filter((note) => note.s >= sourceStart && note.s < sourceEnd)
          .map((note) => ({ ...note, s: note.s + beatShift, source: command.source }));
        return copied.length === 0
          ? track
          : {
              ...track,
              notes_rev: track.notes_rev + 1,
              notes: [
                ...track.notes.filter((note) => note.s < targetStart || note.s >= targetEnd),
                ...copied,
              ].sort(noteOrder),
            };
      });
      const copiedChords = document.chords
        .filter(({ bar }) => bar >= item.source_from && bar <= item.source_to)
        .map((chord) => ({ ...chord, bar: chord.bar + shiftBars }));
      const copiedBars = new Set(copiedChords.map(({ bar }) => bar));
      chords = [...chords.filter(({ bar }) => !copiedBars.has(bar)), ...copiedChords].sort(
        (left, right) => left.bar - right.bar,
      );
    }
  }
  const bars = Math.max(document.bars, ...sections.map(({ bar_to }) => bar_to));
  return finish(
    document,
    command,
    { sections, bars, tracks, chords },
    ['sections', 'bars', 'tracks', 'chords'],
    `Arranged ${sections.length} section${sections.length === 1 ? '' : 's'} across ${bars} bars`,
    [Math.min(...sections.map(({ bar_from }) => bar_from)), bars],
    null,
  );
}

function commitTake(
  document: SongDocument,
  command: Extract<SongCommand, { type: 'commit_take' }>,
): ReducerResult<SongDocument> {
  const take = document.takes.find(({ id }) => id === command.args.take_id);
  if (!take) {
    throw new ToolError('TAKE_NOT_FOUND', `Take "${command.args.take_id}" does not exist.`, true);
  }
  const committed = commitTakeToTrack(
    document,
    take,
    command.args.track_id,
    command.args.grid,
    command.args.quantize_strength,
  );
  return finish(
    document,
    command,
    { tracks: committed.tracks, take_request: committed.take_request },
    ['tracks', `track:${committed.track.id}:notes`, 'take_request'],
    `Committed ${take.id} to ${committed.track.name}`,
    committed.range,
    committed.track.id,
  );
}

/** Writes either the raw take or a chosen reading through the reversible take-commit path. */
function commitTakeToTrack(
  document: SongDocument,
  take: Take,
  trackId: string,
  grid: '8n' | '16n',
  strength: number,
): {
  tracks: Track[];
  take_request: SongDocument['take_request'];
  range: [number, number];
  track: Track;
} {
  const track = requireTrack(document, trackId);
  const maximumBeat = document.bars * document.time_sig[0];
  if (
    take.notes.some((note) => note.s < 0 || note.s >= maximumBeat || note.s + note.d > maximumBeat)
  ) {
    throw new ToolError(
      'OUT_OF_RANGE',
      `Take "${take.id}" extends past the current ${document.bars} bars. Arrange more bars first.`,
      true,
    );
  }
  const notes = quantizeNotes(
    take.notes.map((note) => ({ ...note, source: 'take' })),
    grid,
    strength,
    0,
    maximumBeat,
  );
  const range = noteRange(notes, document.time_sig[0], document.bars);
  const start = (range[0] - 1) * document.time_sig[0];
  const end = range[1] * document.time_sig[0];
  const updated = {
    ...track,
    notes_rev: track.notes_rev + 1,
    notes: [...track.notes.filter((note) => note.s < start || note.s >= end), ...notes].sort(
      noteOrder,
    ),
  };
  return {
    tracks: replaceTrack(document.tracks, updated),
    take_request: document.take_request?.track_id === track.id ? null : document.take_request,
    range,
    track,
  };
}

function proposeOptions(
  document: SongDocument,
  command: Extract<SongCommand, { type: 'propose_options' }>,
  idFactory: (prefix: string) => string,
): ReducerResult<SongDocument> {
  validateBarRange(document, command.args.bar_from, command.args.bar_to);
  const isTake = command.args.kind === 'take';
  let interpretedTake: Take | undefined;
  let destinationTrack: Track | undefined;
  if (isTake) {
    if (command.args.take_id === undefined || command.args.track_id === undefined) {
      throw new ToolError('INVALID_ARGUMENT', 'A take proposal needs take_id and track_id.', true);
    }
    interpretedTake = document.takes.find(({ id }) => id === command.args.take_id);
    if (interpretedTake === undefined) {
      throw new ToolError('TAKE_NOT_FOUND', `Take "${command.args.take_id}" does not exist.`, true);
    }
    destinationTrack = requireTrack(document, command.args.track_id);
    if (
      interpretedTake.target_track_id !== undefined &&
      interpretedTake.target_track_id !== destinationTrack.id
    ) {
      throw new ToolError(
        'INVALID_ARGUMENT',
        `Take "${interpretedTake.id}" was captured for track "${interpretedTake.target_track_id}".`,
        true,
      );
    }
    const takeRange = rangeForTake(interpretedTake, document.time_sig[0], document.bars);
    if (command.args.bar_from !== takeRange[0] || command.args.bar_to !== takeRange[1]) {
      throw new ToolError(
        'INVALID_ARGUMENT',
        `Take "${interpretedTake.id}" belongs to bars ${takeRange[0]}-${takeRange[1]}.`,
        true,
      );
    }
  } else if (command.args.take_id !== undefined || command.args.track_id !== undefined) {
    throw new ToolError(
      'INVALID_ARGUMENT',
      'take_id and track_id at the option-set level belong only to kind take.',
      true,
    );
  }
  const setId = uniqueId(document, 'options', idFactory);
  const beatOffset = (command.args.bar_from - 1) * document.time_sig[0];
  const maximumBeats = (command.args.bar_to - command.args.bar_from + 1) * document.time_sig[0];
  const options: TeachingOption[] = command.args.options.map((option) => {
    if (isTake) {
      if (
        option.notes === undefined ||
        option.chords !== undefined ||
        option.style !== undefined ||
        option.track_id !== undefined
      ) {
        throw new ToolError(
          'INVALID_ARGUMENT',
          'Every take reading needs notes and gets its destination from the option set.',
          true,
        );
      }
    }
    if (option.chords) {
      for (const chord of option.chords) {
        if (!isValidChord(chord.symbol)) {
          throw new ToolError(
            'INVALID_ARGUMENT',
            `Chord "${chord.symbol}" is not recognised.`,
            true,
          );
        }
        if (chord.bar < command.args.bar_from || chord.bar > command.args.bar_to) {
          throw new ToolError('OUT_OF_RANGE', 'An option chord is outside the option bars.', true);
        }
      }
    }
    if (option.track_id) requireTrack(document, option.track_id);
    if (option.notes?.some(({ s, d }) => s + d > maximumBeats)) {
      throw new ToolError('OUT_OF_RANGE', 'An option note extends past the option bars.', true);
    }
    return {
      ...option,
      id: uniqueId(document, 'option', idFactory),
      ...(isTake && destinationTrack !== undefined ? { track_id: destinationTrack.id } : {}),
      notes: option.notes?.map(({ p, s, d, v }) => ({
        p,
        s: beatOffset + s,
        d,
        v: v ?? 0.8,
        ...(isTake ? { s_raw: beatOffset + s, d_raw: d } : {}),
        source: isTake ? ('take' as const) : command.source,
      })),
    };
  });
  if (isTake && interpretedTake !== undefined && destinationTrack !== undefined) {
    options.push({
      id: uniqueId(document, 'option', idFactory),
      label: 'None of these — keep what I sang',
      why: 'No correction: this keeps the rough transcription and timing exactly as captured.',
      track_id: destinationTrack.id,
      notes: interpretedTake.notes.map((note) => ({ ...note })),
      raw_take: true,
    });
  }
  const optionSet = {
    id: setId,
    kind: command.args.kind,
    bar_from: command.args.bar_from,
    bar_to: command.args.bar_to,
    ...(interpretedTake === undefined ? {} : { take_id: interpretedTake.id }),
    ...(destinationTrack === undefined ? {} : { track_id: destinationTrack.id }),
    options,
    chosen_option_id: null,
  };
  return finish(
    document,
    command,
    { option_sets: [...document.option_sets, optionSet] },
    ['option_sets'],
    isTake
      ? `Proposed ${command.args.options.length} take readings plus the raw take for bars ${optionSet.bar_from}-${optionSet.bar_to}`
      : `Proposed ${options.length} ${command.args.kind} options for bars ${optionSet.bar_from}-${optionSet.bar_to}`,
    [optionSet.bar_from, optionSet.bar_to],
    null,
  );
}

function chooseOption(
  document: SongDocument,
  command: Extract<SongCommand, { type: 'choose_option' }>,
): ReducerResult<SongDocument> {
  const optionSet = document.option_sets.find((set) =>
    set.options.some(({ id }) => id === command.args.option_id),
  );
  const option = optionSet?.options.find(({ id }) => id === command.args.option_id);
  if (!optionSet || !option) {
    throw new ToolError(
      'INVALID_ARGUMENT',
      `Option "${command.args.option_id}" does not exist.`,
      true,
    );
  }
  let chords = document.chords;
  if (option.chords) {
    const bars = new Set(option.chords.map(({ bar }) => bar));
    chords = [...document.chords.filter(({ bar }) => !bars.has(bar)), ...option.chords].sort(
      (left, right) => left.bar - right.bar,
    );
  }
  let tracks = document.tracks;
  let takeRequest = document.take_request;
  if (optionSet.kind === 'take') {
    if (optionSet.take_id === undefined || optionSet.track_id === undefined) {
      throw new ToolError('INVALID_ARGUMENT', 'The take option set is incomplete.', true);
    }
    const take = document.takes.find(({ id }) => id === optionSet.take_id);
    if (take === undefined) {
      throw new ToolError('TAKE_NOT_FOUND', `Take "${optionSet.take_id}" does not exist.`, true);
    }
    const chosenTake = option.raw_take
      ? take
      : { ...take, notes: (option.notes ?? []).map((note) => ({ ...note })) };
    const committed = commitTakeToTrack(document, chosenTake, optionSet.track_id, '16n', 0);
    tracks = committed.tracks;
    takeRequest = committed.take_request;
  } else if (option.track_id && option.notes) {
    const track = requireTrack(document, option.track_id);
    const start = (optionSet.bar_from - 1) * document.time_sig[0];
    const end = optionSet.bar_to * document.time_sig[0];
    tracks = replaceTrack(document.tracks, {
      ...track,
      notes_rev: track.notes_rev + 1,
      notes: [
        ...track.notes.filter((note) => note.s < start || note.s >= end),
        ...option.notes,
      ].sort(noteOrder),
    });
  }
  const optionSets = document.option_sets.map((set) =>
    set.id === optionSet.id ? { ...set, chosen_option_id: option.id } : set,
  );
  return finish(
    document,
    command,
    { option_sets: optionSets, chords, tracks, take_request: takeRequest },
    [
      'option_sets',
      ...(option.chords ? ['chords'] : []),
      ...(option.notes ? ['tracks'] : []),
      ...(optionSet.kind === 'take' ? ['take_request'] : []),
    ],
    optionSet.kind === 'take'
      ? `Chose ${option.label} and committed ${optionSet.take_id ?? 'take'} to ${optionSet.track_id ?? 'track'}`
      : `Chose ${option.label}`,
    [optionSet.bar_from, optionSet.bar_to],
    option.track_id ?? null,
  );
}

function requestTake(
  document: SongDocument,
  command: Extract<SongCommand, { type: 'request_take' }>,
  idFactory: (prefix: string) => string,
): ReducerResult<SongDocument> {
  requireTrack(document, command.args.track_id);
  validateBarRange(document, command.args.bar_from, command.args.bar_to);
  const request = { id: uniqueId(document, 'request', idFactory), ...command.args };
  return finish(
    document,
    command,
    { take_request: request },
    ['take_request'],
    `Requested a take for bars ${request.bar_from}-${request.bar_to}`,
    [request.bar_from, request.bar_to],
    request.track_id,
  );
}

function updateTrack(
  document: SongDocument,
  command: Exclude<SongCommand, { type: 'ping' }>,
  transform: (track: Track) => Track,
  summary: string,
  changed: string[],
): ReducerResult<SongDocument> {
  const trackId = 'track_id' in command.args ? (command.args.track_id ?? '') : '';
  const track = requireTrack(document, trackId);
  return finish(
    document,
    command,
    { tracks: replaceTrack(document.tracks, transform(track)) },
    changed,
    summary,
    [1, document.bars],
    track.id,
  );
}

function finish(
  document: SongDocument,
  command: Exclude<SongCommand, { type: 'ping' }>,
  patch: Partial<SongDocument>,
  changed: string[],
  summary: string,
  bars: [number, number],
  trackId: string | null,
): ReducerResult<SongDocument> {
  return {
    document: {
      ...document,
      ...patch,
      notes_log: [
        ...document.notes_log,
        {
          revision: document.revision + 1,
          why: command.why,
          bars,
          track_id: trackId,
          source: command.source,
        },
      ],
    },
    changed: changed.includes('notes_log') ? changed : [...changed, 'notes_log'],
    summary,
    target_bars: bars,
  };
}

function restoreSnapshot(document: SongDocument, command: Command): ReducerResult<SongDocument> {
  const snapshot = command.args.document;
  const summary = command.args.summary;
  if (!isSongDocument(snapshot) || typeof summary !== 'string') {
    throw new ToolError('INVALID_ARGUMENT', 'History supplied an invalid song snapshot.', false);
  }
  return {
    document: { ...cloneSong(snapshot), revision: document.revision },
    changed: ['song'],
    summary,
    target_bars: [1, Math.max(document.bars, snapshot.bars)],
  };
}

function requireTrack(document: SongDocument, trackId: string): Track {
  const track = document.tracks.find(({ id }) => id === trackId);
  if (!track) throw new ToolError('TRACK_NOT_FOUND', `Track "${trackId}" does not exist.`, true);
  return track;
}

function requireInstrument(instrument: string): void {
  if (!isKnownInstrument(instrument)) {
    throw new ToolError(
      'INVALID_ARGUMENT',
      `Instrument "${instrument}" is not in the current catalogue. Read get_song_state for names.`,
      true,
    );
  }
}

function validateBarRange(document: SongDocument, barFrom: number, barTo: number): void {
  if (barFrom < 1 || barTo < barFrom) {
    throw new ToolError('INVALID_ARGUMENT', 'Give an ordered, one-based bar range.', true);
  }
  if (barTo > document.bars) {
    throw new ToolError('OUT_OF_RANGE', `The song has ${document.bars} bars.`, true);
  }
}

function trackTouchedBy(
  command: Exclude<SongCommand, { type: 'ping' }>,
  document: SongDocument,
): string | null {
  if ('track_id' in command.args) return command.args.track_id ?? null;
  if (command.type === 'choose_option') {
    return (
      document.option_sets
        .flatMap(({ options }) => options)
        .find(({ id }) => id === command.args.option_id)?.track_id ?? null
    );
  }
  return null;
}

function replaceTrack(tracks: readonly Track[], updated: Track): Track[] {
  return tracks.map((track) => (track.id === updated.id ? updated : track));
}

function trackName(document: SongDocument, trackId: string): string {
  return requireTrack(document, trackId).name;
}

function noteRange(
  notes: readonly Note[],
  beatsPerBar: number,
  fallbackBar: number,
): [number, number] {
  if (notes.length === 0) return [1, fallbackBar];
  return [
    Math.floor(Math.min(...notes.map(({ s }) => s)) / beatsPerBar) + 1,
    Math.floor(Math.max(...notes.map(({ s, d }) => Math.max(s, s + d - 0.000_001))) / beatsPerBar) +
      1,
  ];
}

function rangeForTake(take: Take, beatsPerBar: number, fallbackBar: number): [number, number] {
  const performed = noteRange(take.notes, beatsPerBar, fallbackBar);
  if (take.target_bars === undefined) return performed;
  return [Math.min(take.target_bars[0], performed[0]), Math.max(take.target_bars[1], performed[1])];
}

function noteOrder(left: Note, right: Note): number {
  return left.s - right.s || left.p - right.p;
}

function uniqueId(
  document: SongDocument,
  prefix: string,
  factory: (prefix: string) => string,
): string {
  const existing = new Set([
    ...document.tracks.map(({ id }) => id),
    ...document.takes.map(({ id }) => id),
    ...document.option_sets.flatMap((set) => [set.id, ...set.options.map(({ id }) => id)]),
    ...(document.take_request ? [document.take_request.id] : []),
  ]);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const id = factory(prefix);
    if (!existing.has(id)) return id;
  }
  throw new ToolError('INTERNAL', `Could not allocate a ${prefix} id.`, false);
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isSongDocument(value: unknown): value is SongDocument {
  return (
    typeof value === 'object' &&
    value !== null &&
    'revision' in value &&
    typeof value.revision === 'number' &&
    'tracks' in value &&
    Array.isArray(value.tracks) &&
    'bars' in value &&
    typeof value.bars === 'number'
  );
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
