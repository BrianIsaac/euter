/** Peak and approximate K-weighted RMS readings from an offline PCM pass. */

export interface LoudnessReading {
  peak: number;
  peak_dbfs: number;
  k_weighted_rms: number;
  loudness_dbfs: number;
}

/** Analyses one or more channels of equal-length PCM. */
export function analyseLoudness(
  channels: readonly Float32Array[],
  sampleRate: number,
): LoudnessReading {
  if (sampleRate <= 0) throw new RangeError('Sample rate must be positive.');
  if (channels.length === 0 || channels.every(({ length }) => length === 0)) {
    return { peak: 0, peak_dbfs: -Infinity, k_weighted_rms: 0, loudness_dbfs: -Infinity };
  }
  let peak = 0;
  let squareSum = 0;
  let samples = 0;
  for (const channel of channels) {
    const highPassed = applyBiquad(channel, highPassCoefficients(sampleRate, 38, 0.5));
    const weighted = applyBiquad(highPassed, highShelfCoefficients(sampleRate, 1682, 4));
    for (let index = 0; index < channel.length; index += 1) {
      peak = Math.max(peak, Math.abs(channel[index] ?? 0));
      const value = weighted[index] ?? 0;
      squareSum += value * value;
      samples += 1;
    }
  }
  const rms = Math.sqrt(squareSum / Math.max(1, samples));
  return {
    peak: round(peak),
    peak_dbfs: decibels(peak),
    k_weighted_rms: round(rms),
    loudness_dbfs: decibels(rms),
  };
}

/** Analyses a native AudioBuffer returned by an offline render. */
export function analyseAudioBuffer(buffer: AudioBuffer): LoudnessReading {
  return analyseLoudness(
    Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index)),
    buffer.sampleRate,
  );
}

/** Produces readings per track id from one offline pass per track. */
export function analyseTrackLoudness(
  tracks: Readonly<Record<string, readonly Float32Array[]>>,
  sampleRate: number,
): Record<string, LoudnessReading> {
  return Object.fromEntries(
    Object.entries(tracks).map(([trackId, channels]) => [
      trackId,
      analyseLoudness(channels, sampleRate),
    ]),
  );
}

interface BiquadCoefficients {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function applyBiquad(input: Float32Array, coefficient: BiquadCoefficients): Float32Array {
  const output = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < input.length; index += 1) {
    const x0 = input[index] ?? 0;
    const y0 =
      coefficient.b0 * x0 +
      coefficient.b1 * x1 +
      coefficient.b2 * x2 -
      coefficient.a1 * y1 -
      coefficient.a2 * y2;
    output[index] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return output;
}

function highPassCoefficients(
  sampleRate: number,
  frequency: number,
  quality: number,
): BiquadCoefficients {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const cosine = Math.cos(omega);
  const alpha = Math.sin(omega) / (2 * quality);
  const a0 = 1 + alpha;
  return {
    b0: (1 + cosine) / 2 / a0,
    b1: -(1 + cosine) / a0,
    b2: (1 + cosine) / 2 / a0,
    a1: (-2 * cosine) / a0,
    a2: (1 - alpha) / a0,
  };
}

function highShelfCoefficients(
  sampleRate: number,
  frequency: number,
  gainDb: number,
): BiquadCoefficients {
  const amplitude = 10 ** (gainDb / 40);
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const cosine = Math.cos(omega);
  const sine = Math.sin(omega);
  const alpha = (sine / 2) * Math.SQRT2;
  const beta = 2 * Math.sqrt(amplitude) * alpha;
  const a0 = amplitude + 1 - (amplitude - 1) * cosine + beta;
  return {
    b0: (amplitude * (amplitude + 1 + (amplitude - 1) * cosine + beta)) / a0,
    b1: (-2 * amplitude * (amplitude - 1 + (amplitude + 1) * cosine)) / a0,
    b2: (amplitude * (amplitude + 1 + (amplitude - 1) * cosine - beta)) / a0,
    a1: (2 * (amplitude - 1 - (amplitude + 1) * cosine)) / a0,
    a2: (amplitude + 1 - (amplitude - 1) * cosine - beta) / a0,
  };
}

function decibels(value: number): number {
  return value <= 0 ? -Infinity : round(20 * Math.log10(value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
