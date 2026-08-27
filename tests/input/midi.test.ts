import { describe, expect, it, vi } from 'vitest';
import { connectMidi, type MidiState } from '../../src/input/midi.ts';
import type { PlayedNoteSink } from '../../src/input/musicalTyping.ts';

function midiHarness() {
  const input = { id: 'input-1', name: 'Demo keys', onmidimessage: null } as unknown as MIDIInput;
  const access = {
    inputs: new Map([['input-1', input]]),
    onstatechange: null,
  } as unknown as MIDIAccess;
  const requestMIDIAccess = vi.fn(async () => access);
  const sink: PlayedNoteSink = { noteOn: vi.fn(), noteOff: vi.fn() };
  return { input, access, requestMIDIAccess, sink };
}

describe('connectMidi', () => {
  it('reports prompt/ready states and forwards note on, zero-velocity and note off', async () => {
    const test = midiHarness();
    const states: MidiState[] = [];
    const connection = await connectMidi(test.sink, {
      navigator: { requestMIDIAccess: test.requestMIDIAccess },
      onState: (state) => states.push(state),
    });
    expect(states[0]?.kind).toBe('prompt');
    expect(connection.state).toMatchObject({ kind: 'ready', inputs: ['Demo keys'] });

    const send = (data: number[]): void => {
      test.input.onmidimessage?.({ data: new Uint8Array(data) } as MIDIMessageEvent);
    };
    send([0x90, 60, 100]);
    send([0x90, 60, 0]);
    send([0x80, 61, 10]);
    expect(test.sink.noteOn).toHaveBeenCalledWith(60, 100 / 127);
    expect(test.sink.noteOff).toHaveBeenNthCalledWith(1, 60);
    expect(test.sink.noteOff).toHaveBeenNthCalledWith(2, 61);

    connection.dispose();
    expect(test.input.onmidimessage).toBeNull();
  });

  it('returns unsupported and permission-denied states as data', async () => {
    const unsupported = await connectMidi(
      { noteOn() {}, noteOff() {} },
      {
        navigator: {} as Pick<Navigator, 'requestMIDIAccess'>,
      },
    );
    expect(unsupported.state.kind).toBe('unsupported');

    const denied = await connectMidi(
      { noteOn() {}, noteOff() {} },
      {
        navigator: {
          requestMIDIAccess: vi.fn(async () => {
            throw new DOMException('denied', 'NotAllowedError');
          }),
        },
      },
    );
    expect(denied.state.kind).toBe('denied');
  });
});
