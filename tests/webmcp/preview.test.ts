import { describe, expect, it, vi } from 'vitest';
import { loadExampleSong } from '../../src/song/serialise.ts';
import { createSongStore } from '../../src/song/store.ts';
import type { TeachingOption, TeachingOptionSet } from '../../src/song/types.ts';
import { applyOptionPreview, createPlaybackView } from '../../src/webmcp/preview.ts';

function optionSet(option: Partial<TeachingOption>): {
  set: TeachingOptionSet;
  option: TeachingOption;
} {
  const built: TeachingOption = {
    id: 'option-1',
    label: 'Brighter turn',
    why: 'It lifts into the chorus.',
    ...option,
  };
  return {
    set: {
      id: 'options-1',
      kind: 'chords',
      bar_from: 1,
      bar_to: 4,
      options: [built],
      chosen_option_id: null,
    },
    option: built,
  };
}

describe('playback view', () => {
  it('shows the live song until a preview is set', () => {
    const store = createSongStore(loadExampleSong());
    const view = createPlaybackView(store);
    const listener = vi.fn();
    const stop = view.subscribe(listener);
    expect(view.getDocument().title).toBe('First Light');

    store.dispatch({
      type: 'set_tempo',
      args: { bpm: 101 },
      source: 'human',
      why: 'Faster feel.',
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(view.getDocument().bpm).toBe(101);

    view.setPreview({ ...store.getDocument(), title: 'Preview' });
    expect(view.getDocument().title).toBe('Preview');
    expect(view.getPreview()).not.toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);

    store.dispatch({
      type: 'set_tempo',
      args: { bpm: 102 },
      source: 'human',
      why: 'Faster still.',
    });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(view.getDocument().title).toBe('Preview');

    view.setPreview(null);
    expect(view.getDocument().bpm).toBe(102);
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
    view.dispose();
  });
});

describe('option preview', () => {
  it('voices a chord option onto the chords track without touching the song', () => {
    const song = loadExampleSong();
    const { set, option } = optionSet({
      chords: [
        { bar: 1, symbol: 'Am7' },
        { bar: 2, symbol: 'Fmaj7' },
      ],
      style: 'lofi',
    });
    const preview = applyOptionPreview(song, set, option, 1);
    expect(preview.chords.find(({ bar }) => bar === 1)?.symbol).toBe('Am7');
    expect(song.chords.find(({ bar }) => bar === 1)?.symbol).toBe('C');
    const chordTrack = preview.tracks.find(({ id }) => id === 'chords');
    expect(chordTrack?.notes.length).toBeGreaterThan(0);
    expect(chordTrack?.notes_rev).toBeGreaterThan(1000);
    expect(song.tracks.find(({ id }) => id === 'chords')?.notes).toHaveLength(0);
  });

  it('puts an option part on its own track and leaves the rest alone', () => {
    const song = loadExampleSong();
    const { set, option } = optionSet({
      track_id: 'bass',
      notes: [{ p: 40, s: 0, d: 2, v: 0.7, source: 'agent' }],
    });
    const preview = applyOptionPreview(song, set, option, 2);
    const bass = preview.tracks.find(({ id }) => id === 'bass');
    expect(bass?.notes.filter((note) => note.s < 16)).toEqual([
      { p: 40, s: 0, d: 2, v: 0.7, source: 'agent' },
    ]);
    expect(preview.tracks.find(({ id }) => id === 'drums')?.notes).toEqual(
      song.tracks.find(({ id }) => id === 'drums')?.notes,
    );
  });

  it('regenerates the generated parts for a feel option', () => {
    const song = loadExampleSong();
    const { set, option } = optionSet({ style: 'soul' });
    const preview = applyOptionPreview(song, { ...set, kind: 'feel' }, option, 3);
    const drums = preview.tracks.find(({ id }) => id === 'drums');
    expect(drums?.notes_rev).toBeGreaterThan(1000);
    expect(drums?.notes).not.toEqual(song.tracks.find(({ id }) => id === 'drums')?.notes);
  });

  it('adds a preview track when the song has nowhere to sound the chords', () => {
    const song = loadExampleSong();
    song.tracks = song.tracks.filter(({ kind }) => kind !== 'chords');
    const { set, option } = optionSet({ chords: [{ bar: 1, symbol: 'G7' }] });
    const preview = applyOptionPreview(song, set, option, 4);
    const added = preview.tracks.find(({ id }) => id.startsWith('preview-chords'));
    expect(added?.notes.length).toBeGreaterThan(0);
    expect(added?.kind).toBe('chords');
  });
});
