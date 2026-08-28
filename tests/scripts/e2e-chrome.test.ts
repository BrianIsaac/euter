import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  armProfile,
  CHROME_CANDIDATES,
  chromeArguments,
  createCdpDriver,
  findChrome,
  interceptHttp404Once,
  removeProfile,
  waitForCdp,
  WEBMCP_SWITCH,
} from '../../scripts/e2e-chrome.mjs';

describe('chromeArguments', () => {
  it('carries the switch the WebMCP testing flag sets, the port, the profile and the URL', () => {
    const args = chromeArguments({
      profileDir: '/tmp/profile',
      port: 9333,
      url: 'https://euter.pages.dev',
    });
    expect(WEBMCP_SWITCH).toBe('--enable-features=WebMCPTesting');
    expect(args[0]).toBe(WEBMCP_SWITCH);
    expect(args).toContain('--remote-debugging-port=9333');
    expect(args).toContain('--user-data-dir=/tmp/profile');
    expect(args).toContain('--use-fake-device-for-media-stream');
    expect(args.at(-1)).toBe('https://euter.pages.dev');
    expect(args).not.toContain('--headless=new');
  });

  it('adds headless and extra switches only when asked', () => {
    const args = chromeArguments({
      profileDir: '/tmp/profile',
      port: 1,
      url: 'about:blank',
      headless: true,
      extra: ['--lang=en-GB'],
    });
    expect(args).toContain('--headless=new');
    expect(args).toContain('--lang=en-GB');
  });
});

describe('armProfile and removeProfile', () => {
  it('writes the flag into Local State so a fresh profile needs no UI', () => {
    const dir = mkdtempSync(join(tmpdir(), 'euter-profile-test-'));
    armProfile(dir);
    expect(JSON.parse(readFileSync(join(dir, 'Local State'), 'utf8'))).toEqual({
      browser: { enabled_labs_experiments: ['enable-webmcp-testing@1'] },
    });
    expect(existsSync(join(dir, 'Default'))).toBe(true);
    removeProfile(dir);
    expect(existsSync(dir)).toBe(false);
    expect(() => removeProfile(dir)).not.toThrow();
  });
});

describe('findChrome', () => {
  it('accepts an existing override and refuses one that is not there', () => {
    const dir = mkdtempSync(join(tmpdir(), 'euter-chrome-test-'));
    const fake = join(dir, 'chrome');
    writeFileSync(fake, '');
    expect(findChrome(fake)).toBe(fake);
    expect(() => findChrome(join(dir, 'absent'))).toThrow(/No Chrome at/);
    removeProfile(dir);
  });

  it('looks in the usual places when no override is given', () => {
    expect(CHROME_CANDIDATES).toContain('/usr/bin/google-chrome');
    const found = CHROME_CANDIDATES.some((candidate) => existsSync(candidate));
    if (found) {
      expect(CHROME_CANDIDATES).toContain(findChrome());
    } else {
      expect(() => findChrome()).toThrow(/No Chrome found/);
    }
  });
});

describe('waitForCdp', () => {
  it('gives up with the last error when nothing answers the port', async () => {
    await expect(waitForCdp(9, 300)).rejects.toThrow(/never answered/);
  });
});

describe('createCdpDriver', () => {
  it('waits on DOM text without losing the source case to CSS text-transform', async () => {
    const listeners = new Map<string, (params: Record<string, unknown>) => void>();
    const page = {
      on(event: string, listener: (params: Record<string, unknown>) => void) {
        listeners.set(event, listener);
        return () => listeners.delete(event);
      },
      async send(method: string, params?: unknown) {
        if (method !== 'Runtime.evaluate') return {};
        const expression = (params as { expression?: string } | undefined)?.expression;
        return {
          result: {
            value: expression?.includes('document.body.textContent') === true,
          },
        };
      },
      close() {},
    };

    const driver = (await createCdpDriver(page)) as {
      waitForText(texts: string[], timeoutMs: number): Promise<void>;
    };
    await expect(driver.waitForText(['Sounds and licences'], 20)).resolves.toBeUndefined();
    expect(listeners.has('WebMCP.toolsAdded')).toBe(true);
  });
});

describe('interceptHttp404Once', () => {
  it('fulfils one matching page request with a CORS-readable HTTP 404', async () => {
    let paused: ((params: Record<string, unknown>) => void) | undefined;
    const calls: { method: string; params?: unknown }[] = [];
    const page = {
      on(event: string, listener: (params: Record<string, unknown>) => void) {
        if (event === 'Fetch.requestPaused') paused = listener;
        return () => {
          paused = undefined;
        };
      },
      async send(method: string, params?: unknown) {
        calls.push({ method, params });
        return {};
      },
    };

    const interception = await interceptHttp404Once(page, '*/vcsl-saxello/d3.ogg');
    paused?.({
      requestId: 'request-1',
      request: {
        url: 'https://samples.example/vcsl-saxello/d3.ogg',
        method: 'HEAD',
      },
    });

    await expect(interception.hit).resolves.toEqual({
      url: 'https://samples.example/vcsl-saxello/d3.ogg',
      method: 'HEAD',
    });
    expect(calls).toContainEqual({
      method: 'Fetch.enable',
      params: {
        patterns: [{ urlPattern: '*/vcsl-saxello/d3.ogg', requestStage: 'Request' }],
      },
    });
    expect(calls).toContainEqual({
      method: 'Fetch.fulfillRequest',
      params: expect.objectContaining({ requestId: 'request-1', responseCode: 404 }),
    });
    expect(calls.at(-1)?.method).toBe('Fetch.disable');
  });
});
