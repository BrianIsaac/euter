import { describe, expect, it } from 'vitest';
import type { Note } from '../../../src/song/types.ts';
import { humanNotesCommand } from '../../../src/ui/roll/editCommands.ts';

describe('human note commands', () => {
  it('uses the shared set_notes command shape and clones notes', () => {
    const notes: Note[] = [{ p: 60, s: 0, d: 1, v: 0.8, source: 'human' }];
    const command = humanNotesCommand('melody', notes, 'Moved C4', {
      barFrom: 1,
      barTo: 1,
      beatsPerBar: 4,
    });
    expect(command).toEqual({
      type: 'set_notes',
      source: 'human',
      why: 'Moved C4',
      args: {
        track_id: 'melody',
        bar_from: 1,
        notes: [{ p: 60, s: 0, d: 1, v: 0.8 }],
        replace: true,
      },
    });
    expect(command.args.notes).not.toEqual(notes);
  });

  it('sends one strict bar with starts relative to that bar', () => {
    const notes: Note[] = [
      { p: 60, s: 1, d: 1, v: 0.8, source: 'human' },
      { p: 64, s: 5, d: 1, v: 0.7, source: 'agent', s_raw: 4.9 },
    ];
    const command = humanNotesCommand('melody', notes, 'Touched bar two', {
      barFrom: 2,
      barTo: 2,
      beatsPerBar: 4,
    });
    expect(command.args.notes).toEqual([{ p: 64, s: 1, d: 1, v: 0.7 }]);
  });
});
