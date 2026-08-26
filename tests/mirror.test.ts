/**
 * Every `src/**\/*.ts(x)` has a test at the same relative path under `tests/` (CLAUDE.md).
 * Declaration files are excluded.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const srcDir = join(root, 'src');
const testsDir = join(root, 'tests');

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...walk(path));
    } else if (/\.tsx?$/.test(entry) && !entry.endsWith('.d.ts')) {
      files.push(path);
    }
  }
  return files;
}

describe('tests mirror src', () => {
  it('has a test file for every source file', () => {
    const missing = walk(srcDir)
      .map((file) => relative(srcDir, file))
      .filter((rel) => {
        const base = rel.replace(/\.(ts|tsx)$/, '');
        return (
          !existsSync(join(testsDir, `${base}.test.ts`)) &&
          !existsSync(join(testsDir, `${base}.test.tsx`))
        );
      });
    expect(missing, `source files without a mirror under tests/: ${missing.join(', ')}`).toEqual(
      [],
    );
  });
});
