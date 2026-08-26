import audioBufferToWav from 'audiobuffer-to-wav';

/** Encodes a Web Audio buffer as interoperable 16-bit PCM WAV. */
export function encodeWav(buffer: AudioBuffer): Uint8Array {
  if (buffer.numberOfChannels < 1 || buffer.numberOfChannels > 2) {
    throw new RangeError('WAV export supports one or two channels.');
  }
  return new Uint8Array(audioBufferToWav(buffer));
}
