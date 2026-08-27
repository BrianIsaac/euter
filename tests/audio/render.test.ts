import { describe, expect, it, vi } from 'vitest';
import { renderSong, type OfflineRenderEngine } from '../../src/audio/render.ts';
import { loadExampleSong } from '../../src/song/serialise.ts';

function audioBuffer(value = 0.25): AudioBuffer {
  const channels = [new Float32Array(16).fill(value), new Float32Array(16).fill(value)];
  return {
    duration: 16 / 48_000,
    length: 16,
    sampleRate: 48_000,
    numberOfChannels: 2,
    getChannelData: (channel: number) => channels[channel] ?? new Float32Array(),
  } as AudioBuffer;
}

describe('offline rendering', () => {
  it('converts an inclusive bar range into clipped seconds and includes a tail', async () => {
    const song = loadExampleSong();
    const output = audioBuffer();
    const engine: OfflineRenderEngine = { render: vi.fn(async () => output) };
    const progress = vi.fn();
    const result = await renderSong(
      song,
      { start_bar: 1, end_bar: 2, tail_seconds: 1 },
      {
        engine,
        sample_rate: 48_000,
        onProgress: progress,
      },
    );
    expect(result).toBe(output);
    expect(engine.render).toHaveBeenCalledTimes(1);
    expect(vi.mocked(engine.render).mock.calls[0]?.[0]).toMatchObject({
      duration_seconds: (8 * 60) / song.bpm + 1,
      sample_rate: 48_000,
      channels: 2,
    });
    expect(vi.mocked(engine.render).mock.calls[0]?.[0].notes.length).toBeGreaterThan(0);
    expect(progress.mock.calls.flat()).toEqual([0, 10, 100]);
  });

  it('rejects invalid ranges and honours cancellation before rendering', async () => {
    const song = loadExampleSong();
    const engine: OfflineRenderEngine = { render: vi.fn() };
    await expect(renderSong(song, { start_bar: 0, end_bar: 2 }, { engine })).rejects.toThrow(
      'within bars',
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      renderSong(song, { start_bar: 1, end_bar: 2 }, { engine, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(engine.render).not.toHaveBeenCalled();
  });

  it('limits an over-full-scale buffer inside the offline render path', async () => {
    const song = loadExampleSong();
    const output = audioBuffer(2.4);
    const engine: OfflineRenderEngine = { render: vi.fn(async () => output) };

    expect(await renderSong(song, { start_bar: 1, end_bar: 2 }, { engine })).toBe(output);
    expect(output.getChannelData(0)[0]).toBeCloseTo(0.98, 5);
    expect(output.getChannelData(1)[0]).toBeCloseTo(0.98, 5);
  });
});
