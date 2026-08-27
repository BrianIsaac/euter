import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createEmptySong } from '../../src/song/types.ts';
import { ProducerNotes } from '../../src/ui/ProducerNotes.tsx';
import { createSongStore } from '../../src/song/store.ts';

describe('ProducerNotes', () => {
  it('explains the rail when there are no notes', () => {
    const bus = createSongStore(createEmptySong());
    render(<ProducerNotes bus={bus} />);
    expect(screen.getByText(/one sentence on why/)).toBeInTheDocument();
  });

  it('lists notes in song order', () => {
    const song = createEmptySong();
    song.notes_log = [
      { revision: 2, why: 'Chorus lifts', bars: [9, 16], track_id: 't2', source: 'agent' },
      { revision: 1, why: 'Verse grounded', bars: [1, 8], track_id: 't1', source: 'agent' },
    ];
    const bus = createSongStore(song);
    render(<ProducerNotes bus={bus} />);
    const notes = screen.getAllByTestId('producer-note');
    expect(notes[0]).toHaveTextContent('bars 1-8');
    expect(notes[0]).toHaveTextContent('Verse grounded');
    expect(notes[1]).toHaveTextContent('bars 9-16');
  });
});
