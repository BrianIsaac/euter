import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { loadExampleSong } from '../../src/song/serialise.ts';
import { TrackList } from '../../src/ui/TrackList.tsx';

describe('TrackList', () => {
  it('lists the tracks and selects one', () => {
    const onSelect = vi.fn();
    render(
      <TrackList
        song={loadExampleSong()}
        selectedTrackId="melody"
        onSelect={onSelect}
        onDispatch={() => undefined}
      />,
    );
    const tracks = screen.getAllByTestId('track');
    expect(tracks).toHaveLength(4);
    expect(tracks[0]).toHaveTextContent('Melody');
    expect(tracks[0]).toHaveTextContent('13 notes');
    fireEvent.click(within(tracks[2] as HTMLElement).getByRole('button', { name: /Bass/u }));
    expect(onSelect).toHaveBeenCalledWith('bass');
  });

  it('dispatches instrument, mix and add-track commands with a reason', () => {
    const onDispatch = vi.fn();
    render(
      <TrackList
        song={loadExampleSong()}
        selectedTrackId="melody"
        onSelect={() => undefined}
        onDispatch={onDispatch}
      />,
    );
    fireEvent.change(screen.getByLabelText('Instrument for Melody'), {
      target: { value: 'electric-piano' },
    });
    expect(onDispatch).toHaveBeenCalledWith({
      type: 'set_instrument',
      args: { track_id: 'melody', instrument: 'electric-piano' },
      source: 'human',
      why: 'Changed Melody to electric-piano.',
    });

    fireEvent.change(screen.getByLabelText('Volume for Bass'), { target: { value: '-12' } });
    expect(onDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'set_mix', args: { track_id: 'bass', volume_db: -12 } }),
    );

    const drums = screen.getAllByTestId('track')[3] as HTMLElement;
    fireEvent.click(within(drums).getByRole('button', { name: 'Mute' }));
    expect(onDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'set_mix', args: { track_id: 'drums', mute: true } }),
    );

    fireEvent.change(screen.getByLabelText('Kind of track to add'), { target: { value: 'bass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add track' }));
    expect(onDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'add_track',
        args: { kind: 'bass', instrument: 'sub-bass' },
        source: 'human',
      }),
    );

    fireEvent.change(screen.getByLabelText('Kind of track to add'), { target: { value: 'vocal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add track' }));
    expect(onDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'add_track',
        args: { kind: 'vocal', instrument: 'recorded-voice' },
      }),
    );
  });
});
