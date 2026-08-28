/**
 * The About panel (plan Demo and submission, README structure item 10): the licence, the pinned
 * versions, the "Measured in the ChatGPT desktop app" section read from
 * `src/content/day-one-checks.md` at build time, and the sample sources with their licences
 * read from `SAMPLES.md`, beside what this session knows about the remote sample origin.
 */
import licence from '../../LICENSE?raw';
import pkg from '../../package.json';
import samplesMarkdown from '../../SAMPLES.md?raw';
import { parseMeasured, type MeasuredBlock } from './measured.ts';

export interface AboutProps {
  onClose: () => void;
  /** Replaces the song with the original example, for the agent-only path. */
  onLoadExample?: (() => void) | undefined;
  /**
   * The engine's visible fallback notices, one per track whose instrument could not be loaded
   * from the remote pack. An empty list means nothing has fallen back in this session.
   */
  fallbacks?: readonly string[] | undefined;
}

export interface RemoteSampleState {
  /** `remote` means the pack is configured and nothing has substituted; `bundled` means it has. */
  kind: 'remote' | 'bundled' | 'unconfigured';
  base: string | null;
  sentence: string;
}

/**
 * Describes where the sounds are coming from, without claiming more than the session knows.
 *
 * @param fallbacks - The engine's fallback notices.
 * @param base - The configured remote origin; the default is the build's `VITE_SAMPLES_BASE_URL`.
 * @returns The state and one sentence for the panel.
 */
export function remoteSampleState(
  fallbacks: readonly string[] = [],
  base: string | undefined = import.meta.env.VITE_SAMPLES_BASE_URL,
): RemoteSampleState {
  const trimmed = typeof base === 'string' && base.trim() !== '' ? base.trim() : null;
  if (trimmed === null) {
    return {
      kind: 'unconfigured',
      base: null,
      sentence:
        'Bundled subset only: no remote sample origin is configured, so every instrument outside the bundled piano and kit plays its bundled substitute.',
    };
  }
  if (fallbacks.length > 0) {
    return {
      kind: 'bundled',
      base: trimmed,
      sentence: `The remote pack is configured at ${trimmed}, but a sound in this session came from the bundled subset instead.`,
    };
  }
  return {
    kind: 'remote',
    base: trimmed,
    sentence: `The remote pack is configured at ${trimmed}. Nothing has fallen back to the bundled subset in this session.`,
  };
}

/**
 * The sample licence table from `SAMPLES.md`, without the fetch and upload instructions.
 *
 * @returns The blocks to render.
 */
export function sampleLicenceBlocks(): MeasuredBlock[] {
  const end = samplesMarkdown.indexOf('## Fetch and R2 upload');
  const head = end < 0 ? samplesMarkdown : samplesMarkdown.slice(0, end);
  return parseMeasured(head).blocks.filter((block) => block.kind !== 'heading');
}

const measuredFiles = import.meta.glob('../content/day-one-checks.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * The day-one-checks markdown, or null when the file is absent from the build.
 *
 * @returns The file contents.
 */
export function measuredMarkdown(): string | null {
  const first = Object.values(measuredFiles)[0];
  return typeof first === 'string' ? first : null;
}

const versions: [string, string][] = [
  ['Euterpe', pkg.version],
  ['react', pkg.dependencies.react],
  ['zod', pkg.dependencies.zod],
  ['vite', pkg.devDependencies.vite],
  ['typescript', pkg.devDependencies.typescript],
  ['vitest', pkg.devDependencies.vitest],
];

function renderBlock(block: MeasuredBlock, index: number) {
  switch (block.kind) {
    case 'heading': {
      const level = Math.min(6, block.level + 2);
      const Tag = `h${level}` as 'h3' | 'h4' | 'h5' | 'h6';
      return <Tag key={index}>{block.text}</Tag>;
    }
    case 'paragraph':
      return <p key={index}>{block.text}</p>;
    case 'list':
      return (
        <ul key={index}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{item}</li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div key={index} className="table-scroll">
          <table>
            <thead>
              <tr>
                {block.headers.map((header, headerIndex) => (
                  <th key={headerIndex}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/**
 * Renders the panel.
 *
 * @param props - The close handler.
 * @returns The panel.
 */
export function About({ onClose, onLoadExample, fallbacks = [] }: AboutProps) {
  const markdown = measuredMarkdown();
  const measured = markdown === null ? null : parseMeasured(markdown);
  const samples = remoteSampleState(fallbacks);
  return (
    <aside className="drawer" aria-label="About">
      <header className="drawer-header">
        <h2>About Euterpe</h2>
        <button type="button" onClick={onClose} aria-label="Close about">
          Close
        </button>
      </header>

      <section className="diag-section">
        <p>
          A GarageBand-like music maker a person and their agent use together through WebMCP. Hum a
          line, talk it through, and the tracks take shape in this window. Built for the WebMCP
          Challenge; repository and package name <code>euter</code>.
        </p>
      </section>

      {onLoadExample === undefined ? null : (
        <section className="diag-section">
          <h3>Example song</h3>
          <p>
            "First Light" is an original eight-bar example: melody, chords, bass and drums. Load it
            to explore the app, or to give your agent something to work on before you record.
          </p>
          <button type="button" onClick={onLoadExample}>
            Load the example song
          </button>
        </section>
      )}

      <section className="diag-section">
        <h3>Versions</h3>
        <dl>
          {versions.map(([name, version]) => (
            <div key={name} className="dl-row">
              <dt>{name}</dt>
              <dd className="mono">{version}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="diag-section">
        <h3>Measured in the ChatGPT desktop app</h3>
        {measured === null ? (
          <p className="muted">No measurements are in this build.</p>
        ) : (
          <>
            {!measured.filled ? (
              <p className="muted">
                The checks below have not been run on this build yet; the table is the template the
                operator fills.
              </p>
            ) : null}
            {measured.blocks.map(renderBlock)}
          </>
        )}
      </section>

      <section className="diag-section">
        <h3>Sounds and licences</h3>
        <p data-testid="sample-origin">{samples.sentence}</p>
        {fallbacks.length === 0 ? null : (
          <ul>
            {fallbacks.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        )}
        {sampleLicenceBlocks().map(renderBlock)}
      </section>

      <section className="diag-section">
        <h3>Licence</h3>
        <p>
          Euterpe is MIT licensed. The mediabunny packages used for MP3 export are MPL-2.0 and
          unmodified.
        </p>
        <pre className="licence">{licence}</pre>
      </section>
    </aside>
  );
}
