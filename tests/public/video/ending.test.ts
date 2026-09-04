import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(resolve('public/video/ending.html'), 'utf8');
const document = new DOMParser().parseFromString(html, 'text/html');

describe('the video ending page', () => {
  it('contains the final project claim and hand-off links', () => {
    expect(document.querySelector('h1')?.textContent).toBe('Euterpe');
    expect(document.body.textContent).toContain('28 WebMCP tools');
    expect(document.body.textContent).toContain('visible, explained and undoable');
    expect(document.body.textContent).toContain('euter.pages.dev');
    expect(document.body.textContent).toContain('Source linked on Devpost · MIT');
  });

  it('has no external media, stylesheets or scripts', () => {
    expect(document.querySelectorAll('audio, video, img, link[rel="stylesheet"]')).toHaveLength(0);
    expect(document.querySelectorAll('script[src]')).toHaveLength(0);
  });
});
