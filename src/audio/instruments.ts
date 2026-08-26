/** Lazy instrument catalogue, loaders and sample licences (plan Decision 3). */
import type { SmplrPreset } from 'smplr';
import { Midi } from 'tonal';

export type InstrumentFamily = 'keys' | 'drums' | 'strings' | 'mallets' | 'brass-winds' | 'synth';
export type InstrumentEngine =
  'smplr-sampler' | 'smplr-drum-machine' | 'tone-monosynth' | 'tone-polysynth';

export interface InstrumentLicence {
  source: string;
  licence: 'Public domain' | 'CC0 1.0' | 'CC BY 3.0' | 'MIT';
  url: string;
  attribution: string | null;
}

export interface AudioInstrument {
  readonly id: string;
  trigger(pitch: number, time: number, duration: number, velocity: number): void;
  dispose(): void;
}

export interface InstrumentLoadResult {
  instrument: AudioInstrument;
  /** False means a bundled fallback is sounding while the requested R2 asset is unavailable. */
  loaded: boolean;
  reason?: string | undefined;
}

export interface InstrumentLoadRequest {
  context: BaseAudioContext;
  destination: unknown;
  samplesBaseUrl?: string | undefined;
  onProgress?: ((progress: number) => void) | undefined;
  factories?: InstrumentFactories | undefined;
}

export interface InstrumentBackend {
  trigger(pitch: number, time: number, duration: number, velocity: number): void;
  dispose(): void;
}

export interface InstrumentFactories {
  sampler(
    context: BaseAudioContext,
    destination: unknown,
    preset: SmplrPreset,
    onProgress: (progress: number) => void,
  ): Promise<InstrumentBackend>;
  drumMachine(
    context: BaseAudioContext,
    destination: unknown,
    baseUrl: string,
    onProgress: (progress: number) => void,
  ): Promise<InstrumentBackend>;
  monoSynth(destination: unknown): Promise<InstrumentBackend>;
  polySynth(destination: unknown): Promise<InstrumentBackend>;
}

interface InstrumentDefinition {
  id: string;
  name: string;
  family: InstrumentFamily;
  engine: InstrumentEngine;
  bundled: boolean;
  byte_size: number;
  licence: InstrumentLicence;
  sample_profile?: 'piano' | 'orchestral';
  fallback_id?: string;
}

export interface InstrumentCatalogueEntry extends InstrumentDefinition {
  loader: (request: InstrumentLoadRequest) => Promise<InstrumentLoadResult>;
}

const PUBLIC_DOMAIN_PIANO: InstrumentLicence = {
  source: 'Splendid Grand Piano samples, released by Akai and distributed by smpldsnds',
  licence: 'Public domain',
  url: 'https://github.com/sfzinstruments/SplendidGrandPiano',
  attribution: null,
};

const PUBLIC_DOMAIN_DRUMS: InstrumentLicence = {
  source: 'smpldsnds classic drum-machine samples',
  licence: 'Public domain',
  url: 'https://github.com/smpldsnds/drum-machines',
  attribution: null,
};

const VCSL_CC0: InstrumentLicence = {
  source: 'Versilian Community Sample Library',
  licence: 'CC0 1.0',
  url: 'https://github.com/sgossner/VCSL',
  attribution: null,
};

const TONE_MIT: InstrumentLicence = {
  source: 'Tone.js synthesiser engine',
  licence: 'MIT',
  url: 'https://github.com/Tonejs/Tone.js',
  attribution: 'Tone.js contributors',
};

const DEFINITIONS: readonly InstrumentDefinition[] = [
  {
    id: 'grand-piano',
    name: 'Grand piano',
    family: 'keys',
    engine: 'smplr-sampler',
    bundled: true,
    byte_size: 620_000,
    licence: PUBLIC_DOMAIN_PIANO,
    sample_profile: 'piano',
  },
  {
    id: 'electric-piano',
    name: 'Electric piano',
    family: 'keys',
    engine: 'smplr-sampler',
    bundled: false,
    byte_size: 1_200_000,
    licence: VCSL_CC0,
    sample_profile: 'piano',
    fallback_id: 'grand-piano',
  },
  {
    id: 'studio-kit',
    name: 'Studio kit',
    family: 'drums',
    engine: 'smplr-drum-machine',
    bundled: true,
    byte_size: 90_000,
    licence: PUBLIC_DOMAIN_DRUMS,
  },
  {
    id: 'pocket-kit',
    name: 'Pocket kit',
    family: 'drums',
    engine: 'smplr-drum-machine',
    bundled: false,
    byte_size: 180_000,
    licence: PUBLIC_DOMAIN_DRUMS,
    fallback_id: 'studio-kit',
  },
  {
    id: 'dusty-kit',
    name: 'Dusty kit',
    family: 'drums',
    engine: 'smplr-drum-machine',
    bundled: false,
    byte_size: 210_000,
    licence: PUBLIC_DOMAIN_DRUMS,
    fallback_id: 'studio-kit',
  },
  {
    id: 'vcsl-strings',
    name: 'VCSL strings',
    family: 'strings',
    engine: 'smplr-sampler',
    bundled: false,
    byte_size: 4_200_000,
    licence: VCSL_CC0,
    sample_profile: 'orchestral',
    fallback_id: 'grand-piano',
  },
  {
    id: 'vcsl-vibraphone',
    name: 'VCSL vibraphone',
    family: 'mallets',
    engine: 'smplr-sampler',
    bundled: false,
    byte_size: 2_100_000,
    licence: VCSL_CC0,
    sample_profile: 'orchestral',
    fallback_id: 'grand-piano',
  },
  {
    id: 'vcsl-recorder',
    name: 'VCSL baroque recorder',
    family: 'brass-winds',
    engine: 'smplr-sampler',
    bundled: false,
    byte_size: 2_800_000,
    licence: VCSL_CC0,
    sample_profile: 'orchestral',
    fallback_id: 'grand-piano',
  },
  {
    id: 'vcsl-saxello',
    name: 'VCSL saxello',
    family: 'brass-winds',
    engine: 'smplr-sampler',
    bundled: false,
    byte_size: 3_100_000,
    licence: VCSL_CC0,
    sample_profile: 'orchestral',
    fallback_id: 'grand-piano',
  },
  {
    id: 'sub-bass',
    name: 'Sub bass',
    family: 'synth',
    engine: 'tone-monosynth',
    bundled: true,
    byte_size: 0,
    licence: TONE_MIT,
  },
  {
    id: 'warm-pad',
    name: 'Warm pad',
    family: 'synth',
    engine: 'tone-polysynth',
    bundled: true,
    byte_size: 0,
    licence: TONE_MIT,
  },
];

export const INSTRUMENT_CATALOGUE: readonly InstrumentCatalogueEntry[] = DEFINITIONS.map(
  (definition) => ({
    ...definition,
    loader: (request) => loadInstrument(definition.id, request),
  }),
);

/** Groups the catalogue for `get_song_state` and the instrument chooser. */
export function instrumentsByFamily(): Record<InstrumentFamily, string[]> {
  return Object.fromEntries(
    (['keys', 'drums', 'strings', 'mallets', 'brass-winds', 'synth'] as const).map((family) => [
      family,
      INSTRUMENT_CATALOGUE.filter((entry) => entry.family === family).map(({ id }) => id),
    ]),
  ) as Record<InstrumentFamily, string[]>;
}

/** Loads an instrument, falling back audibly to the bundled subset when R2 is not configured. */
export async function loadInstrument(
  id: string,
  request: InstrumentLoadRequest,
): Promise<InstrumentLoadResult> {
  const entry = INSTRUMENT_CATALOGUE.find((candidate) => candidate.id === id);
  if (!entry) throw new RangeError(`Unknown instrument "${id}".`);
  const factories = request.factories ?? DEFAULT_FACTORIES;
  const configuredBase = request.samplesBaseUrl ?? import.meta.env.VITE_SAMPLES_BASE_URL;

  if (!entry.bundled && !configuredBase) {
    const fallback = INSTRUMENT_CATALOGUE.find(
      ({ id: candidate }) => candidate === entry.fallback_id,
    );
    if (!fallback) throw new Error(`Instrument "${id}" has no bundled fallback.`);
    const backend = await createBackend(fallback, request, factories, bundledBase(fallback));
    return {
      instrument: wrapInstrument(id, backend),
      loaded: false,
      reason: `${entry.name} needs VITE_SAMPLES_BASE_URL; playing ${fallback.name} instead.`,
    };
  }

  const baseUrl = entry.bundled
    ? bundledBase(entry)
    : `${trimSlash(configuredBase ?? '')}/${entry.id}`;
  const backend = await createBackend(entry, request, factories, baseUrl);
  return { instrument: wrapInstrument(id, backend), loaded: true };
}

async function createBackend(
  entry: InstrumentCatalogueEntry,
  request: InstrumentLoadRequest,
  factories: InstrumentFactories,
  baseUrl: string,
): Promise<InstrumentBackend> {
  const progress = request.onProgress ?? (() => undefined);
  progress(0);
  if (entry.engine === 'tone-monosynth') {
    const backend = await factories.monoSynth(request.destination);
    progress(1);
    return backend;
  }
  if (entry.engine === 'tone-polysynth') {
    const backend = await factories.polySynth(request.destination);
    progress(1);
    return backend;
  }
  if (entry.engine === 'smplr-drum-machine') {
    const backend = await factories.drumMachine(
      request.context,
      request.destination,
      baseUrl,
      progress,
    );
    progress(1);
    return backend;
  }
  const preset = samplePreset(baseUrl, entry.sample_profile ?? 'orchestral');
  const backend = await factories.sampler(request.context, request.destination, preset, progress);
  progress(1);
  return backend;
}

function samplePreset(baseUrl: string, profile: 'piano' | 'orchestral'): SmplrPreset {
  const roots = profile === 'piano' ? [48, 60, 72, 83, 96] : [48, 60, 72, 84];
  const names = profile === 'piano' ? ['c2', 'c3', 'c4', 'b4', 'c6'] : ['c2', 'c3', 'c4', 'c5'];
  return {
    meta: { name: profile, license: profile === 'piano' ? 'Public domain' : 'CC0 1.0' },
    samples: { baseUrl: `${trimSlash(baseUrl)}/`, formats: ['ogg'] },
    groups: [
      {
        regions: roots.map((pitch, index) => ({
          sample: names[index] ?? 'c4',
          pitch,
          keyRange: [
            index === 0 ? 24 : Math.floor(((roots[index - 1] ?? pitch) + pitch) / 2) + 1,
            index === roots.length - 1
              ? 108
              : Math.floor((pitch + (roots[index + 1] ?? pitch)) / 2),
          ],
        })),
      },
    ],
  };
}

function bundledBase(entry: InstrumentDefinition): string {
  return entry.family === 'drums' ? '/samples/drums/studio-kit' : '/samples/piano/grand';
}

function wrapInstrument(id: string, backend: InstrumentBackend): AudioInstrument {
  return {
    id,
    trigger: backend.trigger,
    dispose: backend.dispose,
  };
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}

const DEFAULT_FACTORIES: InstrumentFactories = {
  async sampler(context, destination, preset, onProgress) {
    const { Sampler } = await import('smplr');
    const instrument = Sampler(context, {
      preset,
      destination: nativeDestination(destination, context),
      onLoadProgress: ({ loaded, total }) => onProgress(total === 0 ? 1 : loaded / total),
    });
    await instrument.ready;
    return {
      trigger: (pitch, time, duration, velocity) => {
        instrument.start({ note: pitch, time, duration, velocity: Math.round(velocity * 127) });
      },
      dispose: () => instrument.dispose(),
    };
  },
  async drumMachine(context, destination, baseUrl, onProgress) {
    const { DrumMachine } = await import('smplr');
    const samples = ['kick', 'snare', 'closed_hat', 'open_hat'];
    const instrument = DrumMachine(context, {
      instrument: {
        baseUrl: `${trimSlash(baseUrl)}/`,
        name: 'euter-kit',
        samples,
        groupNames: samples,
        nameToSampleName: Object.fromEntries(samples.map((name) => [name, name])),
        sampleGroupVariations: Object.fromEntries(samples.map((name) => [name, [name]])),
      },
      destination: nativeDestination(destination, context),
      onLoadProgress: ({ loaded, total }) => onProgress(total === 0 ? 1 : loaded / total),
    });
    await instrument.ready;
    const drumName = (pitch: number): string =>
      ({ 36: 'kick', 38: 'snare', 42: 'closed_hat', 46: 'open_hat' })[pitch] ?? 'closed_hat';
    return {
      trigger: (pitch, time, duration, velocity) => {
        instrument.start({
          note: drumName(pitch),
          time,
          duration,
          velocity: Math.round(velocity * 127),
        });
      },
      dispose: () => instrument.dispose(),
    };
  },
  async monoSynth(destination) {
    const tone = await import('tone');
    const instrument = new tone.MonoSynth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.18, sustain: 0.55, release: 0.45 },
      filterEnvelope: {
        attack: 0.01,
        decay: 0.2,
        sustain: 0.35,
        release: 0.4,
        baseFrequency: 90,
        octaves: 2,
      },
    });
    connectToneInstrument(instrument, destination);
    return toneBackend(instrument, tone);
  },
  async polySynth(destination) {
    const tone = await import('tone');
    const instrument = new tone.PolySynth(tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.18, decay: 0.4, sustain: 0.58, release: 1.8 },
    });
    connectToneInstrument(instrument, destination);
    return toneBackend(instrument, tone);
  },
};

function toneBackend(
  instrument: unknown,
  tone: { Frequency(value: number, units: 'midi'): { toNote(): string } },
): InstrumentBackend {
  const playable = instrument as {
    triggerAttackRelease(note: string, duration: number, time: number, velocity: number): void;
    dispose(): void;
  };
  return {
    trigger: (pitch, time, duration, velocity) => {
      playable.triggerAttackRelease(
        tone.Frequency(pitch, 'midi').toNote(),
        duration,
        time,
        velocity,
      );
    },
    dispose: () => playable.dispose(),
  };
}

function connectToneInstrument(instrument: unknown, destination: unknown): void {
  const connectable = instrument as { connect(target: unknown): unknown };
  connectable.connect(destination);
}

function nativeDestination(destination: unknown, context: BaseAudioContext): AudioNode {
  let current = destination;
  const seen = new Set<unknown>();
  while (
    typeof current === 'object' &&
    current !== null &&
    'input' in current &&
    !seen.has(current)
  ) {
    seen.add(current);
    const next = (current as { input: unknown }).input;
    if (next === current) break;
    current = next;
  }
  if (
    typeof current === 'object' &&
    current !== null &&
    'connect' in current &&
    'disconnect' in current
  ) {
    return current as AudioNode;
  }
  return context.destination;
}

/** Converts a catalogue pitch to a display note without importing Tone. */
export function instrumentPitchName(pitch: number): string {
  return Midi.midiToNoteName(pitch, { sharps: true });
}
