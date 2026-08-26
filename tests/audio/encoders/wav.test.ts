import { describe, expect, it } from 'vitest';
import { encodeWav } from '../../../src/audio/encoders/wav.ts';

function buffer(channels: readonly Float32Array[], sampleRate = 8_000): AudioBuffer {
  return {
    numberOfChannels: channels.length,
    length: channels[0]?.length ?? 0,
    sampleRate,
    getChannelData: (channel: number) => channels[channel] ?? new Float32Array(),
  } as AudioBuffer;
}

describe('WAV encoder', () => {
  it('writes a real RIFF/WAVE header and interleaved 16-bit samples', () => {
    const bytes = encodeWav(buffer([new Float32Array([0, 1]), new Float32Array([-1, 0.5])]));
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(8_000);
    expect(view.getUint32(40, true)).toBe(8);
  });

  it('rejects unsupported surround buffers', () => {
    expect(() =>
      encodeWav(buffer([new Float32Array(1), new Float32Array(1), new Float32Array(1)])),
    ).toThrow('one or two channels');
  });
});
