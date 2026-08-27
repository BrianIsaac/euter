/** One-command pitchy/segment benchmark for the 29 Aug SwiftF0 decision (plan Risk 3). */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transcribePcmToTake } from '../src/transcribe/takes.ts';

interface ExpectedTake {
  bpm: number;
  pitches: number[];
}

export interface DecodedWav {
  pcm: Float32Array;
  sampleRate: number;
}

export interface TakeBenchmark {
  file: string;
  notes: number;
  wrongOctaves: number;
  splitNotes: number;
  expectedNotes: number | null;
  pitches: number[];
}

function ascii(view: DataView, offset: number, length: number): string {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

/** Decodes the small PCM16 WAV shape used by the checked-in and operator fixture takes. */
export function decodePcm16Wav(bytes: Uint8Array): DecodedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 44 || ascii(view, 0, 4) !== 'RIFF' || ascii(view, 8, 4) !== 'WAVE') {
    throw new Error('Expected a RIFF/WAVE file');
  }
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataOffset = 0;
  let dataLength = 0;
  while (offset + 8 <= view.byteLength) {
    const id = ascii(view, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const payload = offset + 8;
    if (id === 'fmt ' && length >= 16) {
      audioFormat = view.getUint16(payload, true);
      channels = view.getUint16(payload + 2, true);
      sampleRate = view.getUint32(payload + 4, true);
      bitsPerSample = view.getUint16(payload + 14, true);
    }
    if (id === 'data') {
      dataOffset = payload;
      dataLength = Math.min(length, view.byteLength - payload);
      break;
    }
    offset = payload + length + (length % 2);
  }
  if (audioFormat !== 1 || channels < 1 || bitsPerSample !== 16 || dataLength === 0) {
    throw new Error('Only PCM16 WAV files with at least one channel are supported');
  }
  const frameCount = Math.floor(dataLength / (channels * 2));
  const pcm = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let mixed = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      mixed += view.getInt16(dataOffset + (frame * channels + channel) * 2, true) / 32_768;
    }
    pcm[frame] = mixed / channels;
  }
  return { pcm, sampleRate };
}

function readExpected(file: string): ExpectedTake | null {
  const sidecar = file.slice(0, -extname(file).length) + '.json';
  if (!existsSync(sidecar)) return null;
  return JSON.parse(readFileSync(sidecar, 'utf8')) as ExpectedTake;
}

function heuristicWrongOctaves(pitches: readonly number[]): number {
  let count = 0;
  for (let index = 1; index < pitches.length - 1; index += 1) {
    const previous = pitches[index - 1];
    const current = pitches[index];
    const next = pitches[index + 1];
    if (previous === undefined || current === undefined || next === undefined) continue;
    if (Math.abs(previous - next) <= 1 && Math.abs(Math.abs(current - previous) - 12) <= 1) {
      count += 1;
    }
  }
  return count;
}

/** Runs pitchy then `segmentPitchTrack` through the production take path for one WAV. */
export function benchmarkTake(file: string): TakeBenchmark {
  const expected = readExpected(file);
  const { pcm, sampleRate } = decodePcm16Wav(readFileSync(file));
  const take = transcribePcmToTake(pcm, sampleRate, {
    id: basename(file, extname(file)),
    source: 'import',
    bpm: expected?.bpm ?? 96,
  });
  const pitches = take.notes.map((note) => note.p);
  const wrongOctaves =
    expected === null
      ? heuristicWrongOctaves(pitches)
      : pitches.reduce((count, pitch, index) => {
          const wanted = expected.pitches[index];
          return wanted !== undefined && Math.abs(Math.abs(pitch - wanted) - 12) <= 1
            ? count + 1
            : count;
        }, 0);
  const splitNotes =
    expected === null
      ? take.notes.slice(1).filter((note, index) => {
          const previous = take.notes[index];
          return (
            previous !== undefined &&
            Math.abs(previous.p - note.p) <= 1 &&
            note.s - (previous.s + previous.d) <= 0.15
          );
        }).length
      : Math.max(0, pitches.length - expected.pitches.length);
  return {
    file,
    notes: take.notes.length,
    wrongOctaves,
    splitNotes,
    expectedNotes: expected?.pitches.length ?? null,
    pitches,
  };
}

function wavsBelow(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...wavsBelow(path));
    if (statSync(path).isFile() && extname(path).toLowerCase() === '.wav') files.push(path);
  }
  return files;
}

export function runTakeBench(fixtures = resolve('tests/fixtures')): TakeBenchmark[] {
  const results = wavsBelow(fixtures).map(benchmarkTake);
  if (results.length === 0) throw new Error(`No WAV takes found under ${fixtures}`);
  console.log('take\tnotes\texpected\twrong_octaves\tsplit_notes\tpitches');
  for (const result of results) {
    console.log(
      [
        result.file.slice(dirname(result.file).length + 1),
        result.notes,
        result.expectedNotes ?? '-',
        result.wrongOctaves,
        result.splitNotes,
        result.pitches.join(','),
      ].join('\t'),
    );
  }
  return results;
}

const invokedPath = process.argv[1] === undefined ? '' : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) runTakeBench();
