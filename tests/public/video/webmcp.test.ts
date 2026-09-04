import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(resolve('public/video/webmcp.html'), 'utf8');
const document = new DOMParser().parseFromString(html, 'text/html');

describe('the WebMCP video explainer', () => {
  it('is a five-scene, 34-second automatic sequence', () => {
    expect(document.querySelector('main')?.dataset.durationMs).toBe('34000');
    expect(document.querySelectorAll('[data-scene]')).toHaveLength(5);
    expect(html).toContain('window.setTimeout(play, 1000)');
    expect(html).toContain("get('autoplay') !== '0'");
  });

  it('describes the shipped registration and human-agent loop', () => {
    expect(html).toContain('document.modelContext');
    expect(html).toContain('navigator.modelContext');
    expect(html).toContain('registerTool');
    expect(html).toContain('28 musical tools');
    expect(html).toContain('6 read tools');
    expect(html).toContain('serialised queue');
    expect(html).toContain('command bus');
    expect(html).toContain('reconciled from the song document');
    expect(html).toContain('it does not hear the audio');
    expect(html).toContain('why');
  });

  it('has no external media, stylesheets or scripts', () => {
    expect(document.querySelectorAll('audio, video, img, link[rel="stylesheet"]')).toHaveLength(0);
    expect(document.querySelectorAll('script[src]')).toHaveLength(0);
  });
});
