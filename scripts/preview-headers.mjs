#!/usr/bin/env node
/**
 * Serves dist/ with the rules in _headers applied, so `curl -I` against the local preview
 * checks what Cloudflare Pages will send. Vite's preview server does not read _headers.
 *
 * Matching follows the Cloudflare Pages documentation
 * (https://developers.cloudflare.com/pages/configuration/headers/): one splat (*) per rule
 * matching greedily, `:name` placeholders matching one path segment, every matching rule's
 * headers combined, duplicate names joined with a comma, and `! Name` detaching a header.
 * Unknown paths fall back to index.html, as Pages does for a single-page app without 404.html.
 *
 * Usage: node scripts/preview-headers.mjs [--port 4173] [--dir dist] [--headers _headers]
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Parses a _headers file into rules.
 *
 * @param {string} text - The file contents.
 * @returns {{ pattern: string, headers: { name: string, value: string, detach: boolean }[] }[]} The rules.
 */
export function parseHeadersFile(text) {
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '' || raw.trim().startsWith('#')) {
      continue;
    }
    if (!/^\s/.test(raw)) {
      rules.push({ pattern: raw.trim(), headers: [] });
      continue;
    }
    const rule = rules.at(-1);
    if (!rule) {
      continue;
    }
    const line = raw.trim();
    const detach = line.startsWith('!');
    const body = detach ? line.slice(1).trim() : line;
    const colon = body.indexOf(':');
    if (colon < 0) {
      if (detach && body !== '') {
        rule.headers.push({ name: body, value: '', detach });
      }
      continue;
    }
    rule.headers.push({
      name: body.slice(0, colon).trim(),
      value: body.slice(colon + 1).trim(),
      detach,
    });
  }
  return rules;
}

/**
 * Compiles a Cloudflare Pages URL pattern to a regular expression.
 *
 * @param {string} pattern - The pattern, e.g. `/assets/*` or `/movies/:title`.
 * @returns {RegExp} The matcher over the path.
 */
export function compilePattern(pattern) {
  let path = pattern;
  if (/^https?:\/\//.test(path)) {
    path = path.replace(/^https?:\/\/[^/]+/, '');
  }
  const escaped = path
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z]\w*/g, '[^/]+'))
    .join('.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * Computes the headers for a path from the rules.
 *
 * @param {ReturnType<typeof parseHeadersFile>} rules - The parsed rules.
 * @param {string} path - The request path.
 * @returns {Map<string, string>} Header names (lower-cased) to values.
 */
export function headersFor(rules, path) {
  const result = new Map();
  for (const rule of rules) {
    if (!compilePattern(rule.pattern).test(path)) {
      continue;
    }
    for (const header of rule.headers) {
      const key = header.name.toLowerCase();
      if (header.detach) {
        result.delete(key);
      } else if (result.has(key)) {
        result.set(key, `${result.get(key)}, ${header.value}`);
      } else {
        result.set(key, header.value);
      }
    }
  }
  return result;
}

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function main() {
  const port = Number(argValue('--port', '4173'));
  const dir = resolve(argValue('--dir', 'dist'));
  const headersPath = resolve(argValue('--headers', '_headers'));
  if (!existsSync(join(dir, 'index.html'))) {
    console.error(`No index.html in ${dir}; run pnpm build first.`);
    process.exit(1);
  }
  const rules = parseHeadersFile(readFileSync(headersPath, 'utf8'));
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const path = normalize(decodeURIComponent(url.pathname));
    let file = join(dir, path);
    if (!file.startsWith(dir)) {
      response.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      const indexInDir = join(file, 'index.html');
      file = existsSync(indexInDir) ? indexInDir : join(dir, 'index.html');
    }
    const headers = { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' };
    for (const [name, value] of headersFor(rules, path)) {
      headers[name] = value;
    }
    response.writeHead(200, headers);
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    createReadStream(file).pipe(response);
  });
  server.listen(port, () => {
    console.log(`Serving ${dir} with ${rules.length} header rule(s) from ${headersPath}`);
    console.log(`http://localhost:${port}/`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  main();
}
