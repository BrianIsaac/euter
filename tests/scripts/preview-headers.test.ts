import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compilePattern, headersFor, parseHeadersFile } from '../../scripts/preview-headers.mjs';

const rules = parseHeadersFile(readFileSync('_headers', 'utf8'));

describe('preview-headers', () => {
  it('parses the repository _headers file into three rules', () => {
    expect(rules.map((rule) => rule.pattern)).toEqual(['/*', '/assets/*', '/*.wasm']);
    expect(rules[0]?.headers.map((header) => header.name)).toEqual([
      'Origin-Agent-Cluster',
      'Permissions-Policy',
      'X-Content-Type-Options',
      'Referrer-Policy',
    ]);
  });

  it('matches splats greedily and placeholders per segment', () => {
    expect(compilePattern('/*').test('/')).toBe(true);
    expect(compilePattern('/*').test('/a/b/c.js')).toBe(true);
    expect(compilePattern('/assets/*').test('/assets/index-abc.js')).toBe(true);
    expect(compilePattern('/assets/*').test('/index.html')).toBe(false);
    expect(compilePattern('/*.wasm').test('/assets/ort.wasm')).toBe(true);
    expect(compilePattern('/*.wasm').test('/assets/ort.wasm.map')).toBe(false);
    expect(compilePattern('/movies/:title').test('/movies/heat')).toBe(true);
    expect(compilePattern('/movies/:title').test('/movies/heat/2')).toBe(false);
    expect(compilePattern('https://:project.pages.dev/*').test('/anything')).toBe(true);
  });

  it('combines every matching rule and sets the wasm content type', () => {
    const root = headersFor(rules, '/');
    expect(root.get('origin-agent-cluster')).toBe('?1');
    expect(root.get('permissions-policy')).toBe('tools=(self), microphone=(self), midi=(self)');
    expect(root.has('cache-control')).toBe(false);
    const asset = headersFor(rules, '/assets/index-abc.js');
    expect(asset.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(asset.get('origin-agent-cluster')).toBe('?1');
    const wasm = headersFor(rules, '/assets/ort-wasm-simd.wasm');
    expect(wasm.get('content-type')).toBe('application/wasm');
    expect(wasm.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('joins duplicate headers with a comma and detaches with !', () => {
    const parsed = parseHeadersFile(
      `# comment\n/*\n  X-A: one\n/x/*\n  X-A: two\n  ! Origin-Agent-Cluster\n`,
    );
    const combined = headersFor(parsed, '/x/y');
    expect(combined.get('x-a')).toBe('one, two');
    expect(headersFor([...rules, ...parsed], '/x/y').has('origin-agent-cluster')).toBe(false);
  });
});
