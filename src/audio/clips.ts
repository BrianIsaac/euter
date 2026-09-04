/** JSON-safe recorded-audio storage and Web Audio decoding. */
import type { TakeAudio } from '../song/types.ts';

const BASE64_CHUNK_BYTES = 0x8000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let start = 0; start < bytes.length; start += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(start, start + BASE64_CHUNK_BYTES));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Encodes mono float PCM as compact PCM16 without losing it at the take boundary. */
export function encodeTakeAudio(
  pcm: Float32Array,
  sampleRate: number,
  trimStartSeconds = 0,
  startBeat = 0,
): TakeAudio {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('Audio sample rate must be greater than zero.');
  }
  if (!Number.isFinite(trimStartSeconds) || trimStartSeconds < 0) {
    throw new RangeError('Audio trim start must not be negative.');
  }
  if (!Number.isFinite(startBeat) || startBeat < 0) {
    throw new RangeError('Audio start beat must not be negative.');
  }
  const bytes = new Uint8Array(pcm.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < pcm.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, pcm[index] ?? 0));
    view.setInt16(index * 2, sample < 0 ? sample * 32_768 : sample * 32_767, true);
  }
  return {
    encoding: 'pcm16-base64',
    sample_rate: sampleRate,
    channels: 1,
    samples: bytesToBase64(bytes),
    trim_start_s: trimStartSeconds,
    start_beat: startBeat,
  };
}

/** Rehydrates retained mono PCM into the caller's live or offline audio context. */
export function decodeTakeAudio(
  audio: TakeAudio,
  context: Pick<BaseAudioContext, 'createBuffer'>,
): AudioBuffer {
  const bytes = base64ToBytes(audio.samples);
  if (bytes.byteLength % 2 !== 0) throw new RangeError('PCM16 audio has an odd byte length.');
  const samples = bytes.byteLength / 2;
  const buffer = context.createBuffer(1, samples, audio.sample_rate);
  const output = buffer.getChannelData(0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < samples; index += 1) {
    const value = view.getInt16(index * 2, true);
    output[index] = value < 0 ? value / 32_768 : value / 32_767;
  }
  return buffer;
}
