import { Midi } from '@tonejs/midi';
import type { SongDocument } from '../../song/types.ts';

/** Encodes the song document as a standards-compliant Type 1 MIDI file. */
export function encodeMidi(song: SongDocument): Uint8Array {
  const midi = new Midi();
  midi.header.name = song.title;
  midi.header.setTempo(song.bpm);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [song.time_sig[0], song.time_sig[1]],
    measures: 0,
  });
  for (const songTrack of song.tracks) {
    const track = midi.addTrack();
    track.name = songTrack.name;
    track.instrument.name = songTrack.instrument;
    for (const note of songTrack.notes) {
      track.addNote({
        midi: note.p,
        time: (note.s * 60) / song.bpm,
        duration: (note.d * 60) / song.bpm,
        velocity: note.v,
      });
    }
  }
  return midi.toArray();
}
