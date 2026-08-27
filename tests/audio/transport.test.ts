import { describe, expect, it, vi } from 'vitest';
import { createSongTransport, type ToneTransportLike } from '../../src/audio/transport.ts';
import { loadExampleSong } from '../../src/song/serialise.ts';
import type { AudioContextManager } from '../../src/audio/context.ts';
import { ToolError } from '../../src/webmcp/envelope.ts';

function fakeAudio(running = true): AudioContextManager {
  return {
    activateFromGesture: vi.fn(),
    getContext: vi.fn(),
    getSnapshot: vi.fn(),
    requireRunning: () => {
      if (!running) throw new ToolError('AUDIO_LOCKED', 'locked', true);
      return {} as AudioContext;
    },
    subscribe: vi.fn(),
    close: vi.fn(),
  };
}

function fakeToneTransport(): ToneTransportLike {
  return {
    bpm: { value: 90 },
    position: '0:0:0',
    loop: false,
    loopStart: '0:0:0',
    loopEnd: '0:0:0',
    state: 'stopped',
    start: vi.fn(function (this: ToneTransportLike) {
      this.state = 'started';
    }),
    stop: vi.fn(function (this: ToneTransportLike) {
      this.state = 'stopped';
    }),
  };
}

describe('song transport', () => {
  it('sets bpm, position and loop without changing the song revision', async () => {
    const tone = fakeToneTransport();
    const transport = createSongTransport(fakeAudio(), async () => tone);
    const song = loadExampleSong();
    const revision = song.revision;
    await expect(
      transport.play(song, { from_bar: 3, loop: { bar_from: 3, bar_to: 6 } }),
    ).resolves.toEqual({
      playing: true,
      position_bar: 3,
      loop: { bar_from: 3, bar_to: 6 },
      bpm: 92,
    });
    expect(tone).toMatchObject({
      bpm: { value: 92 },
      position: '2:0:0',
      loop: true,
      loopStart: '2:0:0',
      loopEnd: '6:0:0',
    });
    expect(song.revision).toBe(revision);
    await transport.stop();
    expect(tone.stop).toHaveBeenCalledTimes(1);
  });

  it('returns AUDIO_LOCKED before importing Tone', async () => {
    const provider = vi.fn(async () => fakeToneTransport());
    const transport = createSongTransport(fakeAudio(false), provider);
    await expect(transport.play(loadExampleSong())).rejects.toMatchObject({
      code: 'AUDIO_LOCKED',
    });
    expect(provider).not.toHaveBeenCalled();
  });

  it('does not import Tone when stop is pressed before playback starts', async () => {
    const provider = vi.fn(async () => fakeToneTransport());
    const transport = createSongTransport(fakeAudio(), provider);

    await expect(transport.stop()).resolves.toEqual({
      playing: false,
      position_bar: 1,
      loop: null,
      bpm: 90,
    });
    expect(provider).not.toHaveBeenCalled();
  });

  it('validates play, loop and tempo ranges', async () => {
    const transport = createSongTransport(fakeAudio(), async () => fakeToneTransport());
    await expect(transport.play(loadExampleSong(), { from_bar: 9 })).rejects.toMatchObject({
      code: 'OUT_OF_RANGE',
    });
    await expect(
      transport.play(loadExampleSong(), { loop: { bar_from: 4, bar_to: 2 } }),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(transport.syncTempo(20)).rejects.toMatchObject({ code: 'OUT_OF_RANGE' });
  });
});
