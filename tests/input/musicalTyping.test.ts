import { describe, expect, it, vi } from 'vitest';
import {
  PlayedNoteRecorder,
  typingKeyToPitch,
  type PlayedNoteSink,
} from '../../src/input/musicalTyping.ts';
import type { TransportPort } from '../../src/input/transportPort.ts';

function transportHarness() {
  let seconds = 0;
  const transport: TransportPort = {
    getAudioContext: () => null,
    getBpm: () => 120,
    getTimeSignature: () => [4, 4],
    getPositionSeconds: () => seconds,
    countIn: async () => ({ durationSeconds: 0 }),
  };
  return { transport, setSeconds: (next: number) => (seconds = next) };
}

describe('GarageBand Musical Typing map', () => {
  it('maps white and black rows exactly and transposes by octave', () => {
    expect(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'].map((key) => typingKeyToPitch(key, 4))).toEqual(
      [60, 62, 64, 65, 67, 69, 71, 72],
    );
    expect(['w', 'e', 't', 'y', 'u'].map((key) => typingKeyToPitch(key, 4))).toEqual([
      61, 63, 66, 68, 70,
    ]);
    expect(typingKeyToPitch('a', 5)).toBe(72);
    expect(typingKeyToPitch('q', 4)).toBeNull();
  });

  it('uses Z/X for octave, C/V for velocity and ignores repeats', () => {
    const test = transportHarness();
    const recorder = new PlayedNoteRecorder(test.transport);
    expect(recorder.pressKey('x')).toBe(true);
    expect(recorder.pressKey('v')).toBe(true);
    expect(recorder.getSnapshot()).toMatchObject({ octave: 5, velocity: 0.9 });
    expect(recorder.pressKey('a')).toBe(true);
    expect(recorder.pressKey('a', true)).toBe(false);
    expect(recorder.getSnapshot().activePitches).toEqual([72]);
    recorder.releaseKey('a');
    expect(recorder.getSnapshot().activePitches).toEqual([]);
  });
});

describe('PlayedNoteRecorder', () => {
  it('timestamps a keyboard take in beats against the transport', () => {
    const test = transportHarness();
    const sink: PlayedNoteSink = { noteOn: vi.fn(), noteOff: vi.fn() };
    const recorder = new PlayedNoteRecorder(test.transport, sink);
    test.setSeconds(10);
    recorder.startTake({ id: 'keyboard-1', startBeat: 8 });
    test.setSeconds(10.25);
    recorder.pressKey('a');
    test.setSeconds(10.75);
    recorder.releaseKey('a');
    test.setSeconds(11);
    const take = recorder.stopTake();

    expect(take).toMatchObject({
      id: 'keyboard-1',
      source: 'keyboard',
      duration_s: 1,
      voiced_ratio: 1,
      median_clarity: 1,
      pitch_range: [60, 60],
      tempo_hint: 120,
    });
    expect(take.notes).toEqual([
      { p: 60, s: 8.5, d: 1, v: 0.8, s_raw: 8.5, d_raw: 1, source: 'take' },
    ]);
    expect(sink.noteOn).toHaveBeenCalledWith(60, 0.8);
    expect(sink.noteOff).toHaveBeenCalledWith(60);
  });

  it('accepts MIDI note-on/off through the same take recorder', () => {
    const test = transportHarness();
    const recorder = new PlayedNoteRecorder(test.transport);
    recorder.startTake({ id: 'midi-1', source: 'midi' });
    recorder.noteOn(48, 64 / 127);
    test.setSeconds(0.5);
    recorder.noteOff(48);
    const take = recorder.stopTake();
    expect(take.source).toBe('midi');
    expect(take.notes[0]).toMatchObject({ p: 48, s: 0, d: 1 });
  });
});
