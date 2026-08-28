import { basename } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseArguments, scenarioPaths, startSelectedDriver } from '../../scripts/e2e.mjs';

describe('parseArguments', () => {
  it('defaults to the local preview build, the MCP driver and every scenario', () => {
    const options = parseArguments([]);
    expect(options).toEqual({
      url: 'http://localhost:4173/',
      driver: 'mcp',
      scenarios: [],
      port: 9333,
      chrome: undefined,
      headless: false,
      keepOpen: false,
      continueOnFailure: false,
      json: undefined,
    });
  });

  it('reads the flags the account documents', () => {
    const options = parseArguments([
      '--url',
      'https://euter.pages.dev',
      '--driver',
      'cdp',
      '--scenario',
      'demo',
      '--scenario',
      'errors',
      '--port',
      '9444',
      '--chrome',
      '/usr/bin/google-chrome',
      '--json',
      'run.json',
      '--headless',
      '--keep-open',
      '--continue',
    ]);
    expect(options.url).toBe('https://euter.pages.dev');
    expect(options.driver).toBe('cdp');
    expect(options.scenarios).toEqual(['demo', 'errors']);
    expect(options.port).toBe(9444);
    expect(options.chrome).toBe('/usr/bin/google-chrome');
    expect(options.json).toBe('run.json');
    expect(options.headless).toBe(true);
    expect(options.keepOpen).toBe(true);
    expect(options.continueOnFailure).toBe(true);
  });

  it('refuses an unknown option and an unknown driver', () => {
    expect(() => parseArguments(['--nope'])).toThrow('Unknown option --nope');
    expect(() => parseArguments(['--driver', 'playwright'])).toThrow('--driver takes mcp or cdp');
  });
});

describe('scenarioPaths', () => {
  it('runs the seven scenarios in the plan’s order by default', () => {
    expect(scenarioPaths([]).map((path) => basename(path, '.json'))).toEqual([
      'demo',
      'hum-intent',
      'errors',
      'stale-revision',
      'recording-lock',
      'take-backing',
      'sample-fallback',
    ]);
  });

  it('keeps the same order for a subset and names what exists on a typo', () => {
    expect(
      scenarioPaths(['recording-lock', 'demo']).map((path) => basename(path, '.json')),
    ).toEqual(['demo', 'recording-lock']);
    expect(() => scenarioPaths(['demoo'])).toThrow(/No scenario "demoo"/);
  });
});

describe('startSelectedDriver', () => {
  it('does not turn a failed MCP start into a green CDP run', async () => {
    const cdp = vi.fn(async () => 'cdp');
    await expect(
      startSelectedDriver('mcp', {
        mcp: async () => {
          throw new Error('missing binary');
        },
        cdp,
      }),
    ).rejects.toThrow(/Run again with --driver cdp/);
    expect(cdp).not.toHaveBeenCalled();
  });
});
