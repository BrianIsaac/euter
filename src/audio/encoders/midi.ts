import { Midi } from '@tonejs/midi';
import type { SongDocument } from '../../song/types.ts';

export interface MidiRange {
  start_bar: number;
  end_bar: number;
}

/** Encodes the song document as a standards-compliant Type 1 MIDI file. */
export function encodeMidi(
  song: SongDocument,
  range: MidiRange = { start_bar: 1, end_bar: song.bars },
): Uint8Array {
  if (
    !Number.isInteger(range.start_bar) ||
    !Number.isInteger(range.end_bar) ||
    range.start_bar < 1 ||
    range.end_bar < range.start_bar ||
    range.end_bar > song.bars
  ) {
    throw new RangeError(`MIDI range must be within bars 1-${song.bars}.`);
  }
  const beatsPerBar = song.time_sig[0];
  const startBeat = (range.start_bar - 1) * beatsPerBar;
  const endBeat = range.end_bar * beatsPerBar;
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
    for (const note of songTrack.notes.filter(
      (candidate) => candidate.s < endBeat && candidate.s + candidate.d > startBeat,
    )) {
      const clippedStart = Math.max(note.s, startBeat);
      const clippedEnd = Math.min(note.s + note.d, endBeat);
      track.addNote({
        midi: note.p,
        time: ((clippedStart - startBeat) * 60) / song.bpm,
        duration: ((clippedEnd - clippedStart) * 60) / song.bpm,
        velocity: note.v,
      });
    }
  }
  return midi.toArray();
}
