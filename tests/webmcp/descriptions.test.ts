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

  it('states cross-tool data relationships without directing the agent', () => {
    expect(descriptions.get_song_state).toContain('get_track_notes');
    expect(descriptions.get_take).toContain('get_song_state');
    expect(descriptions.set_chords).toContain('generate_part');
    expect(descriptions.render).toContain('get_job reports');
    expect(descriptions.request_take).toContain('start_recording without a track_id');
  });

  it('names the behaviour the 28 Aug harness runs observed', () => {
    // Undo moves the revision forward rather than back (demo scenario, r10 -> r11).
    expect(descriptions.undo).toContain('the revision increases');
    expect(descriptions.redo).toContain('the revision increases');
    // A ranged render starts at time zero in the file (R-26, midi bars 5-8).
    expect(descriptions.render).toContain('begins at time zero');
    // The R2 pack is not uploaded yet, so a non-bundled instrument substitutes audibly.
    expect(descriptions.set_instrument).toContain('loaded:false');
    expect(descriptions.set_instrument).toContain('transport and About panel');
    expect(descriptions.get_job).toContain('fell back to a bundled sound');
    // Codes the errors scenario provoked from these tools.
    expect(descriptions.play).toContain('OUT_OF_RANGE');
    expect(descriptions.start_recording).toContain('RECORDING_IN_PROGRESS');
    expect(descriptions.cancel_job).toContain('cancelled:false');
    expect(descriptions.suggest_chords).toContain('16 bars');
  });

  it('carries one description for every registered tool and nothing else', () => {
    expect(Object.keys(descriptions)).toHaveLength(29);
  });
});
