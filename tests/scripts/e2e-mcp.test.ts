import { describe, expect, it } from 'vitest';
import {
  createStdioClient,
  findUid,
  parseEvaluateResult,
  parsePages,
  parseSnapshot,
  parseToolOutput,
  parseWebmcpTools,
  splitFrames,
  toolText,
} from '../../scripts/e2e-mcp.mjs';

describe('splitFrames', () => {
  it('returns complete lines and keeps the incomplete tail', () => {
    const { messages, rest } = splitFrames('{"id":1}\n{"id":2}\n{"id":3');
    expect(messages).toEqual([{ id: 1 }, { id: 2 }]);
    expect(rest).toBe('{"id":3');
  });

  it('skips blank and unparseable lines rather than throwing', () => {
    const { messages, rest } = splitFrames('\nnot json\n{"ok":true}\n');
    expect(messages).toEqual([{ ok: true }]);
    expect(rest).toBe('');
  });
});

describe('parsePages', () => {
  it('reads the page table chrome-devtools-mcp prints', () => {
    expect(
      parsePages(
        '## Pages\n1: Euterpe (http://localhost:4173/) [selected]\n2: New tab (about:blank)',
      ),
    ).toEqual([
      { id: 1, title: 'Euterpe', url: 'http://localhost:4173/', selected: true },
      { id: 2, title: 'New tab', url: 'about:blank', selected: false },
    ]);
  });
});

describe('parseWebmcpTools', () => {
  const listing = [
    '## WebMCP tools',
    'name="get_song_state", description="Reads revision, tempo and \\"more\\".", inputSchema={"type":"object","properties":{}}, annotations={"readOnly":true,"untrustedContent":true}',
    'name="set_tempo", description="Sets the tempo in BPM.", inputSchema={"type":"object"}, annotations={"readOnly":false,"untrustedContent":false}',
  ].join('\n');

  it('reads the name, description and annotations of every tool', () => {
    const tools = parseWebmcpTools(listing);
    expect(tools.map((tool) => tool.name)).toEqual(['get_song_state', 'set_tempo']);
    expect(tools[0]?.description).toBe('Reads revision, tempo and "more".');
    expect(tools[0]?.annotations).toEqual({ readOnly: true, untrustedContent: true });
    expect(tools[0]?.hasInputSchema).toBe(true);
    expect(tools.filter((tool) => tool.annotations.readOnly === true)).toHaveLength(1);
  });
});

describe('parseToolOutput', () => {
  it('unwraps the status envelope and measures the compact output', () => {
    const result = parseToolOutput(
      JSON.stringify({ status: 'Completed', output: { ok: true, revision: 1, data: { bpm: 96 } } }),
    );
    expect(result.status).toBe('Completed');
    expect(result.envelope).toEqual({ ok: true, revision: 1, data: { bpm: 96 } });
    expect(result.chars).toBe(JSON.stringify({ ok: true, revision: 1, data: { bpm: 96 } }).length);
  });

  it('parses an output that came back as a JSON string, and passes prose through', () => {
    expect(
      parseToolOutput(JSON.stringify({ output: '{"ok":false,"code":"CANCELLED"}' })).envelope,
    ).toEqual({
      ok: false,
      code: 'CANCELLED',
    });
    expect(parseToolOutput('not json at all').envelope).toBe('not json at all');
  });
});

describe('parseEvaluateResult', () => {
  it('reads the fenced JSON block, and answers null without one', () => {
    expect(parseEvaluateResult('Script ran on page and returned:\n```json\n{"a":1}\n```')).toEqual({
      a: 1,
    });
    expect(parseEvaluateResult('Script ran on page and returned: undefined')).toBeNull();
  });
});

describe('parseSnapshot and findUid', () => {
  const snapshot = [
    '## Latest page snapshot',
    'uid=1_0 RootWebArea "Euterpe" url="http://localhost:4173/"',
    '  uid=1_18 button "Play"',
    '  uid=1_19 button "Stop" disableable disabled',
    '  uid=1_60 button "Choose"',
    '  uid=1_70 button "Choose"',
    '  uid=1_208 button "Import audio file" value="No file chosen"',
  ].join('\n');

  it('flattens the accessibility tree into uid, role and name', () => {
    const elements = parseSnapshot(snapshot);
    expect(elements).toHaveLength(6);
    expect(elements[1]).toEqual({ uid: '1_18', role: 'button', name: 'Play' });
  });

  it('finds an element by role and name, and the nth of several', () => {
    const elements = parseSnapshot(snapshot);
    expect(findUid(elements, { role: 'button', name: 'Play' })).toBe('1_18');
    expect(findUid(elements, { role: 'button', name: 'Choose' }, 2)).toBe('1_70');
    expect(findUid(elements, { name_includes: 'Import' })).toBe('1_208');
    expect(() => findUid(elements, { role: 'button', name: 'Record' })).toThrow(/No element 1/);
  });
});

describe('toolText', () => {
  it('joins the text content and throws on an error result', () => {
    expect(
      toolText(
        {
          content: [
            { type: 'text', text: 'a' },
            { type: 'text', text: 'b' },
          ],
        },
        'x',
      ),
    ).toBe('a\nb');
    expect(() =>
      toolText({ isError: true, content: [{ type: 'text', text: 'boom' }] }, 'click'),
    ).toThrow('click failed: boom');
  });
});

describe('createStdioClient', () => {
  it('speaks newline-delimited JSON-RPC and answers the server’s roots request', async () => {
    const server = [
      "let buffer = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => {",
      '  buffer += chunk;',
      "  let newline; while ((newline = buffer.indexOf('\\n')) >= 0) {",
      '    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);',
      '    if (!line.trim()) continue;',
      '    const message = JSON.parse(line);',
      "    if (message.method === 'initialize') {",
      "      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { serverInfo: { name: 'fake' } } }) + '\\n');",
      "      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'roots/list' }) + '\\n');",
      "    } else if (message.method === 'boom') {",
      "      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -1, message: 'no' } }) + '\\n');",
      '    } else if (message.id === 99) {',
      "      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1000, method: 'seen', params: message.result }) + '\\n');",
      '    }',
      '  }',
      '});',
    ].join('\n');
    /** @type {unknown} */
    let sawRoots: unknown = null;
    const client = createStdioClient({
      command: process.execPath,
      args: ['-e', server],
      onRequest(method, params) {
        if (method === 'roots/list') {
          return { roots: [{ uri: 'file:///repo', name: 'euter' }] };
        }
        if (method === 'seen') {
          sawRoots = params;
          return {};
        }
        return undefined;
      },
      timeoutMs: 10_000,
    });
    const initialised = await client.call('initialize', {});
    expect(initialised.serverInfo).toEqual({ name: 'fake' });
    await expect(client.call('boom', {})).rejects.toThrow(/MCP error/);
    await new Promise((done) => setTimeout(done, 200));
    expect(sawRoots).toEqual({ roots: [{ uri: 'file:///repo', name: 'euter' }] });
    await client.close();
    await expect(client.call('initialize', {})).rejects.toThrow(/exited/);
  });
});
