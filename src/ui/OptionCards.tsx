/**
 * The teaching cards (plan Decision 13, `propose_options`): two or three alternatives with the one
 * sentence the agent gave for each, a Play that auditions without committing and a Choose that
 * applies it. Choosing is a human command on the same bus the agent writes to.
 */
import type { SongDocument, TeachingOption, TeachingOptionSet } from '../song/types.ts';

export interface OptionCardsProps {
  song: SongDocument;
  previewOptionId: string | null;
  onAudition(optionId: string): void;
  onChoose(set: TeachingOptionSet, option: TeachingOption): void;
}

function describe(option: TeachingOption): string | null {
  if (option.chords && option.chords.length > 0) {
    return option.chords.map(({ bar, symbol }) => `${bar}: ${symbol}`).join('  ');
  }
  if (option.notes && option.notes.length > 0) {
    return `${option.notes.length} notes${option.track_id ? ` on ${option.track_id}` : ''}`;
  }
  return option.style ? `${option.style} feel` : null;
}

/**
 * Renders every option set that is still open, newest first.
 *
 * @param props - The song, the option being auditioned and the two handlers.
 * @returns The cards, or nothing when the agent has proposed nothing.
 */
export function OptionCards({ song, previewOptionId, onAudition, onChoose }: OptionCardsProps) {
  const signatures = new Set<string>();
  const sets: TeachingOptionSet[] = [];
  for (const set of [...song.option_sets].reverse()) {
    const signature = `${set.kind}:${set.bar_from}:${set.bar_to}`;
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    if (set.chosen_option_id === null) sets.push(set);
  }
  if (sets.length === 0) return null;

  return (
    <section className="options" aria-label="Options">
      <header className="options-header">
        <h2>Choices</h2>
        <span className="muted">audition, then choose</span>
      </header>
      {sets.map((set) => (
        <article key={set.id} className="option-set" data-testid="option-set">
          <header>
            <span className="muted">
              {set.kind} for bars {set.bar_from}-{set.bar_to}
            </span>
          </header>
          <div className="option-cards">
            {set.options.map((option) => {
              const detail = describe(option);
              return (
                <div
                  key={option.id}
                  className={`option-card${previewOptionId === option.id ? ' auditioning' : ''}${
                    option.raw_take === true ? ' option-card-raw' : ''
                  }`}
                  data-testid="option-card"
                  {...(option.raw_take === true ? { 'data-raw-take': 'true' } : {})}
                >
                  <strong>
                    {option.label}
                    {option.raw_take === true ? (
                      <span className="option-badge">from this app</span>
                    ) : null}
                  </strong>
                  <p>{option.why}</p>
                  {detail === null ? null : <p className="mono option-detail">{detail}</p>}
                  <div className="option-actions">
                    <button
                      type="button"
                      aria-pressed={previewOptionId === option.id}
                      onClick={() => onAudition(option.id)}
                    >
                      Play
                    </button>
                    <button type="button" onClick={() => onChoose(set, option)}>
                      Choose
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      ))}
    </section>
  );
}
