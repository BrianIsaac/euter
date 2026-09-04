import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(resolve('public/video/webmcp.html'), 'utf8');
const document = new DOMParser().parseFromString(html, 'text/html');

describe('the WebMCP video explainer', () => {
  it('is a six-scene, 40-second automatic capture including its opening hold', () => {
    const timelineDuration = Number(document.querySelector('main')?.dataset.durationMs);

    expect(timelineDuration).toBe(39000);
    expect(timelineDuration + 1000).toBe(40000);
    expect(document.querySelectorAll('[data-scene]')).toHaveLength(6);
    expect(html).toContain("{ name: 'closing', duration: 5000 }");
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

  it('ends on the five-second Euterpe closing card', () => {
    const closing = document.querySelector('[data-scene="closing"]');
    const closingText = closing?.textContent?.replace(/\s+/g, ' ').trim();

    expect(closing?.querySelector('h2')?.textContent).toBe('Euterpe');
    expect(closingText).toContain('Hum a melody. Make a song with your agent.');
    expect(closingText).toContain(
      '28 WebMCP tools · visible, explained and undoable · the person stays in control',
    );
    expect(closingText).toContain('euter.pages.dev');
    expect(closingText).toContain('Source linked on Devpost · MIT');
    expect(closing?.querySelectorAll('.pulse-line span')).toHaveLength(21);
    expect(html).toContain('animation: pulse 1.8s ease-in-out infinite');
  });

  it('has no external media, stylesheets or scripts', () => {
    expect(document.querySelectorAll('audio, video, img, link[rel="stylesheet"]')).toHaveLength(0);
    expect(document.querySelectorAll('script[src]')).toHaveLength(0);
  });
});
