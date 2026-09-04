import { describe, expect, it, vi } from 'vitest';
import { bindAudioImport, importAudioFile } from '../../src/input/importFile.ts';

function audioBuffer(channels: Float32Array[], sampleRate = 16_000): AudioBuffer {
  return {
    length: channels[0]?.length ?? 0,
    numberOfChannels: channels.length,
    sampleRate,
    getChannelData: (channel: number) => channels[channel] ?? new Float32Array(),
  } as AudioBuffer;
}

describe('importAudioFile', () => {
  it('mixes channels and uses the same pitchy take path', async () => {
    const samples = Float32Array.from(
      { length: 16_000 },
      (_, index) => 0.25 * Math.sin((2 * Math.PI * 440 * index) / 16_000),
    );
    const decoded = audioBuffer([samples, samples]);
    const context = { decodeAudioData: vi.fn(async () => decoded) };
    const file = new File([new Uint8Array([1, 2, 3])], 'voice memo.m4a', { type: 'audio/mp4' });
    const result = await importAudioFile(file, context, { id: 'take-import', bpm: 120 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.take).toMatchObject({
      id: 'take-import',
      source: 'import',
      tempo_hint: 120,
    });
    expect(result.data.take.notes[0]?.p).toBe(69);
    expect(result.data.take.audio).toMatchObject({
      encoding: 'pcm16-base64',
      sample_rate: 16_000,
      trim_start_s: 0,
      start_beat: 0,
    });
    expect(result.data.wav.type).toBe('audio/wav');
    expect(result.data.fileName).toBe('voice memo.m4a');
  });

  it('returns missing and decode errors as recoverable data', async () => {
    const context = { decodeAudioData: vi.fn(async () => audioBuffer([])) };
    await expect(importAudioFile(null, context, { id: 'none', bpm: 90 })).resolves.toMatchObject({
      ok: false,
      code: 'NO_FILE',
    });
    context.decodeAudioData.mockRejectedValueOnce(new DOMException('bad data', 'EncodingError'));
    await expect(
      importAudioFile(new File(['bad'], 'bad.txt'), context, { id: 'bad', bpm: 90 }),
    ).resolves.toMatchObject({ ok: false, code: 'DECODE_FAILED', recoverable: true });
  });

  it('rejects a decoded container that has no audio track or frames', async () => {
    const noTrack = {
      length: 1024,
      numberOfChannels: 0,
      sampleRate: 48_000,
      getChannelData: vi.fn(),
    } as unknown as AudioBuffer;
    const noFrames = audioBuffer([new Float32Array()], 48_000);
    const context = {
      decodeAudioData: vi.fn().mockResolvedValueOnce(noTrack).mockResolvedValueOnce(noFrames),
    };
    const file = new File(['container'], 'empty.m4a', { type: 'audio/mp4' });

    await expect(importAudioFile(file, context, { id: 'empty-1', bpm: 90 })).resolves.toMatchObject(
      {
        ok: false,
        code: 'DECODE_FAILED',
      },
    );
    await expect(importAudioFile(file, context, { id: 'empty-2', bpm: 90 })).resolves.toMatchObject(
      {
        ok: false,
        code: 'DECODE_FAILED',
      },
    );
  });
});

describe('bindAudioImport', () => {
  it('wires both file input and drop target and cleans them up', () => {
    const input = document.createElement('input');
    input.type = 'file';
    const dropTarget = document.createElement('div');
    const onFile = vi.fn();
    const picked = new File(['picked'], 'picked.wav');
    const dropped = new File(['dropped'], 'dropped.wav');
    Object.defineProperty(input, 'files', { configurable: true, value: [picked] });
    const cleanup = bindAudioImport({ input, dropTarget, onFile });

    input.dispatchEvent(new Event('change'));
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [dropped] } });
    dropTarget.dispatchEvent(drop);
    expect(onFile).toHaveBeenNthCalledWith(1, picked);
    expect(onFile).toHaveBeenNthCalledWith(2, dropped);

    cleanup();
    input.dispatchEvent(new Event('change'));
    expect(onFile).toHaveBeenCalledTimes(2);
  });
});
