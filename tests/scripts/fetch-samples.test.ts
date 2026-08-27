import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, truncate, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseArgs,
  renderSamplesMarkdown,
  SAMPLE_ASSETS,
  uploadPlan,
  type SampleManifest,
} from '../../scripts/fetch-samples.ts';
import { INSTRUMENT_CATALOGUE } from '../../src/audio/instruments.ts';

const root = path.resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(
  readFileSync(path.join(root, 'SAMPLES.manifest.json'), 'utf8'),
) as SampleManifest;

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
    expect(manifest).toMatchObject({ version: 1, codec: 'Opus in Ogg' });
    expect(manifest.assets).toHaveLength(SAMPLE_ASSETS.length);
    for (const instrument of INSTRUMENT_CATALOGUE.filter(({ engine }) =>
      engine.startsWith('smplr-'),
    )) {
      const assets = manifest.assets.filter(({ instrument: id }) => id === instrument.id);
      const outputs = assets.map(({ destination }) =>
        destination
          .split('/')
          .at(-1)
          ?.replace(/\.ogg$/u, ''),
      );
      const expected =
        instrument.sample_map?.map(({ sample }) => sample) ?? instrument.sample_files;
      expect(outputs, instrument.id).toEqual(expected);
      expect(assets.reduce((total, { bytes }) => total + bytes, 0)).toBe(instrument.byte_size);
      for (const asset of assets) {
        if (asset.bundled) {
          expect(asset.path).toMatch(/^public\/samples\/(?:piano\/grand|drums\/studio-kit)\//u);
        } else {
          expect(asset.path).toBe(`samples-dist/${asset.destination}`);
        }
        const file = path.join(root, asset.path);
        if (asset.bundled || existsSync(path.join(root, 'samples-dist'))) {
          const bytes = readFileSync(file);
          expect(bytes.byteLength, asset.path).toBe(asset.bytes);
          expect(createHash('sha256').update(bytes).digest('hex'), asset.path).toBe(asset.sha256);
        }
      }
    }
  });

  it('documents immutable R2 delivery, credentials and the unmodified MPL codec', () => {
    const markdown = renderSamplesMarkdown(SAMPLE_ASSETS, manifest);
    expect(markdown).toContain('max-age=31536000, immutable');
    expect(markdown).toContain('R2_SECRET_ACCESS_KEY');
    expect(markdown).toContain('VITE_SAMPLES_BASE_URL');
    expect(markdown).toContain('MPL-2.0');
    expect(markdown).toContain('Salamander/gleitz samples are not');
    expect(markdown).toContain('447,103 B');
    expect(markdown).toContain('1,398,573 B');
  });

  it('does not silently combine a local-only run and an upload', () => {
    expect(parseArgs([])).toEqual({ upload: false, bundledOnly: false, dryRun: false });
    expect(parseArgs(['--upload'])).toEqual({ upload: true, bundledOnly: false, dryRun: false });
    expect(parseArgs(['--dry-run'])).toEqual({ upload: false, bundledOnly: false, dryRun: true });
    expect(parseArgs(['--bundled-only'])).toEqual({
      upload: false,
      bundledOnly: true,
      dryRun: false,
    });
    expect(parseArgs(['--', '--bundled-only'])).toEqual({
      upload: false,
      bundledOnly: true,
      dryRun: false,
    });
    expect(() => parseArgs(['--upload', '--bundled-only'])).toThrow('cannot be combined');
    expect(() => parseArgs(['--upload', '--dry-run'])).toThrow('cannot be combined');
    expect(() => parseArgs(['--mystery'])).toThrow('Unknown argument');
  });

  it('walks a deterministic upload plan and refuses more than 1 GB before S3', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'euter-samples-'));
    try {
      await mkdir(path.join(directory, 'keys'), { recursive: true });
      await writeFile(path.join(directory, 'keys', 'c4.ogg'), new Uint8Array([1, 2, 3]));
      await writeFile(path.join(directory, 'kick.ogg'), new Uint8Array([4, 5]));
      await expect(uploadPlan(directory)).resolves.toEqual([
        { key: 'keys/c4.ogg', bytes: 3 },
        { key: 'kick.ogg', bytes: 2 },
      ]);

      const tooLarge = path.join(directory, 'too-large.ogg');
      await writeFile(tooLarge, new Uint8Array());
      await truncate(tooLarge, 1_000_000_001);
      await expect(uploadPlan(directory)).rejects.toThrow('1 GB safety ceiling');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
