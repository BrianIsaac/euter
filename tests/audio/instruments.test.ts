import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BaseContext } from 'tone';
import {
  createOfflineScheduler,
  firstSampleUrl,
  INSTRUMENT_CATALOGUE,
  instrumentPitchName,
  instrumentsByFamily,
  loadInstrument,
  nativeDestination,
  sampleUrls,
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
  afterEach(() => vi.unstubAllGlobals());

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
      probeRemote: async () => true,
      onProgress: progress,
    });
    expect(result.loaded).toBe(true);
    const preset = vi.mocked(fake.value.sampler).mock.calls[0]?.[2];
    expect(preset).toBeDefined();
    if (!preset) throw new Error('Sampler was not called with a preset.');
    expect(preset.samples.baseUrl).toBe('https://samples.example/electric-piano/');
    expect(preset.groups[0]?.regions.map(({ sample, pitch }) => [sample, pitch])).toEqual([
      ['c2', 48],
      ['c3', 60],
      ['c4', 72],
      ['c5', 84],
    ]);
    expect(progress).toHaveBeenNthCalledWith(1, 0);
    expect(progress).toHaveBeenLastCalledWith(1);
  });

  it('names every sample a remote instrument must fetch', () => {
    const piano = INSTRUMENT_CATALOGUE.find(({ id }) => id === 'electric-piano');
    const kit = INSTRUMENT_CATALOGUE.find(({ id }) => id === 'pocket-kit');
    const synth = INSTRUMENT_CATALOGUE.find(({ id }) => id === 'sub-bass');
    if (!piano || !kit || !synth) throw new Error('The catalogue lost an entry.');
    expect(firstSampleUrl(piano, 'https://samples.example/electric-piano/')).toBe(
      'https://samples.example/electric-piano/c2.ogg',
    );
    expect(sampleUrls(piano, 'https://samples.example/electric-piano/')).toEqual([
      'https://samples.example/electric-piano/c2.ogg',
      'https://samples.example/electric-piano/c3.ogg',
      'https://samples.example/electric-piano/c4.ogg',
      'https://samples.example/electric-piano/c5.ogg',
    ]);
    expect(firstSampleUrl(kit, 'https://samples.example/pocket-kit')).toBe(
      'https://samples.example/pocket-kit/kick.ogg',
    );
    expect(firstSampleUrl(synth, 'https://samples.example/sub-bass')).toBeNull();
  });

  it('substitutes audibly when the sample origin does not serve the instrument', async () => {
    // smplr logs a failed buffer and resolves anyway, so a 404 origin would otherwise be silent
    // with nothing said about it (measured against the deployed site on 28 Aug 2026).
    const fake = factories();
    const probeRemote = vi.fn(async () => false);
    const result = await loadInstrument('electric-piano', {
      context,
      destination: {},
      factories: fake.value,
      samplesBaseUrl: 'https://samples.example',
      probeRemote,
    });

    expect(probeRemote).toHaveBeenCalledWith('https://samples.example/electric-piano/c2.ogg');
    expect(result.loaded).toBe(false);
    expect(result.reason).toBe(
      'Electric piano is not on the sample origin; playing Grand piano instead.',
    );
    expect(vi.mocked(fake.value.sampler)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fake.value.sampler).mock.calls[0]?.[2].samples.baseUrl).toBe(
      '/samples/piano/grand/',
    );
  });

  it('substitutes when any file in a remote instrument is missing', async () => {
    const fake = factories();
    const probeRemote = vi.fn(async (url: string) => !url.endsWith('/c3.ogg'));
    const result = await loadInstrument('electric-piano', {
      context,
      destination: {},
      factories: fake.value,
      samplesBaseUrl: 'https://samples.example',
      probeRemote,
    });

    expect(probeRemote).toHaveBeenCalledTimes(4);
    expect(result.loaded).toBe(false);
    expect(vi.mocked(fake.value.sampler)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fake.value.sampler).mock.calls[0]?.[2].samples.baseUrl).toBe(
      '/samples/piano/grand/',
    );
  });

  it('does not probe the origin for a bundled instrument', async () => {
    const fake = factories();
    const probeRemote = vi.fn(async () => false);
    const result = await loadInstrument('grand-piano', {
      context,
      destination: {},
      factories: fake.value,
      samplesBaseUrl: 'https://samples.example',
      probeRemote,
    });

    expect(probeRemote).not.toHaveBeenCalled();
    expect(result.loaded).toBe(true);
  });

  it('uses the bundled live fallback when a configured remote sample load fails', async () => {
    const fake = factories();
    vi.mocked(fake.value.sampler)
      .mockRejectedValueOnce(new Error('R2 returned 503'))
      .mockResolvedValueOnce(fake.backend);
    const result = await loadInstrument('electric-piano', {
      context,
      destination: {},
      factories: fake.value,
      samplesBaseUrl: 'https://samples.example',
      probeRemote: async () => true,
    });

    expect(result.loaded).toBe(false);
    expect(result.reason).toBe(
      'Failed to load Electric piano: R2 returned 503; playing Grand piano instead.',
    );
    expect(vi.mocked(fake.value.sampler).mock.calls[1]?.[2].samples.baseUrl).toBe(
      '/samples/piano/grand/',
    );
  });

  it('resolves drum machines and the two deliberate Tone synth exceptions', async () => {
    const fake = factories();
    const destination = {};
    const toneContext = {} as BaseContext;
    await loadInstrument('studio-kit', { context, destination: {}, factories: fake.value });
    await loadInstrument('sub-bass', {
      context,
      destination,
      factories: fake.value,
      toneContext,
    });
    await loadInstrument('warm-pad', {
      context,
      destination,
      factories: fake.value,
      toneContext,
    });
    expect(fake.value.drumMachine).toHaveBeenCalledTimes(1);
    expect(fake.value.monoSynth).toHaveBeenCalledWith(destination, toneContext);
    expect(fake.value.polySynth).toHaveBeenCalledWith(destination, toneContext);
  });

  it('dispatches future smplr notes immediately for OfflineAudioContext scheduling', () => {
    const scheduler = createOfflineScheduler();
    const callback = vi.fn();
    const event = { note: 60, time: 12, duration: 1 };

    scheduler.schedule(event, callback);

    expect(callback).toHaveBeenCalledWith(event);
  });

  it('hands sampled offline instruments the immediate scheduler', async () => {
    const fake = factories();
    await loadInstrument('grand-piano', {
      context,
      destination: {},
      factories: fake.value,
      toneContext: {} as BaseContext,
    });

    const scheduler = vi.mocked(fake.value.sampler).mock.calls[0]?.[4];
    const callback = vi.fn();
    scheduler?.schedule({ note: 72, time: 8 }, callback);
    expect(callback).toHaveBeenCalledOnce();
  });

  it('rejects unknown instruments and names MIDI pitches', async () => {
    await expect(
      loadInstrument('missing', { context, destination: {}, factories: factories().value }),
    ).rejects.toThrow('Unknown instrument');
    expect(instrumentPitchName(61)).toBe('C#4');
  });

  it('hands smplr only a native AudioNode, never a connectable Tone wrapper', () => {
    class FakeAudioNode {
      readonly native = true;
    }
    vi.stubGlobal('AudioNode', FakeAudioNode);
    const fallback = new FakeAudioNode() as unknown as AudioNode;
    const native = new FakeAudioNode() as unknown as AudioNode;
    const audioContext = { destination: fallback } as BaseAudioContext;
    const wrapper = {
      input: { connect: vi.fn(), disconnect: vi.fn() },
    };

    expect(nativeDestination({ input: native }, audioContext)).toBe(native);
    expect(nativeDestination(wrapper, audioContext)).toBe(fallback);
  });
});
