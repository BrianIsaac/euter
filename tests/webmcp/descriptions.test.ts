import { describe, expect, it } from 'vitest';
import {
  descriptions,
  registeredDescription,
  WHY_SENTENCE,
  WRITE_SUFFIX,
} from '../../src/webmcp/descriptions.ts';

describe('descriptions', () => {
  it('leaves reads alone and appends the write sentence to writes', () => {
    expect(registeredDescription('Read it.', 'read', false)).toBe('Read it.');
    expect(registeredDescription('Write it.', 'write', false)).toBe(`Write it. ${WRITE_SUFFIX}`);
    expect(registeredDescription('Write it.', 'write', true)).toBe(
      `Write it. ${WHY_SENTENCE} ${WRITE_SUFFIX}`,
    );
  });

  it('keeps every description with its suffix under 500 characters', () => {
    for (const [name, text] of Object.entries(descriptions)) {
      expect(registeredDescription(text, 'write', true).length, name).toBeLessThanOrEqual(500);
    }
  });

  it('tells the agent what to call first and what comes next', () => {
    expect(descriptions.get_song_state).toContain('Call this first');
    expect(descriptions.stop_recording).toContain('Next: set_key');
    expect(descriptions.get_take).toContain('commit_take');
    expect(descriptions.set_chords).toContain('Set chords before generate_part');
    expect(descriptions.render).toContain('poll get_job');
  });

  it('carries one description for every registered tool and nothing else', () => {
    expect(Object.keys(descriptions)).toHaveLength(28);
  });
});
