import { describe, expect, it } from 'vitest';
import type { Note } from '../../../src/song/types.ts';
import { humanNotesCommand } from '../../../src/ui/roll/editCommands.ts';

describe('human note commands', () => {
  it('uses the shared set_notes command shape and clones notes', () => {
    const notes: Note[] = [{ p: 60, s: 0, d: 1, v: 0.8, source: 'human' }];
    const command = humanNotesCommand('melody', notes, 'Moved C4');
    expect(command).toEqual({
      type: 'set_notes',
      source: 'human',
      args: {
        track_id: 'melody',
        bar_from: 1,
        notes,
        replace: true,
        summary: 'Moved C4',
      },
    });
    expect((command.args.notes as Note[])[0]).not.toBe(notes[0]);
  });
});
