import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, createPlayheadStore, trackFromActivity } from '../../src/ui/App.tsx';
import { loadExampleSong } from '../../src/song/serialise.ts';
import { createEmptySong } from '../../src/song/types.ts';
import { createHarness } from '../helpers/harness.ts';
import { makeTake } from '../helpers/harness.ts';

function renderApp(harness = createHarness()) {
  render(<App runtime={harness.runtime} />);
  return harness;
}

describe('App', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('mounts the header, transport, tracks, roll, take panel, keyboard and rails', async () => {
    const harness = renderApp();
    expect(screen.getByRole('heading', { level: 1, name: 'Euterpe' })).toBeInTheDocument();
    expect(screen.getByTestId('tool-status')).toHaveTextContent('Agent tools: initialising');
    await act(async () => {
      await harness.runtime.registry.register();
    });
    expect(screen.getByTestId('tool-status')).toHaveTextContent(
      `Agent tools: ready (${harness.runtime.registry.tools.length})`,
    );
    expect(screen.getByLabelText('Transport')).toBeInTheDocument();
    expect(screen.getAllByTestId('track')).toHaveLength(4);
    expect(screen.getByLabelText('Piano roll')).toBeInTheDocument();
    expect(screen.getByLabelText('Drum step grid')).toBeInTheDocument();
    expect(screen.getByLabelText('Take recorder')).toBeInTheDocument();
    expect(screen.getByLabelText('Musical Typing keyboard')).toBeInTheDocument();
    expect(screen.getByLabelText('Producer notes')).toBeInTheDocument();
    expect(screen.getByLabelText('Export')).toBeInTheDocument();
    expect(screen.getByLabelText('Activity')).toBeInTheDocument();
    expect(screen.getByTestId('song-revision')).toHaveTextContent('r0');
    expect(screen.getByTestId('audio-state')).toHaveTextContent('running');
  });

  it('shows the add-track path without trying to draw a roll when the song has no tracks', () => {
    renderApp(createHarness({ engine: { document: createEmptySong('Blank') } }));

    expect(screen.queryByLabelText('Piano roll')).not.toBeInTheDocument();
    expect(screen.getByText('Add a track to start writing notes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add track' })).toBeEnabled();
  });

  it('shows an agent write in the strip, the notes rail and the roll, and undoes it', () => {
    const harness = renderApp();
    act(() => {
      harness.engine.store.dispatch({
        type: 'generate_part',
        args: { track_id: 'bass', role: 'bass', style: 'lofi', bar_from: 1, bar_to: 4 },
        source: 'agent',
        why: 'A soft root line so the hum sits on top.',
      });
    });
    expect(screen.getByTestId('song-revision')).toHaveTextContent('r1');
    expect(screen.getByTestId('activity')).toHaveTextContent('Generated lofi bass in bars 1-4');
    expect(screen.getByTestId('producer-note')).toHaveTextContent(
      'A soft root line so the hum sits on top.',
    );
    expect(screen.getByLabelText('Piano roll')).toHaveTextContent('Bass');

    fireEvent.click(screen.getByRole('button', { name: /Undo Generated lofi bass/u }));
    expect(
      harness.engine.store.getDocument().tracks.find(({ id }) => id === 'bass')?.notes,
    ).toEqual(loadExampleSong().tracks.find(({ id }) => id === 'bass')?.notes);
    expect(
      screen.queryByRole('button', { name: /Undo Generated lofi bass/u }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Undo Undid/u })).not.toBeInTheDocument();
  });

  it('offers linear Undo and Redo controls beside the transport', () => {
    const harness = renderApp();
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();

    act(() => {
      harness.engine.store.dispatch({
        type: 'set_tempo',
        args: { bpm: 110 },
        source: 'human',
        why: 'Testing the transport history controls.',
      });
    });
    expect(undo).toBeEnabled();
    expect(redo).toBeDisabled();

    fireEvent.click(undo);
    expect(harness.engine.store.getDocument().bpm).toBe(92);
    expect(undo).toBeDisabled();
    expect(redo).toBeEnabled();

    fireEvent.click(redo);
    expect(harness.engine.store.getDocument().bpm).toBe(110);
    expect(undo).toBeEnabled();
    expect(redo).toBeDisabled();
  });

  it('renders the agent options as cards and applies the one the person chooses', async () => {
    const harness = renderApp();
    act(() => {
      harness.engine.store.dispatch({
        type: 'propose_options',
        args: {
          kind: 'chords',
          bar_from: 1,
          bar_to: 2,
          options: [
            { label: 'Stay home', why: 'It keeps the calm.', chords: [{ bar: 1, symbol: 'C' }] },
            { label: 'Lift it', why: 'It opens up.', chords: [{ bar: 1, symbol: 'Am7' }] },
          ],
        },
        source: 'agent',
        why: 'Two ways to start the verse.',
      });
    });
    const cards = screen.getAllByTestId('option-card');
    expect(cards).toHaveLength(2);
    expect(cards[1]).toHaveTextContent('It opens up.');

    await act(async () => {
      fireEvent.click(within(cards[1] as HTMLElement).getByRole('button', { name: 'Play' }));
      await Promise.resolve();
    });
    expect(harness.engine.playback.getPreview()?.chords[0]?.symbol).toBe('Am7');
    expect(harness.engine.store.getDocument().chords[0]?.symbol).toBe('C');

    act(() => {
      fireEvent.click(within(cards[1] as HTMLElement).getByRole('button', { name: 'Choose' }));
    });
    expect(harness.engine.store.getDocument().chords[0]?.symbol).toBe('Am7');
    expect(harness.engine.playback.getPreview()).toBeNull();
    expect(screen.getAllByTestId('activity')[0]).toHaveTextContent('Chose Lift it');
  });

  it('shows the raw-take escape card and commits it only after the person chooses', () => {
    const harness = renderApp();
    const take = {
      ...makeTake('take-1'),
      target_track_id: 'melody',
      target_bars: [1, 1] as [number, number],
    };
    act(() => {
      harness.engine.addTake(take, 'Kept the rough take.', 'human');
      harness.engine.store.dispatch({
        type: 'propose_options',
        args: {
          kind: 'take',
          take_id: take.id,
          track_id: 'melody',
          bar_from: 1,
          bar_to: 1,
          options: [
            {
              label: 'Four even notes',
              why: 'The seven segments sound like four repeated quavers.',
              notes: [60, 60, 60, 60].map((p, s) => ({ p, s, d: 0.8 })),
            },
            {
              label: 'Held opening',
              why: 'The first segments may be one held note.',
              notes: [
                { p: 60, s: 0, d: 2 },
                { p: 64, s: 2, d: 1 },
              ],
            },
          ],
        },
        source: 'agent',
        why: 'Two readings of the rough note boundaries.',
      });
    });
    expect(harness.engine.store.getDocument().tracks[0]?.notes).toEqual(
      loadExampleSong().tracks[0]?.notes,
    );
    const raw = screen
      .getByText('None of these — keep what I sang')
      .closest('[data-testid="option-card"]');
    expect(raw).not.toBeNull();

    act(() => {
      fireEvent.click(within(raw as HTMLElement).getByRole('button', { name: 'Choose' }));
    });

    expect(harness.engine.store.getDocument().tracks[0]?.notes.filter(({ s }) => s < 4)).toEqual(
      take.notes.map((note) => ({
        ...note,
        s: note.s_raw ?? note.s,
        d: note.d_raw ?? note.d,
      })),
    );
    expect(harness.engine.pendingTake()).toBeNull();
    expect(screen.queryByText('None of these — keep what I sang')).not.toBeInTheDocument();
  });

  it('keeps the take panel when a refused commit never reaches the track', () => {
    const harness = renderApp();
    act(() => {
      harness.engine.addTake(makeTake('take-empty', []), 'Kept the silent capture.', 'human');
      harness.engine.setPendingTake('take-empty');
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Commit take' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('no detected notes');
    expect(harness.engine.pendingTake()?.id).toBe('take-empty');
  });

  it('keeps the take panel when a refused choice never reaches the track', async () => {
    const harness = renderApp();
    const take = {
      ...makeTake('take-1'),
      target_track_id: 'melody',
      target_bars: [1, 1] as [number, number],
    };
    act(() => {
      harness.engine.addTake(take, 'Kept the rough take.', 'human');
      harness.engine.setPendingTake(take.id);
      harness.engine.store.dispatch({
        type: 'propose_options',
        args: {
          kind: 'take',
          take_id: take.id,
          track_id: 'melody',
          bar_from: 1,
          bar_to: 1,
          options: [
            { label: 'Up', why: 'It climbs.', notes: [{ p: 64, s: 0, d: 1 }] },
            { label: 'Down', why: 'It falls.', notes: [{ p: 57, s: 0, d: 1 }] },
          ],
        },
        source: 'agent',
        why: 'Two readings of the rough note boundaries.',
      });
    });
    await act(async () => {
      await harness.recorder.start({ trackId: 'melody', countInBars: 1, metronome: true });
    });
    const raw = screen
      .getByText('None of these — keep what I sang')
      .closest('[data-testid="option-card"]');

    act(() => {
      fireEvent.click(within(raw as HTMLElement).getByRole('button', { name: 'Choose' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('being recorded');
    expect(harness.engine.pendingTake()?.id).toBe('take-1');
    expect(screen.getByText('None of these — keep what I sang')).toBeInTheDocument();
  });

  it('shows the request_take banner on the bars the agent named', () => {
    const harness = renderApp();
    act(() => {
      harness.engine.store.dispatch({
        type: 'request_take',
        args: { track_id: 'bass', bar_from: 5, bar_to: 8, prompt: 'Hum me a bassline' },
        source: 'agent',
        why: 'You know how it should move.',
      });
    });
    const banner = screen.getByTestId('request-take-banner');
    expect(banner).toHaveTextContent('bars 5-8');
    expect(banner).toHaveTextContent('Hum me a bassline');
  });

  it('reports a refused human edit instead of throwing', async () => {
    const harness = renderApp();
    await act(async () => {
      await harness.recorder.start({ trackId: 'melody', countInBars: 1, metronome: true });
    });
    const melody = screen.getAllByTestId('track')[0] as HTMLElement;
    act(() => {
      fireEvent.click(within(melody).getByRole('button', { name: 'Mute' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('being recorded');
  });

  it('loads the example song from the header', () => {
    const harness = renderApp();
    act(() => {
      harness.engine.store.dispatch({
        type: 'set_tempo',
        args: { bpm: 140 },
        source: 'human',
        why: 'Too fast.',
      });
    });
    expect(screen.getByTestId('song-revision')).toHaveTextContent('r1');
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Example song' }));
    });
    expect(harness.engine.store.getDocument().bpm).toBe(92);
  });

  it('opens and closes the diagnostics and about panels', () => {
    renderApp();
    expect(screen.queryByLabelText('Diagnostics')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
    expect(screen.getByLabelText('Diagnostics')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'About' }));
    expect(screen.queryByLabelText('Diagnostics')).not.toBeInTheDocument();
    expect(screen.getByLabelText('About')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close about' }));
    expect(screen.queryByLabelText('About')).not.toBeInTheDocument();
  });

  it('polls the transport for a playhead only while it is playing', () => {
    const harness = createHarness();
    const idle = createPlayheadStore(harness.engine, false, 4, 5);
    expect(idle.getSnapshot()).toBeNull();
    expect(idle.subscribe(() => undefined)()).toBeUndefined();

    const playing = createPlayheadStore(harness.engine, true, 4, 5);
    expect(playing.getSnapshot()).toBe(0);
    const listener = vi.fn();
    const stop = playing.subscribe(listener);
    vi.advanceTimersByTime(12);
    stop();
    expect(listener).toHaveBeenCalled();
  });

  it('reads the track a command touched from its changed list', () => {
    const song = loadExampleSong();
    expect(
      trackFromActivity(
        {
          id: 1,
          at: 0,
          type: 'set_notes',
          source: 'agent',
          revision: 1,
          changed: ['tracks', 'track:bass:notes'],
          summary: 'x',
        },
        song,
      ),
    ).toBe('bass');
    expect(trackFromActivity(undefined, song)).toBeNull();
  });
});
