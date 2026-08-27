import { Midi } from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { encodeMidi } from '../../../src/audio/encoders/midi.ts';
import { loadExampleSong } from '../../../src/song/serialise.ts';

describe('MIDI encoder', () => {
  it('round-trips tempo, metre, tracks, pitches and durations through @tonejs/midi', () => {
    const song = loadExampleSong();
    const encoded = encodeMidi(song);
    expect([...encoded.slice(0, 4)]).toEqual([0x4d, 0x54, 0x68, 0x64]);
    const decoded = new Midi(encoded);
    expect(Math.round(decoded.header.tempos[0]?.bpm ?? 0)).toBe(song.bpm);
    expect(decoded.header.timeSignatures[0]?.timeSignature).toEqual(song.time_sig);
    expect(decoded.tracks).toHaveLength(song.tracks.length);
    expect(decoded.tracks[0]?.notes[0]).toMatchObject({ midi: song.tracks[0]?.notes[0]?.p });
    expect(decoded.tracks[0]?.notes[0]?.duration).toBeCloseTo(
      ((song.tracks[0]?.notes[0]?.d ?? 0) * 60) / song.bpm,
      5,
    );
  });

  it('clips a requested bar range and moves its first bar to time zero', () => {
    const song = loadExampleSong();
    const encoded = encodeMidi(song, { start_bar: 5, end_bar: 8 });
    const decoded = new Midi(encoded);
    const startBeat = 16;
    const endBeat = 32;

    for (const [index, track] of decoded.tracks.entries()) {
      const source = song.tracks[index]?.notes.filter(
        (note) => note.s < endBeat && note.s + note.d > startBeat,
      );
      expect(track.notes).toHaveLength(source?.length ?? 0);
      expect(track.notes.every((note) => note.time >= 0)).toBe(true);
    }
    const sourceTrackIndex = song.tracks.findIndex((track) =>
      track.notes.some((note) => note.s < endBeat && note.s + note.d > startBeat),
    );
    const firstSource = song.tracks[sourceTrackIndex]?.notes.find(
      (note) => note.s < endBeat && note.s + note.d > startBeat,
    );
    expect(decoded.tracks[sourceTrackIndex]?.notes[0]?.midi).toBe(firstSource?.p);
    expect(decoded.tracks[sourceTrackIndex]?.notes[0]?.time).toBeCloseTo(
      (Math.max(firstSource?.s ?? startBeat, startBeat) - startBeat) * (60 / song.bpm),
      5,
    );
  });
});
