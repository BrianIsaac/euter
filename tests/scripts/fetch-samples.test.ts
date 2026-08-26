import { describe, expect, it } from 'vitest';
import { parseArgs, renderSamplesMarkdown, SAMPLE_ASSETS } from '../../scripts/fetch-samples.ts';

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
