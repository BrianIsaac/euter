/** File-picker and drop import through the microphone take path (plan Decision 10; Risk 1). */
import type { Take } from '../song/types.ts';
import { transcribePcmToTake } from '../transcribe/takes.ts';
import { encodePcm16Wav } from './recorder.ts';

export interface ImportAudioOptions {
  id: string;
  bpm: number;
  startBeat?: number;
}

export interface ImportedAudio {
  take: Take;
  wav: Blob;
  fileName: string;
}

export type ImportAudioResult =
  | { ok: true; data: ImportedAudio }
  | { ok: false; code: 'NO_FILE' | 'DECODE_FAILED'; message: string; recoverable: true };

function mixToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      mono[index] = (mono[index] ?? 0) + (data[index] ?? 0) / buffer.numberOfChannels;
    }
  }
  return mono;
}

/** Decodes any browser-supported audio file and transcribes it exactly like worklet PCM. */
export async function importAudioFile(
  file: File | null,
  context: Pick<BaseAudioContext, 'decodeAudioData'>,
  options: ImportAudioOptions,
): Promise<ImportAudioResult> {
  if (file === null) {
    return {
      ok: false,
      code: 'NO_FILE',
      message: 'Choose an audio file first.',
      recoverable: true,
    };
  }
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    const pcm = mixToMono(decoded);
    return {
      ok: true,
      data: {
        take: transcribePcmToTake(pcm, decoded.sampleRate, {
          id: options.id,
          source: 'import',
          bpm: options.bpm,
          startBeat: options.startBeat ?? 0,
        }),
        wav: encodePcm16Wav(pcm, decoded.sampleRate),
        fileName: file.name,
      },
    };
  } catch {
    return {
      ok: false,
      code: 'DECODE_FAILED',
      message: 'This file could not be decoded as audio. Try WAV, MP3, M4A or Ogg.',
      recoverable: true,
    };
  }
}

export interface AudioImportBindings {
  input: HTMLInputElement;
  dropTarget: HTMLElement;
  onFile(file: File): void;
}

/** Wires both human-controlled upload surfaces and returns their cleanup function. */
export function bindAudioImport({ input, dropTarget, onFile }: AudioImportBindings): () => void {
  const onChange = (): void => {
    const file = input.files?.[0];
    if (file !== undefined) onFile(file);
  };
  const onDragOver = (event: DragEvent): void => {
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (event: DragEvent): void => {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file !== undefined) onFile(file);
  };
  input.addEventListener('change', onChange);
  dropTarget.addEventListener('dragover', onDragOver);
  dropTarget.addEventListener('drop', onDrop);
  return () => {
    input.removeEventListener('change', onChange);
    dropTarget.removeEventListener('dragover', onDragOver);
    dropTarget.removeEventListener('drop', onDrop);
  };
}
