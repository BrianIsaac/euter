/**
 * Auditioning an option without committing it (plan Tool surface, `audition_option`). The graph is
 * reconciled from whatever document the playback view returns, so a preview is one document with
 * the option applied: the reconciler rebuilds the affected Parts, the person hears the option in
 * place, and `revision` never moves. Reverting hands the live document back.
 */
import { generateBass } from '../theory/generate/bass.ts';
import { generateChords } from '../theory/generate/chords.ts';
import { generateDrums } from '../theory/generate/drums.ts';
import type { SongStoreReader } from '../song/serialise.ts';
import {
  cloneSong,
  type ChordEntry,
  type Note,
  type SongDocument,
  type StyleName,
  type TeachingOption,
  type TeachingOptionSet,
  type Track,
} from '../song/types.ts';

export interface PlaybackView extends SongStoreReader {
  /** Shows a document instead of the live song until it is cleared with null. */
  setPreview(document: SongDocument | null): void;
  getPreview(): SongDocument | null;
  dispose(): void;
}

/**
 * Wraps the song store so the audio graph can be pointed at a preview document.
 *
 * @param store - The live song store.
 * @returns A reader the reconciler subscribes to.
 */
export function createPlaybackView(store: SongStoreReader): PlaybackView {
  let preview: SongDocument | null = null;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  const stopStore = store.subscribe(() => {
    if (preview === null) notify();
  });
  return {
    getDocument: () => preview ?? store.getDocument(),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setPreview(document) {
      preview = document;
      notify();
    },
    getPreview: () => preview,
    dispose: stopStore,
  };
}

/**
 * Builds the document that sounds one option: its chords voiced onto the chords track, its notes
 * on their track, or its feel regenerated across the generated parts.
 *
 * @param song - The live song.
 * @param set - The option set the option belongs to.
 * @param option - The option to hear.
 * @param sequence - A counter that makes every preview's `notes_rev` unique so Parts rebuild.
 * @returns A detached document; the live song is untouched.
 */
export function applyOptionPreview(
  song: SongDocument,
  set: TeachingOptionSet,
  option: TeachingOption,
  sequence: number,
): SongDocument {
  const next = cloneSong(song);
  const beatsPerBar = next.time_sig[0];
  const style: StyleName = option.style ?? 'pop';
  const bump = (track: Track, notes: Note[]): Track => ({
    ...track,
    notes_rev: track.notes_rev + 1000 + sequence,
    notes: [
      ...track.notes.filter(
        (note) => note.s < (set.bar_from - 1) * beatsPerBar || note.s >= set.bar_to * beatsPerBar,
      ),
      ...notes,
    ].sort((left, right) => left.s - right.s || left.p - right.p),
  });

  if (option.chords && option.chords.length > 0) {
    next.chords = mergeChords(next.chords, option.chords);
  }
  if (option.notes && option.notes.length > 0 && option.track_id !== undefined) {
    next.tracks = next.tracks.map((track) =>
      track.id === option.track_id ? bump(track, [...(option.notes ?? [])]) : track,
    );
    return next;
  }

  const wantsChords = Boolean(option.chords && option.chords.length > 0);
  const roles: Track['kind'][] = wantsChords ? ['chords'] : ['chords', 'bass', 'drums'];
  let sounded = false;
  next.tracks = next.tracks.map((track) => {
    if (!roles.includes(track.kind)) return track;
    sounded = true;
    return bump(
      track,
      generateFor(track.kind, next.chords, next.key.name, style, set, beatsPerBar),
    );
  });
  if (!sounded && wantsChords) {
    next.tracks = [
      ...next.tracks,
      {
        id: `preview-chords-${sequence}`,
        name: 'Option preview',
        kind: 'chords',
        instrument: 'electric-piano',
        volume_db: -9,
        pan: 0,
        mute: false,
        solo: false,
        notes_rev: 1 + sequence,
        notes: generateChords(
          next.chords,
          next.key.name,
          style,
          set.bar_from,
          set.bar_to,
          beatsPerBar,
        ),
      },
    ];
  }
  return next;
}

function generateFor(
  kind: Track['kind'],
  chords: readonly ChordEntry[],
  keyName: string,
  style: StyleName,
  set: TeachingOptionSet,
  beatsPerBar: number,
): Note[] {
  if (kind === 'chords') {
    return generateChords(chords, keyName, style, set.bar_from, set.bar_to, beatsPerBar);
  }
  if (kind === 'bass') {
    return generateBass(chords, keyName, style, set.bar_from, set.bar_to, beatsPerBar);
  }
  return generateDrums(style, set.bar_from, set.bar_to, beatsPerBar);
}

function mergeChords(
  current: readonly ChordEntry[],
  replacements: readonly ChordEntry[],
): ChordEntry[] {
  const bars = new Set(replacements.map(({ bar }) => bar));
  return [...current.filter(({ bar }) => !bars.has(bar)), ...replacements].sort(
    (left, right) => left.bar - right.bar,
  );
}
