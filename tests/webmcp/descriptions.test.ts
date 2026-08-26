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

  it('names the tail marker in the diagnostics description', () => {
    expect(descriptions.get_diagnostics).toContain('tail_marker');
    expect(descriptions.ping).toContain('revision');
  });
});
