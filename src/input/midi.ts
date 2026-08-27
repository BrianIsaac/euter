/** Thin WebMIDI input wrapper (plan Decision 10; music §5). */
import type { PlayedNoteSink } from './musicalTyping.ts';

export type MidiState =
  | { kind: 'unsupported'; message: string }
  | { kind: 'prompt'; message: string }
  | { kind: 'ready'; inputs: string[]; message: string }
  | { kind: 'denied'; message: string }
  | { kind: 'error'; message: string };

export interface MidiConnection {
  state: MidiState;
  dispose(): void;
}

export interface MidiOptions {
  navigator?: Pick<Navigator, 'requestMIDIAccess'>;
  onState?: (state: MidiState) => void;
}

/** Prompts once, binds every current input and forwards note on/off to the played-note recorder. */
export async function connectMidi(
  sink: PlayedNoteSink,
  options: MidiOptions = {},
): Promise<MidiConnection> {
  const navigatorPort = options.navigator ?? navigator;
  if (typeof navigatorPort.requestMIDIAccess !== 'function') {
    const state: MidiState = { kind: 'unsupported', message: 'WebMIDI is not available here.' };
    options.onState?.(state);
    return { state, dispose() {} };
  }
  options.onState?.({ kind: 'prompt', message: 'Allow access to connected MIDI devices.' });
  try {
    const access = await navigatorPort.requestMIDIAccess({ sysex: false, software: false });
    const bind = (): void => {
      for (const input of access.inputs.values()) {
        input.onmidimessage = ({ data }) => {
          if (data === null) return;
          const status = (data[0] ?? 0) & 0xf0;
          const pitch = data[1] ?? 0;
          const velocity = data[2] ?? 0;
          if (status === 0x90 && velocity > 0) sink.noteOn(pitch, velocity / 127);
          if (status === 0x80 || (status === 0x90 && velocity === 0)) sink.noteOff(pitch);
        };
      }
    };
    bind();
    access.onstatechange = bind;
    const names = [...access.inputs.values()].map((input) => input.name ?? input.id);
    const state: MidiState = {
      kind: 'ready',
      inputs: names,
      message:
        names.length === 0
          ? 'MIDI is allowed; connect a keyboard.'
          : `${names.length} MIDI input(s) ready.`,
    };
    options.onState?.(state);
    return {
      state,
      dispose() {
        access.onstatechange = null;
        for (const input of access.inputs.values()) input.onmidimessage = null;
      },
    };
  } catch (error) {
    const denied = error instanceof DOMException && error.name === 'NotAllowedError';
    const state: MidiState = denied
      ? { kind: 'denied', message: 'MIDI permission was not granted.' }
      : { kind: 'error', message: 'MIDI could not be opened.' };
    options.onState?.(state);
    return { state, dispose() {} };
  }
}
