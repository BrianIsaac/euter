/**
 * Chrome for the end-to-end harness: a throwaway profile pre-armed with the WebMCP flag, a
 * small CDP client for browser-level control, and the CDP `WebMCP` fallback driver.
 *
 * Measured on 27 Aug 2026 in Chrome 151.0.7922.173 (day-one check 6): enabling
 * `chrome://flags/#enable-webmcp-testing` adds `--enable-features=WebMCPTesting` to the command
 * line, and the flag persists in the profile's `Local State` as
 * `browser.enabled_labs_experiments: ["enable-webmcp-testing@1"]`, so a fresh profile can be
 * armed without touching the UI. Two calling conventions were measured the same day and both
 * are honoured here: the in-page `document.modelContext.executeTool(tool, input)` needs `input`
 * as a JSON string, while CDP `WebMCP.invokeTool(frameId, toolName, input)` needs an object.
 *
 * @typedef {object} Driver
 * @property {string} kind - Which route drives the tools.
 * @property {() => Promise<{ name: string, description: string|null, hasInputSchema: boolean, annotations: Record<string, unknown> }[]>} listTools - The registered WebMCP tools.
 * @property {(name: string, input: unknown) => Promise<{ status: string|null, envelope: unknown, chars: number }>} executeTool - Runs one WebMCP tool.
 * @property {(source: string) => Promise<unknown>} evaluate - Runs a function declaration in the page.
 * @property {() => Promise<{ uid: string, role: string, name: string|null }[]>} snapshot - The interactive elements.
 * @property {(target: { role?: string, name?: string, name_includes?: string }, nth?: number) => Promise<void>} click - A real click on one element.
 * @property {(target: { role?: string, name?: string, name_includes?: string }, filePaths: string[]) => Promise<void>} upload - Sets files on a file input.
 * @property {(texts: string[], timeoutMs: number) => Promise<void>} waitForText - Waits for any of the texts.
 * @property {() => Promise<string>} consoleMessages - The page's console errors and warnings.
 * @property {(initScript?: string) => Promise<void>} reload - Reloads the page, optionally running a script in the new document before any other.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Where Chrome is looked for, in order. */
export const CHROME_CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/opt/google/chrome/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

/** The command-line switch `chrome://flags/#enable-webmcp-testing` sets (day-one check 6). */
export const WEBMCP_SWITCH = '--enable-features=WebMCPTesting';

/**
 * Finds an installed Chrome.
 *
 * @param {string} [override] - An explicit path from `--chrome`.
 * @returns {string} The executable path.
 */
export function findChrome(override) {
  if (override) {
    if (!existsSync(override)) {
      throw new Error(`No Chrome at ${override}`);
    }
    return override;
  }
  const found = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `No Chrome found in ${CHROME_CANDIDATES.join(', ')}; pass --chrome <path> (the harness needs Chrome 150+ with WebMCP; headed is the default).`,
    );
  }
  return found;
}

/**
 * Builds Chrome's command line for the harness.
 *
 * @param {{ profileDir: string, port: number, url: string, headless?: boolean, extra?: string[] }} options - The run.
 * @returns {string[]} The arguments, in order.
 */
export function chromeArguments(options) {
  return [
    WEBMCP_SWITCH,
    `--remote-debugging-port=${options.port}`,
    `--user-data-dir=${options.profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen',
    '--disable-features=Translate,MediaRouter',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    ...(options.headless ? ['--headless=new'] : []),
    ...(options.extra ?? []),
    options.url,
  ];
}

/**
 * Writes a throwaway profile with the WebMCP testing flag already enabled.
 *
 * @param {string} dir - The profile directory; it is created if missing.
 * @returns {string} The directory.
 */
export function armProfile(dir) {
  mkdirSync(join(dir, 'Default'), { recursive: true });
  writeFileSync(
    join(dir, 'Local State'),
    JSON.stringify({ browser: { enabled_labs_experiments: ['enable-webmcp-testing@1'] } }),
  );
  return dir;
}

/**
 * Removes a throwaway profile, tolerating the files Chrome is still flushing as it exits.
 *
 * @param {string} dir - The profile directory.
 * @returns {void}
 */
export function removeProfile(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {
    // A leftover cache directory in the OS temp directory is not worth failing a run over.
  }
}

/**
 * Waits for the DevTools endpoint to answer.
 *
 * @param {number} port - The remote debugging port.
 * @param {number} timeoutMs - How long to wait.
 * @returns {Promise<Record<string, string>>} The `/json/version` payload.
 */
export async function waitForCdp(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'no attempt was made';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        return await response.json();
      }
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`Chrome's debugging port ${port} never answered (${last})`);
}

/**
 * Launches Chrome with a throwaway profile.
 *
 * @param {{ chrome: string, port: number, url: string, headless?: boolean, keepProfile?: boolean, onStderr?: (line: string) => void }} options - The run.
 * @returns {Promise<{ pid: number|undefined, profileDir: string, version: Record<string, string>, close: () => Promise<void> }>} The running browser.
 */
export async function launchChrome(options) {
  const profileDir = armProfile(await mkdtemp(join(tmpdir(), 'euter-e2e-')));
  const child = spawn(
    options.chrome,
    chromeArguments({
      profileDir,
      port: options.port,
      url: options.url,
      ...(options.headless === undefined ? {} : { headless: options.headless }),
    }),
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    if (options.onStderr) {
      for (const line of String(chunk).split('\n')) {
        if (line.trim() !== '') {
          options.onStderr(line);
        }
      }
    }
  });
  let version;
  try {
    version = await waitForCdp(options.port);
  } catch (error) {
    child.kill('SIGKILL');
    removeProfile(profileDir);
    throw error;
  }
  return {
    pid: child.pid,
    profileDir,
    version,
    async close() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await new Promise((done) => {
          const timer = setTimeout(() => {
            child.kill('SIGKILL');
            done(undefined);
          }, 5_000);
          child.once('exit', () => {
            clearTimeout(timer);
            done(undefined);
          });
        });
      }
      if (!options.keepProfile) {
        removeProfile(profileDir);
      }
    },
  };
}

/**
 * Opens a CDP connection to one WebSocket endpoint.
 *
 * @param {string} endpoint - The `ws://` URL.
 * @param {number} [timeoutMs] - Per-command timeout.
 * @returns {Promise<{ send: (method: string, params?: unknown) => Promise<Record<string, unknown>>, on: (event: string, listener: (params: Record<string, unknown>) => void) => () => void, close: () => void }>} The connection.
 */
export async function connectCdp(endpoint, timeoutMs = 120_000) {
  const socket = new WebSocket(endpoint);
  await new Promise((done, fail) => {
    socket.addEventListener('open', () => done(undefined), { once: true });
    socket.addEventListener('error', () => fail(new Error(`Cannot open ${endpoint}`)), {
      once: true,
    });
  });
  /** @type {Map<number, { resolve: (value: Record<string, unknown>) => void, reject: (reason: Error) => void, timer: NodeJS.Timeout }>} */
  const pending = new Map();
  /** @type {Map<string, Set<(params: Record<string, unknown>) => void>>} */
  const listeners = new Map();
  let nextId = 0;
  socket.addEventListener('message', (event) => {
    /** @type {Record<string, unknown>} */
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (typeof message.id === 'number') {
      const waiter = pending.get(message.id);
      if (!waiter) {
        return;
      }
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) {
        waiter.reject(new Error(`CDP error: ${JSON.stringify(message.error)}`));
      } else {
        waiter.resolve(/** @type {Record<string, unknown>} */ (message.result ?? {}));
      }
      return;
    }
    if (typeof message.method === 'string') {
      for (const listener of listeners.get(message.method) ?? []) {
        listener(/** @type {Record<string, unknown>} */ (message.params ?? {}));
      }
    }
  });
  return {
    send(method, params) {
      const id = (nextId += 1);
      return new Promise((done, fail) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          fail(new Error(`CDP ${method} timed out after ${timeoutMs} ms`));
        }, timeoutMs);
        pending.set(id, { resolve: done, reject: fail, timer });
        socket.send(JSON.stringify({ id, method, params: params ?? {} }));
      });
    },
    on(event, listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return () => set.delete(listener);
    },
    close() {
      socket.close();
    },
  };
}

/**
 * Finds the page target serving a URL.
 *
 * @param {number} port - The remote debugging port.
 * @param {string} url - The URL the harness opened.
 * @param {number} [timeoutMs] - How long to wait for the tab.
 * @returns {Promise<{ id: string, webSocketDebuggerUrl: string, url: string, title: string }>} The target.
 */
export async function findPageTarget(port, url, timeoutMs = 30_000) {
  const origin = new URL(url).origin;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await response.json();
    const page = targets.find(
      (target) => target.type === 'page' && String(target.url).startsWith(origin),
    );
    if (page && page.webSocketDebuggerUrl) {
      return page;
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`No page target for ${url} appeared on port ${port}`);
}

/**
 * Sets a browser permission for one origin, so the microphone paths can be driven either way.
 *
 * @param {{ send: (method: string, params?: unknown) => Promise<Record<string, unknown>> }} browser - The browser-level CDP connection.
 * @param {string} origin - The origin to set it for.
 * @param {string} name - A CDP permission name such as `audioCapture`.
 * @param {'granted'|'denied'|'prompt'} state - The setting.
 * @returns {Promise<void>} When Chrome has applied it.
 */
export async function setPermission(browser, origin, name, state) {
  await browser.send('Browser.setPermission', {
    origin,
    permission: { name },
    setting: state,
  });
}

/** The page-side helper the CDP driver installs to find and click elements by accessible name. */
const COLLECT_ELEMENTS = `() => {
  const roleOf = (el) => {
    if (el.getAttribute('role')) return el.getAttribute('role');
    const tag = el.tagName.toLowerCase();
    if (tag === 'button') return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'select') return 'combobox';
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'file') return 'button';
      if (type === 'number' || type === 'range') return type === 'range' ? 'slider' : 'spinbutton';
      if (type === 'checkbox' || type === 'radio') return type;
      return 'textbox';
    }
    if (tag === 'textarea') return 'textbox';
    return tag;
  };
  const nameOf = (el) =>
    el.getAttribute('aria-label') ||
    (el.labels && el.labels[0] ? el.labels[0].textContent.trim() : '') ||
    (el.textContent || '').trim();
  const nodes = Array.from(
    document.querySelectorAll('button, a[href], input, select, textarea, [role]'),
  );
  window.__euterE2eElements = nodes;
  return nodes.map((el, index) => ({
    uid: String(index),
    role: roleOf(el),
    name: nameOf(el) || null,
  }));
}`;

/**
 * Builds the fallback driver: the CDP `WebMCP` domain the 27 and 28 Aug live checks used.
 *
 * @param {Awaited<ReturnType<typeof connectCdp>>} page - The page-level CDP connection.
 * @returns {Promise<Driver>} The driver.
 */
export async function createCdpDriver(page) {
  /** @type {Map<string, { name: string, description: string|null, hasInputSchema: boolean, annotations: Record<string, unknown> }>} */
  const tools = new Map();
  /** @type {Map<number, (response: Record<string, unknown>) => void>} */
  const invocations = new Map();
  /** @type {string[]} */
  const consoleLines = [];
  /** @type {string|null} */
  let frameId = null;

  page.on('WebMCP.toolsAdded', (params) => {
    for (const tool of /** @type {Record<string, unknown>[]} */ (params.tools ?? [])) {
      frameId = typeof tool.frameId === 'string' ? tool.frameId : frameId;
      tools.set(String(tool.name), {
        name: String(tool.name),
        description: typeof tool.description === 'string' ? tool.description : null,
        hasInputSchema: tool.inputSchema !== undefined && tool.inputSchema !== null,
        annotations: /** @type {Record<string, unknown>} */ (tool.annotations ?? {}),
      });
    }
  });
  page.on('WebMCP.toolsRemoved', (params) => {
    for (const name of /** @type {string[]} */ (params.toolNames ?? [])) {
      tools.delete(name);
    }
  });
  page.on('WebMCP.toolResponded', (params) => {
    const waiter = invocations.get(Number(params.invocationId));
    if (waiter) {
      invocations.delete(Number(params.invocationId));
      waiter(params);
    }
  });
  page.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error' || params.type === 'warning') {
      consoleLines.push(
        `${params.type}: ${
          /** @type {Record<string, unknown>[]} */ (params.args ?? [])
            .map((arg) => String(arg.value ?? arg.description ?? ''))
            .join(' ')
        }`,
      );
    }
  });
  page.on('Log.entryAdded', (params) => {
    const entry = /** @type {Record<string, unknown>} */ (params.entry ?? {});
    if (entry.level === 'error' || entry.level === 'warning') {
      consoleLines.push(`${entry.level}: ${entry.text}`);
    }
  });

  await page.send('Runtime.enable');
  await page.send('Log.enable');
  await page.send('DOM.enable');
  await page.send('Page.enable');
  await page.send('WebMCP.enable');

  /**
   * Runs a function declaration in the page and returns its value.
   *
   * @param {string} source - A function declaration such as `() => document.title`.
   * @param {unknown[]} [args] - Arguments serialised into the call.
   * @returns {Promise<unknown>} The returned value.
   */
  async function evaluate(source, args = []) {
    const expression = `(${source})(${args.map((arg) => JSON.stringify(arg)).join(', ')})`;
    const result = await page.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: false,
    });
    if (result.exceptionDetails) {
      throw new Error(`The page threw: ${JSON.stringify(result.exceptionDetails)}`);
    }
    return /** @type {Record<string, unknown>} */ (result.result ?? {}).value ?? null;
  }

  /**
   * Resolves one element and returns its remote object id.
   *
   * @param {{ role?: string, name?: string, name_includes?: string }} target - What to look for.
   * @param {number} nth - Which match, one-based.
   * @returns {Promise<string>} The remote object id.
   */
  async function elementObjectId(target, nth) {
    const elements = /** @type {{ uid: string, role: string, name: string|null }[]} */ (
      await evaluate(COLLECT_ELEMENTS)
    );
    const { findUid } = await import('./e2e-mcp.mjs');
    const uid = findUid(elements, target, nth);
    const handle = await page.send('Runtime.evaluate', {
      expression: `window.__euterE2eElements[${Number(uid)}]`,
      returnByValue: false,
    });
    const objectId = /** @type {Record<string, unknown>} */ (handle.result ?? {}).objectId;
    if (typeof objectId !== 'string') {
      throw new Error(`Cannot take a handle on ${JSON.stringify(target)}`);
    }
    return objectId;
  }

  return {
    kind: 'cdp-webmcp',
    async listTools() {
      return [...tools.values()];
    },
    async executeTool(name, input) {
      if (frameId === null) {
        throw new Error('No WebMCP frame has registered tools yet');
      }
      const started = await page.send('WebMCP.invokeTool', {
        frameId,
        toolName: name,
        input: input ?? {},
      });
      const invocationId = Number(started.invocationId);
      const response = await new Promise((done, fail) => {
        const timer = setTimeout(() => {
          invocations.delete(invocationId);
          fail(new Error(`WebMCP.invokeTool ${name} never responded`));
        }, 120_000);
        invocations.set(invocationId, (params) => {
          clearTimeout(timer);
          done(params);
        });
      });
      const output = /** @type {Record<string, unknown>} */ (response).output;
      const text =
        typeof output === 'string'
          ? output
          : JSON.stringify(output ?? /** @type {Record<string, unknown>} */ (response).errorText);
      const { parseToolOutput } = await import('./e2e-mcp.mjs');
      const parsed = parseToolOutput(text);
      return {
        status: String(/** @type {Record<string, unknown>} */ (response).status ?? ''),
        envelope: parsed.envelope,
        chars: parsed.chars,
      };
    },
    evaluate,
    async snapshot() {
      return /** @type {{ uid: string, role: string, name: string|null }[]} */ (
        await evaluate(COLLECT_ELEMENTS)
      );
    },
    async click(target, nth = 1) {
      const objectId = await elementObjectId(target, nth);
      const box = await page.send('Runtime.callFunctionOn', {
        objectId,
        functionDeclaration:
          'function () { this.scrollIntoView({block: "center"}); const r = this.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; }',
        returnByValue: true,
      });
      const point = /** @type {{ x: number, y: number }} */ (
        /** @type {Record<string, unknown>} */ (box.result ?? {}).value
      );
      for (const type of ['mousePressed', 'mouseReleased']) {
        await page.send('Input.dispatchMouseEvent', {
          type,
          x: point.x,
          y: point.y,
          button: 'left',
          buttons: type === 'mousePressed' ? 1 : 0,
          clickCount: 1,
        });
      }
    },
    async upload(target, filePaths) {
      const objectId = await elementObjectId(target, 1);
      await page.send('DOM.setFileInputFiles', { files: filePaths, objectId });
    },
    async waitForText(texts, timeoutMs) {
      const deadline = Date.now() + (timeoutMs || 10_000);
      while (Date.now() < deadline) {
        const found = await evaluate(
          '(needles) => needles.some((needle) => (document.body.textContent || "").includes(needle))',
          [texts],
        );
        if (found === true) {
          return;
        }
        await new Promise((done) => setTimeout(done, 200));
      }
      const bodyText = await evaluate('() => document.body.textContent || ""');
      throw new Error(
        `None of ${JSON.stringify(texts)} appeared within ${timeoutMs} ms; ` +
          `body text was ${JSON.stringify(String(bodyText).slice(-1_000))}`,
      );
    },
    async consoleMessages() {
      return consoleLines.join('\n');
    },
    async reload(initScript) {
      consoleLines.length = 0;
      tools.clear();
      /** @type {string|undefined} */
      let scriptId;
      if (initScript !== undefined) {
        const added = await page.send('Page.addScriptToEvaluateOnNewDocument', {
          source: initScript,
        });
        scriptId = String(added.identifier);
      }
      await page.send('Page.reload');
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline && tools.size === 0) {
        await new Promise((done) => setTimeout(done, 200));
      }
      if (scriptId !== undefined) {
        await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId });
      }
    },
  };
}
