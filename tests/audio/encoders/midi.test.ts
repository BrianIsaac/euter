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
});
