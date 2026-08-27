import { describe, expect, it } from 'vitest';
import { descriptions } from '../../../src/webmcp/descriptions.ts';
import { probeTools, productTools, tools } from '../../../src/webmcp/tools/index.ts';

describe('tools index', () => {
  it('lists the twenty-eight product tools in the plan’s order', () => {
    expect(productTools.map((tool) => tool.name)).toEqual([
      'get_song_state',
      'get_track_notes',
      'get_chords',
      'get_take',
      'start_recording',
      'stop_recording',
      'commit_take',
      'set_notes',
      'set_chords',
      'suggest_chords',
      'propose_options',
      'audition_option',
      'request_take',
      'set_key',
      'set_tempo',
      'set_quantize',
      'add_track',
      'set_instrument',
      'set_mix',
      'generate_part',
      'arrange',
      'play',
      'stop',
      'undo',
      'redo',
      'render',
      'get_job',
      'cancel_job',
    ]);
  });

  it('marks exactly the six orientation tools as reads', () => {
    expect(productTools.filter(({ kind }) => kind === 'read').map(({ name }) => name)).toEqual([
      'get_song_state',
      'get_track_notes',
      'get_chords',
      'get_take',
      'suggest_chords',
      'get_job',
    ]);
  });

  it('gives every tool the description the plan registers', () => {
    for (const tool of tools) {
      expect(tool.description, tool.name).toBe(
        descriptions[tool.name as keyof typeof descriptions],
      );
    }
  });

  it('keeps the probe tools last until the first full loop has run', () => {
    expect(probeTools.map(({ name }) => name)).toEqual(['get_diagnostics', 'ping']);
    expect(tools).toHaveLength(productTools.length + probeTools.length);
    expect(tools.slice(-2)).toEqual(probeTools);
  });
});
