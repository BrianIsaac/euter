/** Lazy instrument catalogue, loaders and sample licences (plan Decision 3). */
import type { Scheduler as SmplrScheduler, SmplrOptions, SmplrPreset } from 'smplr';
import type { BaseContext } from 'tone';
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

export type SampleProbeOutcome = 'present' | 'absent' | 'unavailable' | 'network-error';
export type SampleProbe = (url: string) => Promise<SampleProbeOutcome>;

export interface InstrumentLoadRequest {
  context: BaseAudioContext;
  destination: unknown;
  samplesBaseUrl?: string | undefined;
  onProgress?: ((progress: number) => void) | undefined;
  factories?: InstrumentFactories | undefined;
  /** Explicit Tone context for offline synth construction; live callers use Tone's active context. */
  toneContext?: BaseContext | undefined;
  /** Classifies a sample URL; the default is a retrying, session-cached `HEAD` request. */
  probeRemote?: SampleProbe | undefined;
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
    scheduler?: SmplrScheduler,
  ): Promise<InstrumentBackend>;
  drumMachine(
    context: BaseAudioContext,
    destination: unknown,
    baseUrl: string,
    onProgress: (progress: number) => void,
    scheduler?: SmplrScheduler,
  ): Promise<InstrumentBackend>;
  monoSynth(destination: unknown, toneContext?: BaseContext): Promise<InstrumentBackend>;
  polySynth(destination: unknown, toneContext?: BaseContext): Promise<InstrumentBackend>;
}

interface InstrumentDefinition {
  id: string;
  name: string;
  family: InstrumentFamily;
  engine: InstrumentEngine;
  bundled: boolean;
  byte_size: number;
  licence: InstrumentLicence;
  sample_map?: readonly { sample: string; pitch: number }[];
  sample_files?: readonly string[];
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
    byte_size: 436_889,
    licence: PUBLIC_DOMAIN_PIANO,
    sample_map: [
      { sample: 'c2', pitch: 48 },
      { sample: 'c3', pitch: 60 },
      { sample: 'c4', pitch: 72 },
      { sample: 'b4', pitch: 83 },
      { sample: 'c6', pitch: 96 },
    ],
  },
  {
    id: 'electric-piano',
    name: 'Electric piano',
    family: 'keys',
    engine: 'smplr-sampler',
    bundled: false,
    byte_size: 274_004,
    licence: VCSL_CC0,
    sample_map: [
      { sample: 'c2', pitch: 48 },
      { sample: 'c3', pitch: 60 },
      { sample: 'c4', pitch: 72 },
      { sample: 'c5', pitch: 84 },
    ],
    fallback_id: 'grand-piano',
  },
  {
    id: 'studio-kit',
    name: 'Studio kit',
    family: 'drums',
    engine: 'smplr-drum-machine',
    bundled: true,
    byte_size: 10_214,
    licence: PUBLIC_DOMAIN_DRUMS,
    sample_files: ['kick', 'snare', 'closed_hat', 'open_hat'],
  },
  {
    id: 'pocket-kit',
    name: 'Pocket kit',
    family: 'drums',
    engine: 'smplr-drum-machine',
    bundled: false,
    byte_size: 9_413,
    licence: PUBLIC_DOMAIN_DRUMS,
    sample_files: ['kick', 'snare', 'closed_hat', 'open_hat'],
    fallback_id: 'studio-kit',
  },
  {
    id: 'dusty-kit',
    name: 'Dusty kit',
    family: 'drums',
    engine: 'smplr-drum-machine',
    bundled: false,
    byte_size: 9_730,
    licence: PUBLIC_DOMAIN_DRUMS,
    sample_files: ['kick', 'snare', 'closed_hat', 'open_hat'],
    fallback_id: 'studio-kit',
  },
  {
    id: 'vcsl-strings',
    name: 'VCSL strings',
    family: 'strings',
    engine: 'smplr-sampler',
    bundled: false,
    byte_size: 290_792,
    licence: VCSL_CC0,
    sample_map: [
      { sample: 'c4', pitch: 72 },
      { sample: 'c5', pitch: 84 },
    ],
    fallback_id: 'grand-piano',
  },
  {
    id: 'vcsl-vibraphone',
    name: 'VCSL vibraphone',
    family: 'mallets',
    engine: 'smplr-sampler',
    bundled: false,
    byte_size: 188_865,
    licence: VCSL_CC0,
    sample_map: [
      { sample: 'c3', pitch: 60 },
      { sample: 'c5', pitch: 84 },
    ],
    fallback_id: 'grand-piano',
  },
  {
    id: 'vcsl-recorder',
    name: 'VCSL baroque recorder',
    family: 'brass-winds',
    engine: 'smplr-sampler',
    bundled: false,
    byte_size: 358_323,
    licence: VCSL_CC0,
    sample_map: [
      { sample: 'c4', pitch: 72 },
      { sample: 'c5', pitch: 84 },
    ],
    fallback_id: 'grand-piano',
  },
  {
    id: 'vcsl-saxello',
    name: 'VCSL saxello',
    family: 'brass-winds',
    engine: 'smplr-sampler',
    bundled: false,
    byte_size: 267_446,
    licence: VCSL_CC0,
    sample_map: [
      { sample: 'd3', pitch: 62 },
      { sample: 'd4', pitch: 74 },
      { sample: 'e5', pitch: 88 },
    ],
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

const PROBE_RETRY_DELAYS_MS = [250, 1_000, 2_500] as const;
const probeCaches = new WeakMap<SampleProbe, Map<string, Promise<SampleProbeOutcome>>>();
let probeQueue: Promise<void> = Promise.resolve();

/** True when a reducer/UI instrument name resolves to a real catalogue loader. */
export function isKnownInstrument(id: string): boolean {
  return INSTRUMENT_CATALOGUE.some((entry) => entry.id === id);
}

/** Groups the catalogue for `get_song_state` and the instrument chooser. */
export function instrumentsByFamily(): Record<InstrumentFamily, string[]> {
  return Object.fromEntries(
    (['keys', 'drums', 'strings', 'mallets', 'brass-winds', 'synth'] as const).map((family) => [
      family,
      INSTRUMENT_CATALOGUE.filter((entry) => entry.family === family).map(({ id }) => id),
    ]),
  ) as Record<InstrumentFamily, string[]>;
}

/**
 * The first sample file a remote instrument fetches.
 *
 * @param entry - The catalogue entry.
 * @param baseUrl - The instrument's remote base, already including its id.
 * @returns The URL, or null when the entry names no sample file.
 */
export function firstSampleUrl(entry: InstrumentCatalogueEntry, baseUrl: string): string | null {
  return sampleUrls(entry, baseUrl)[0] ?? null;
}

/** Every sample URL smplr must decode before this instrument can sound across its full range. */
export function sampleUrls(entry: InstrumentCatalogueEntry, baseUrl: string): string[] {
  const samples = entry.sample_map?.map(({ sample }) => sample) ?? entry.sample_files ?? [];
  return samples.map((sample) => `${trimSlash(baseUrl)}/${sample}.ogg`);
}

/** Lets Web Audio schedule future offline sources before rendering starts. */
export function createOfflineScheduler(): SmplrScheduler {
  return {
    schedule(event, callback) {
      callback(event);
      return () => undefined;
    },
    stop() {
      // All events are handed directly to OfflineAudioContext; no polling queue exists.
    },
  };
}

/**
 * Asks the sample origin for one file's headers.
 *
 * The R2 CORS policy allows `GET` and `HEAD` from this origin (hosting setup, step 3), so each
 * `HEAD` costs one Class B operation and no response-body bytes.
 *
 * @param url - The sample URL.
 * Only 404 and 410 establish that an object is absent. Refusals and server failures say
 * nothing about the object, while a network failure remains distinct from an HTTP response.
 *
 * @returns The status-aware outcome of the request.
 */
async function headProbe(url: string): Promise<SampleProbeOutcome> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (response.ok) return 'present';
    if (response.status === 404 || response.status === 410) return 'absent';
    return 'unavailable';
  } catch {
    return 'network-error';
  }
}

function isRetryableProbeOutcome(outcome: SampleProbeOutcome): boolean {
  return outcome === 'unavailable' || outcome === 'network-error';
}

async function probeWithBackoff(url: string, probe: SampleProbe): Promise<SampleProbeOutcome> {
  let outcome: SampleProbeOutcome = 'network-error';
  for (let attempt = 0; attempt <= PROBE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      outcome = await probe(url);
    } catch {
      // An injected probe can throw just as fetch can. It still proves no fact about presence.
      outcome = 'network-error';
    }
    if (!isRetryableProbeOutcome(outcome)) return outcome;
    const delay = PROBE_RETRY_DELAYS_MS[attempt];
    if (delay !== undefined) await wait(delay);
  }
  return outcome;
}

function cachedProbe(url: string, probe: SampleProbe): Promise<SampleProbeOutcome> {
  let cache = probeCaches.get(probe);
  if (!cache) {
    cache = new Map();
    probeCaches.set(probe, cache);
  }
  const cached = cache.get(url);
  if (cached) return cached;

  // Offline rendering loads tracks concurrently. One module-wide queue prevents those callers
  // from recreating the per-instrument fan-out against the same rate-limited origin.
  const pending = probeQueue.then(
    () => probeWithBackoff(url, probe),
    () => probeWithBackoff(url, probe),
  );
  probeQueue = pending.then(
    () => undefined,
    () => undefined,
  );
  cache.set(url, pending);
  return pending;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

  /**
   * Loads the bundled substitute and says which instrument is sounding in whose place.
   *
   * @param reason - Half a sentence naming why the requested instrument is unavailable.
   * @returns The fallback load result.
   */
  const substitute = async (reason: string): Promise<InstrumentLoadResult> => {
    const fallback = INSTRUMENT_CATALOGUE.find(
      ({ id: candidate }) => candidate === entry.fallback_id,
    );
    if (!fallback) throw new Error(`Instrument "${id}" has no bundled fallback.`);
    const backend = await createBackend(fallback, request, factories, bundledBase(fallback));
    return {
      instrument: wrapInstrument(id, backend),
      loaded: false,
      reason: `${reason}; playing ${fallback.name} instead.`,
    };
  };

  if (!entry.bundled && !configuredBase) {
    return substitute(`${entry.name} needs VITE_SAMPLES_BASE_URL`);
  }

  const baseUrl = entry.bundled
    ? bundledBase(entry)
    : `${trimSlash(configuredBase ?? '')}/${entry.id}`;

  if (!entry.bundled) {
    // smplr's loaders log a failed buffer and resolve anyway, so every expected object is checked
    // before the loader sees the pack; otherwise an absent or partial upload leaves a silent range
    // with no notice. Measured on 28 Aug against the deployed site while the remote half of the
    // pack was still not uploaded.
    const urls = sampleUrls(entry, baseUrl);
    const probe = request.probeRemote ?? headProbe;
    const outcomes: SampleProbeOutcome[] = [];
    for (const url of urls) {
      const outcome = await cachedProbe(url, probe);
      outcomes.push(outcome);
      if (isRetryableProbeOutcome(outcome)) break;
    }

    const absent = outcomes.filter((outcome) => outcome === 'absent').length;
    if (absent > 0) {
      const reason =
        absent === urls.length
          ? `${entry.name} is not on the sample origin`
          : `${entry.name}'s sample origin is incomplete`;
      return substitute(reason);
    }
  }

  try {
    const backend = await createBackend(entry, request, factories, baseUrl);
    return { instrument: wrapInstrument(id, backend), loaded: true };
  } catch (error) {
    if (entry.bundled) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    return substitute(`Failed to load ${entry.name}: ${detail}`);
  }
}

async function createBackend(
  entry: InstrumentCatalogueEntry,
  request: InstrumentLoadRequest,
  factories: InstrumentFactories,
  baseUrl: string,
): Promise<InstrumentBackend> {
  const progress = request.onProgress ?? (() => undefined);
  const scheduler = request.toneContext === undefined ? undefined : createOfflineScheduler();
  progress(0);
  if (entry.engine === 'tone-monosynth') {
    const backend = await factories.monoSynth(request.destination, request.toneContext);
    progress(1);
    return backend;
  }
  if (entry.engine === 'tone-polysynth') {
    const backend = await factories.polySynth(request.destination, request.toneContext);
    progress(1);
    return backend;
  }
  if (entry.engine === 'smplr-drum-machine') {
    const backend = await factories.drumMachine(
      request.context,
      request.destination,
      baseUrl,
      progress,
      scheduler,
    );
    progress(1);
    return backend;
  }
  if (!entry.sample_map) throw new Error(`Sample instrument "${entry.id}" has no explicit map.`);
  const preset = samplePreset(baseUrl, entry);
  const backend = await factories.sampler(
    request.context,
    request.destination,
    preset,
    progress,
    scheduler,
  );
  progress(1);
  return backend;
}

function samplePreset(baseUrl: string, entry: InstrumentCatalogueEntry): SmplrPreset {
  const regions = entry.sample_map ?? [];
  return {
    meta: { name: entry.id, license: entry.licence.licence },
    samples: { baseUrl: `${trimSlash(baseUrl)}/`, formats: ['ogg'] },
    groups: [
      {
        regions: regions.map(({ sample, pitch }, index) => ({
          sample,
          pitch,
          keyRange: [
            index === 0 ? 24 : Math.floor(((regions[index - 1]?.pitch ?? pitch) + pitch) / 2) + 1,
            index === regions.length - 1
              ? 108
              : Math.floor((pitch + (regions[index + 1]?.pitch ?? pitch)) / 2),
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
  async sampler(context, destination, preset, onProgress, scheduler) {
    const { Sampler } = await import('smplr');
    const instrument = Sampler(context, {
      preset,
      destination: nativeDestination(destination, context),
      onLoadProgress: ({ loaded, total }) => onProgress(total === 0 ? 1 : loaded / total),
      ...(scheduler === undefined ? {} : { scheduler }),
    } as Parameters<typeof Sampler>[1] & Pick<SmplrOptions, 'scheduler'>);
    await instrument.ready;
    return {
      trigger: (pitch, time, duration, velocity) => {
        instrument.start({ note: pitch, time, duration, velocity: Math.round(velocity * 127) });
      },
      dispose: () => instrument.dispose(),
    };
  },
  async drumMachine(context, destination, baseUrl, onProgress, scheduler) {
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
      ...(scheduler === undefined ? {} : { scheduler }),
    } as Parameters<typeof DrumMachine>[1] & Pick<SmplrOptions, 'scheduler'>);
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
  async monoSynth(destination, toneContext) {
    const tone = await import('tone');
    const instrument = new tone.MonoSynth({
      ...(toneContext === undefined ? {} : { context: toneContext }),
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
  async polySynth(destination, toneContext) {
    const tone = await import('tone');
    const instrument = new tone.PolySynth(tone.Synth, {
      ...(toneContext === undefined ? {} : { context: toneContext }),
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

export function nativeDestination(destination: unknown, context: BaseAudioContext): AudioNode {
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
  if (typeof AudioNode !== 'undefined' && current instanceof AudioNode) return current;
  return context.destination;
}

/** Converts a catalogue pitch to a display note without importing Tone. */
export function instrumentPitchName(pitch: number): string {
  return Midi.midiToNoteName(pitch, { sharps: true });
}
