import { describe, expect, it } from 'vitest';
import { getStylePreset, STYLE_PRESETS } from '../../src/theory/styles.ts';

describe('style presets', () => {
  it('keeps pop, soul and lofi in one complete preference table', () => {
    expect(Object.keys(STYLE_PRESETS)).toEqual(['pop', 'soul', 'lofi']);
    for (const style of Object.values(STYLE_PRESETS)) {
      expect(style.tempo_range[0]).toBeLessThan(style.tempo_range[1]);
      expect(style.kit).toBeTruthy();
      expect(style.swing).toBeGreaterThanOrEqual(0);
      expect(style.voicing.range).toHaveLength(2);
      expect(style.bass_pattern.length).toBeGreaterThan(0);
      expect(style.drum_pattern.some(({ voice }) => voice === 'kick')).toBe(true);
      expect(style.drum_pattern.some(({ voice }) => voice === 'snare')).toBe(true);
    }
  });

  it('uses increasingly relaxed swing without an artist-likeness setting', () => {
    expect(getStylePreset('pop').swing).toBe(0);
    expect(getStylePreset('soul').swing).toBeLessThan(getStylePreset('lofi').swing);
    expect(JSON.stringify(STYLE_PRESETS).toLowerCase()).not.toContain('artist');
  });
});
