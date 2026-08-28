/**
 * A minimal MCP stdio client and the chrome-devtools-mcp driver for the end-to-end harness
 * (landscape §2.5: `list_webmcp_tools` and `execute_webmcp_tool` behind
 * `--categoryExperimentalWebmcp=true`).
 *
 * MCP over stdio is newline-delimited JSON-RPC 2.0, so the client is a hundred lines rather
 * than a dependency; the framing and the server's text formats are parsed by exported pure
 * functions that `tests/scripts/e2e-mcp.test.ts` covers without a browser.
 */
import { spawn } from 'node:child_process';

/** The protocol revision this client speaks. */
export const PROTOCOL_VERSION = '2025-06-18';

/**
 * Splits a stdio buffer into complete JSON-RPC messages.
 *
 * @param {string} buffer - Everything received and not yet consumed.
 * @returns {{ messages: unknown[], rest: string }} The parsed messages and the incomplete tail.
 */
export function splitFrames(buffer) {
  /** @type {unknown[]} */
  const messages = [];
  let rest = buffer;
  for (;;) {
    const newline = rest.indexOf('\n');
    if (newline < 0) {
      break;
    }
    const line = rest.slice(0, newline).trim();
    rest = rest.slice(newline + 1);
    if (line === '') {
      continue;
    }
    try {
      messages.push(JSON.parse(line));
    } catch {
      // A server that prints a stray line on stdout is not a protocol error worth failing on.
    }
  }
  return { messages, rest };
}

/**
 * Parses the `list_pages` table into page records.
 *
 * @param {string} text - The tool's text content.
 * @returns {{ id: number, title: string, url: string, selected: boolean }[]} The pages.
 */
export function parsePages(text) {
  /** @type {{ id: number, title: string, url: string, selected: boolean }[]} */
  const pages = [];
  for (const line of text.split('\n')) {
    const match = /^(\d+):\s*(.*?)\s*\(([^)]*)\)\s*(\[selected\])?\s*$/.exec(line.trim());
    if (!match) {
      continue;
    }
    pages.push({
      id: Number(match[1]),
      title: /** @type {string} */ (match[2]),
      url: /** @type {string} */ (match[3]),
      selected: match[4] !== undefined,
    });
  }
  return pages;
}

/**
 * Parses the `list_webmcp_tools` listing.
 *
 * Each line reads `name="…", description="…", inputSchema={…}, annotations={…}`; the schema and
 * the annotations are JSON, and the two quoted fields are JSON string bodies.
 *
 * @param {string} text - The tool's text content.
 * @returns {{ name: string, description: string|null, hasInputSchema: boolean, annotations: Record<string, unknown> }[]} The tools.
 */
export function parseWebmcpTools(text) {
  /** @type {{ name: string, description: string|null, hasInputSchema: boolean, annotations: Record<string, unknown> }[]} */
  const tools = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const name = /^name="([^"]+)"/.exec(line);
    if (!name) {
      continue;
    }
    const annotationsAt = line.lastIndexOf(', annotations=');
    /** @type {Record<string, unknown>} */
    let annotations = {};
    if (annotationsAt >= 0) {
      try {
        annotations = JSON.parse(line.slice(annotationsAt + ', annotations='.length));
      } catch {
        annotations = {};
      }
    }
    const descriptionAt = line.indexOf(', description="');
    const schemaAt = line.indexOf('", inputSchema=', descriptionAt);
    /** @type {string|null} */
    let description = null;
    if (descriptionAt >= 0 && schemaAt > descriptionAt) {
      const body = line.slice(descriptionAt + ', description="'.length, schemaAt);
      try {
        description = JSON.parse(`"${body}"`);
      } catch {
        description = body;
      }
    }
    tools.push({
      name: /** @type {string} */ (name[1]),
      description,
      hasInputSchema: schemaAt >= 0,
      annotations,
    });
  }
  return tools;
}

/**
 * Parses the `execute_webmcp_tool` result into the page's own envelope.
 *
 * @param {string} text - The tool's text content.
 * @returns {{ status: string|null, envelope: unknown, chars: number }} The status the server
 *   reported, the envelope the page returned, and the envelope's compact JSON length.
 */
export function parseToolOutput(text) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: null, envelope: text, chars: text.length };
  }
  if (parsed === null || typeof parsed !== 'object') {
    return { status: null, envelope: parsed, chars: text.length };
  }
  const record = /** @type {Record<string, unknown>} */ (parsed);
  let envelope = 'output' in record ? record.output : record;
  if (typeof envelope === 'string') {
    try {
      envelope = JSON.parse(envelope);
    } catch {
      // A tool that returned prose rather than an envelope is reported as it came back.
    }
  }
  return {
    status: typeof record.status === 'string' ? record.status : null,
    envelope,
    chars: JSON.stringify(envelope ?? null).length,
  };
}

/**
 * Parses the `evaluate_script` result.
 *
 * @param {string} text - The tool's text content.
 * @returns {unknown} The returned value, or null when the script returned nothing.
 */
export function parseEvaluateResult(text) {
  const fence = /```json\n([\s\S]*?)\n```/.exec(text);
  if (!fence) {
    return null;
  }
  try {
    return JSON.parse(/** @type {string} */ (fence[1]));
  } catch {
    return fence[1];
  }
}

/**
 * Parses a `take_snapshot` accessibility tree into flat elements.
 *
 * @param {string} text - The tool's text content.
 * @returns {{ uid: string, role: string, name: string|null }[]} The elements, in document order.
 */
export function parseSnapshot(text) {
  /** @type {{ uid: string, role: string, name: string|null }[]} */
  const elements = [];
  for (const line of text.split('\n')) {
    const match = /^\s*uid=(\S+)\s+(\S+)(?:\s+"((?:[^"\\]|\\.)*)")?/.exec(line);
    if (!match) {
      continue;
    }
    elements.push({
      uid: /** @type {string} */ (match[1]),
      role: /** @type {string} */ (match[2]),
      name: match[3] === undefined ? null : match[3].replace(/\\"/g, '"'),
    });
  }
  return elements;
}

/**
 * Finds one element in a parsed snapshot.
 *
 * @param {{ uid: string, role: string, name: string|null }[]} elements - The parsed snapshot.
 * @param {{ role?: string, name?: string, name_includes?: string }} target - What to look for.
 * @param {number} [nth] - Which match to take, one-based; the default is the first.
 * @returns {string} The element's uid.
 */
export function findUid(elements, target, nth = 1) {
  const matches = elements.filter((element) => {
    if (target.role !== undefined && element.role !== target.role) {
      return false;
    }
    if (target.name !== undefined && element.name !== target.name) {
      return false;
    }
    if (
      target.name_includes !== undefined &&
      !(element.name ?? '').includes(target.name_includes)
    ) {
      return false;
    }
    return true;
  });
  const found = matches[nth - 1];
  if (!found) {
    throw new Error(
      `No element ${nth} matching ${JSON.stringify(target)} in the snapshot (${matches.length} matched)`,
    );
  }
  return found.uid;
}

/**
 * Starts an MCP server over stdio and returns a JSON-RPC client for it.
 *
 * @param {{ command: string, args: string[], env?: NodeJS.ProcessEnv, onStderr?: (line: string) => void, onRequest?: (method: string, params: Record<string, unknown>) => unknown, timeoutMs?: number }} options - How to start it.
 * @returns {{ call: (method: string, params?: unknown) => Promise<Record<string, unknown>>, notify: (method: string, params?: unknown) => void, close: () => Promise<void>, pid: number|undefined }} The client.
 */
export function createStdioClient(options) {
  const child = spawn(options.command, options.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: options.env ?? process.env,
  });
  const timeoutMs = options.timeoutMs ?? 180_000;
  /** @type {Map<number, { resolve: (value: Record<string, unknown>) => void, reject: (reason: Error) => void, timer: NodeJS.Timeout }>} */
  const pending = new Map();
  let buffer = '';
  let nextId = 0;
  /** @type {Error|null} */
  let exitReason = null;

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    const { messages, rest } = splitFrames(buffer + chunk);
    buffer = rest;
    for (const message of messages) {
      const record = /** @type {Record<string, unknown>} */ (message);
      const id = typeof record.id === 'number' ? record.id : null;
      if (typeof record.method === 'string') {
        // The server asks the client something; `roots/list` is the one this harness answers.
        if (id !== null) {
          const result = options.onRequest
            ? options.onRequest(
                record.method,
                /** @type {Record<string, unknown>} */ (record.params ?? {}),
              )
            : undefined;
          child.stdin.write(
            `${JSON.stringify(
              result === undefined
                ? {
                    jsonrpc: '2.0',
                    id,
                    error: { code: -32601, message: `No handler for ${record.method}` },
                  }
                : { jsonrpc: '2.0', id, result },
            )}\n`,
          );
        }
        continue;
      }
      const waiter = id === null ? undefined : pending.get(id);
      if (!waiter || id === null) {
        continue;
      }
      pending.delete(id);
      clearTimeout(waiter.timer);
      if (record.error) {
        waiter.reject(new Error(`MCP error: ${JSON.stringify(record.error)}`));
      } else {
        waiter.resolve(/** @type {Record<string, unknown>} */ (record.result ?? {}));
      }
    }
  });
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
  child.on('exit', (code, signal) => {
    exitReason = new Error(`the MCP server exited (code ${code}, signal ${signal})`);
    for (const [id, waiter] of pending) {
      pending.delete(id);
      clearTimeout(waiter.timer);
      waiter.reject(exitReason);
    }
  });

  /**
   * Sends one request and waits for its reply.
   *
   * @param {string} method - The JSON-RPC method.
   * @param {unknown} [params] - The parameters.
   * @returns {Promise<Record<string, unknown>>} The result.
   */
  function call(method, params) {
    if (exitReason) {
      return Promise.reject(exitReason);
    }
    const id = (nextId += 1);
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP call ${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      pending.set(id, { resolve: resolvePromise, reject, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  return {
    call,
    notify(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    },
    async close() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await new Promise((done) => {
          const timer = setTimeout(() => {
            child.kill('SIGKILL');
            done(undefined);
          }, 3_000);
          child.once('exit', () => {
            clearTimeout(timer);
            done(undefined);
          });
        });
      }
    },
    pid: child.pid,
  };
}

/**
 * Reads the text of an MCP `tools/call` result, refusing an error result.
 *
 * @param {Record<string, unknown>} result - The `tools/call` result.
 * @param {string} label - What was called, for the message.
 * @returns {string} The joined text content.
 */
export function toolText(result, label) {
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .filter((part) => part && typeof part === 'object' && part.type === 'text')
    .map((part) => String(part.text))
    .join('\n');
  if (result.isError === true) {
    throw new Error(`${label} failed: ${text}`);
  }
  return text;
}

/**
 * Builds the driver the runner uses, over a connected chrome-devtools-mcp client.
 *
 * @param {ReturnType<typeof createStdioClient>} client - The MCP client, already initialised.
 * @param {() => number} pageId - The page to act on.
 * @returns {import('./e2e-chrome.mjs').Driver} The driver.
 */
export function createMcpDriver(client, pageId) {
  /**
   * Calls one chrome-devtools-mcp tool and returns its text.
   *
   * @param {string} name - The tool name.
   * @param {Record<string, unknown>} args - The arguments.
   * @returns {Promise<string>} The text content.
   */
  async function callTool(name, args) {
    const result = await client.call('tools/call', { name, arguments: args });
    return toolText(result, name);
  }

  return {
    kind: 'chrome-devtools-mcp',
    async listTools() {
      return parseWebmcpTools(await callTool('list_webmcp_tools', { pageId: pageId() }));
    },
    async executeTool(name, input) {
      const text = await callTool('execute_webmcp_tool', {
        pageId: pageId(),
        toolName: name,
        input: JSON.stringify(input ?? {}),
      });
      return parseToolOutput(text);
    },
    async evaluate(source) {
      return parseEvaluateResult(
        await callTool('evaluate_script', {
          pageId: pageId(),
          function: source,
          waitForStableDom: false,
        }),
      );
    },
    async snapshot() {
      return parseSnapshot(await callTool('take_snapshot', { pageId: pageId() }));
    },
    async click(target, nth) {
      const uid = findUid(await this.snapshot(), target, nth);
      await callTool('click', { pageId: pageId(), uid });
    },
    async upload(target, filePaths) {
      const uid = findUid(await this.snapshot(), target, 1);
      await callTool('upload_file', { pageId: pageId(), uid, filePaths });
    },
    async waitForText(texts, timeoutMs) {
      await callTool('wait_for', { pageId: pageId(), text: texts, timeout: timeoutMs });
    },
    async consoleMessages() {
      return callTool('list_console_messages', { pageId: pageId(), types: ['error', 'warn'] });
    },
    async reload(initScript) {
      await callTool('navigate_page', {
        pageId: pageId(),
        type: 'reload',
        ...(initScript === undefined ? {} : { initScript }),
      });
    },
  };
}
