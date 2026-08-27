import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { loadExampleSong } from '../../src/song/serialise.ts';
import type { SongDocument, TeachingOptionSet } from '../../src/song/types.ts';
import { OptionCards } from '../../src/ui/OptionCards.tsx';

const set: TeachingOptionSet = {
  id: 'options-1',
  kind: 'chords',
  bar_from: 1,
  bar_to: 4,
  options: [
    {
      id: 'option-1',
      label: 'Stay home',
      why: 'It keeps the calm of the hum.',
      chords: [
        { bar: 1, symbol: 'C' },
        { bar: 2, symbol: 'F' },
      ],
    },
    {
      id: 'option-2',
      label: 'Lift it',
      why: 'It opens into the chorus.',
      style: 'soul',
    },
  ],
  chosen_option_id: null,
};

function songWith(sets: TeachingOptionSet[]): SongDocument {
  return { ...loadExampleSong(), option_sets: sets };
}

describe('OptionCards', () => {
  it('renders nothing until the agent proposes something', () => {
    const { container } = render(
      <OptionCards
        song={songWith([])}
        previewOptionId={null}
        onAudition={() => undefined}
        onChoose={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows each option with its reason, its detail and both actions', () => {
    const onAudition = vi.fn();
    const onChoose = vi.fn();
    render(
      <OptionCards
        song={songWith([set])}
        previewOptionId="option-2"
        onAudition={onAudition}
        onChoose={onChoose}
      />,
    );
    const cards = screen.getAllByTestId('option-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('It keeps the calm of the hum.');
    expect(cards[0]).toHaveTextContent('1: C 2: F');
    expect(cards[1]).toHaveTextContent('soul feel');
    expect(within(cards[1] as HTMLElement).getByRole('button', { name: 'Play' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(within(cards[0] as HTMLElement).getByRole('button', { name: 'Play' }));
    expect(onAudition).toHaveBeenCalledWith('option-1');
    fireEvent.click(within(cards[0] as HTMLElement).getByRole('button', { name: 'Choose' }));
    expect(onChoose).toHaveBeenCalledWith(set, set.options[0]);
  });

  it('removes a chosen set instead of leaving stale actions on screen', () => {
    const { container } = render(
      <OptionCards
        song={songWith([{ ...set, chosen_option_id: 'option-1' }])}
        previewOptionId={null}
        onAudition={() => undefined}
        onChoose={() => undefined}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows only the newest open proposal for the same kind and bars', () => {
    const replacement: TeachingOptionSet = {
      ...set,
      id: 'options-2',
      options: set.options.map((option, index) => ({
        ...option,
        id: `replacement-${index}`,
        label: `New ${option.label}`,
      })),
    };
    render(
      <OptionCards
        song={songWith([set, replacement])}
        previewOptionId={null}
        onAudition={() => undefined}
        onChoose={() => undefined}
      />,
    );

    expect(screen.getAllByTestId('option-set')).toHaveLength(1);
    expect(screen.getAllByTestId('option-card')).toHaveLength(2);
    expect(screen.getByText('New Stay home')).toBeInTheDocument();
    expect(screen.queryByText('Stay home', { exact: true })).not.toBeInTheDocument();
  });
});
