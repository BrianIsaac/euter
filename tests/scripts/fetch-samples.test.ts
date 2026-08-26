import { describe, expect, it } from 'vitest';
import { parseArgs, renderSamplesMarkdown, SAMPLE_ASSETS } from '../../scripts/fetch-samples.ts';
import { INSTRUMENT_CATALOGUE } from '../../src/audio/instruments.ts';

describe('sample fetch manifest', () => {
  it('has a named, licensed upstream source for every catalogue sample', () => {
    expect(new Set(SAMPLE_ASSETS.map(({ instrument }) => instrument))).toEqual(
      new Set([
        'grand-piano',
        'studio-kit',
        'pocket-kit',
        'dusty-kit',
        'electric-piano',
        'vcsl-strings',
        'vcsl-vibraphone',
        'vcsl-recorder',
        'vcsl-saxello',
      ]),
    );
    for (const asset of SAMPLE_ASSETS) {
      expect(asset.source).toBeTruthy();
      expect(asset.sourceUrl).toMatch(/^https:/u);
      expect(['Public domain', 'CC0 1.0']).toContain(asset.licence);
      expect(asset.destination).toMatch(/\.ogg$/u);
    }
  });

  it('matches every sampled loader map to files the workflow prepares', () => {
    for (const instrument of INSTRUMENT_CATALOGUE.filter(({ sample_map }) => sample_map)) {
      const outputs = SAMPLE_ASSETS.filter(({ instrument: id }) => id === instrument.id).map(
        ({ destination }) =>
          destination
            .split('/')
            .at(-1)
            ?.replace(/\.ogg$/u, ''),
      );
      expect(outputs, instrument.id).toEqual(instrument.sample_map?.map(({ sample }) => sample));
      expect(instrument.byte_size).toBeGreaterThan(0);
    }
  });

  it('documents immutable R2 delivery, credentials and the unmodified MPL codec', () => {
    const markdown = renderSamplesMarkdown(SAMPLE_ASSETS);
    expect(markdown).toContain('max-age=31536000, immutable');
    expect(markdown).toContain('R2_SECRET_ACCESS_KEY');
    expect(markdown).toContain('VITE_SAMPLES_BASE_URL');
    expect(markdown).toContain('MPL-2.0');
    expect(markdown).toContain('Salamander/gleitz samples are not');
  });

  it('does not silently combine a local-only run and an upload', () => {
    expect(parseArgs([])).toEqual({ upload: false, bundledOnly: false });
    expect(parseArgs(['--upload'])).toEqual({ upload: true, bundledOnly: false });
    expect(parseArgs(['--bundled-only'])).toEqual({ upload: false, bundledOnly: true });
    expect(parseArgs(['--', '--bundled-only'])).toEqual({ upload: false, bundledOnly: true });
    expect(() => parseArgs(['--upload', '--bundled-only'])).toThrow('cannot be combined');
    expect(() => parseArgs(['--mystery'])).toThrow('Unknown argument');
  });
});
