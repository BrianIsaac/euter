import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');

describe('README evidence', () => {
  it('keeps every repository-local Markdown link in the public checkout', () => {
    const links = [...readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1] ?? '');
    const local = links
      .filter((target) => !/^(?:https?:|mailto:|#)/.test(target))
      .map((target) => decodeURIComponent(target.split('#')[0] ?? ''));
    expect(local.filter((target) => !existsSync(resolve(root, target)))).toEqual([]);
  });

  it('does not present direct tool replay as evidence that ChatGPT followed the prose prompts', () => {
    expect(readme).toContain('does not send the prose to ChatGPT');
    expect(readme).toMatch(/all 29\s+registered tools/);
    expect(readme).not.toContain('Eight lines that exercise the whole surface');
  });

  it('keeps volatile measurements and browser requirements qualified', () => {
    expect(readme).toContain('get_job` polls until');
    expect(readme).toContain('compatible Chrome with WebMCP enabled');
    expect(readme).not.toContain('polled eight times');
    expect(readme).not.toContain('needs a headed Chrome');
  });
});
