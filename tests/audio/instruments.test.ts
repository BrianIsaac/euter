import { describe, expect, it, vi } from 'vitest';
import {
  INSTRUMENT_CATALOGUE,
  instrumentPitchName,
  instrumentsByFamily,
  loadInstrument,
  type InstrumentBackend,
  type InstrumentFactories,
} from '../../src/audio/instruments.ts';

function factories() {
  const backend: InstrumentBackend = { trigger: vi.fn(), dispose: vi.fn() };
  const value: InstrumentFactories = {
    sampler: vi.fn(async () => backend),
    drumMachine: vi.fn(async () => backend),
    monoSynth: vi.fn(async () => backend),
    polySynth: vi.fn(async () => backend),
  };
  return { value, backend };
}

const context = { destination: {} } as BaseAudioContext;

describe('instrument catalogue', () => {
  it('gives every entry a loader, licence row and honest byte size', () => {
    expect(INSTRUMENT_CATALOGUE.length).toBeGreaterThanOrEqual(10);
    for (const entry of INSTRUMENT_CATALOGUE) {
      expect(typeof entry.loader).toBe('function');
      expect(entry.licence.source).toBeTruthy();
      expect(entry.licence.url).toMatch(/^https:/u);
      expect(['Public domain', 'CC0 1.0', 'MIT']).toContain(entry.licence.licence);
      expect(entry.byte_size).toBeGreaterThanOrEqual(0);
    }
  });

  it('lists keys, drums, strings, mallets, brass/winds and synth families', () => {
    expect(instrumentsByFamily()).toEqual({
      keys: ['grand-piano', 'electric-piano'],
      drums: ['studio-kit', 'pocket-kit', 'dusty-kit'],
      strings: ['vcsl-strings'],
      mallets: ['vcsl-vibraphone'],
      'brass-winds': ['vcsl-recorder', 'vcsl-saxello'],
      synth: ['sub-bass', 'warm-pad'],
    });
  });

  it('loads the bundled piano through an explicit smplr sample map', async () => {
    const fake = factories();
    const result = await loadInstrument('grand-piano', {
      context,
      destination: {},
      factories: fake.value,
    });
    expect(result.loaded).toBe(true);
    expect(fake.value.sampler).toHaveBeenCalledTimes(1);
    const preset = vi.mocked(fake.value.sampler).mock.calls[0]?.[2];
    expect(preset?.samples).toMatchObject({
      baseUrl: '/samples/piano/grand/',
      formats: ['ogg'],
    });
    expect(preset?.groups[0]?.regions.map(({ pitch }) => pitch)).toEqual([48, 60, 72, 83, 96]);
    expect(preset?.groups[0]?.regions.map(({ sample }) => sample)).toEqual([
      'c2',
      'c3',
      'c4',
      'b4',
      'c6',
    ]);
  });

  it('falls back plainly when R2 is absent and reports loaded false', async () => {
    const fake = factories();
    const result = await loadInstrument('vcsl-recorder', {
      context,
      destination: {},
      factories: fake.value,
      samplesBaseUrl: '',
    });
    expect(result.loaded).toBe(false);
    expect(result.reason).toBe(
      'VCSL baroque recorder needs VITE_SAMPLES_BASE_URL; playing Grand piano instead.',
    );
    expect(result.instrument.id).toBe('vcsl-recorder');
    expect(vi.mocked(fake.value.sampler).mock.calls[0]?.[2].samples.baseUrl).toBe(
      '/samples/piano/grand/',
    );
  });

  it('uses the configured immutable sample base for remote instruments', async () => {
    const fake = factories();
    const progress = vi.fn();
    const result = await loadInstrument('electric-piano', {
      context,
      destination: {},
      factories: fake.value,
      samplesBaseUrl: 'https://samples.example/',
      onProgress: progress,
    });
    expect(result.loaded).toBe(true);
    expect(vi.mocked(fake.value.sampler).mock.calls[0]?.[2].samples.baseUrl).toBe(
      'https://samples.example/electric-piano/',
    );
    expect(progress).toHaveBeenNthCalledWith(1, 0);
    expect(progress).toHaveBeenLastCalledWith(1);
  });

  it('resolves drum machines and the two deliberate Tone synth exceptions', async () => {
    const fake = factories();
    await loadInstrument('studio-kit', { context, destination: {}, factories: fake.value });
    await loadInstrument('sub-bass', { context, destination: {}, factories: fake.value });
    await loadInstrument('warm-pad', { context, destination: {}, factories: fake.value });
    expect(fake.value.drumMachine).toHaveBeenCalledTimes(1);
    expect(fake.value.monoSynth).toHaveBeenCalledTimes(1);
    expect(fake.value.polySynth).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown instruments and names MIDI pitches', async () => {
    await expect(
      loadInstrument('missing', { context, destination: {}, factories: factories().value }),
    ).rejects.toThrow('Unknown instrument');
    expect(instrumentPitchName(61)).toBe('C#4');
  });
});
