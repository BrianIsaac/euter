/**
 * The About panel (plan Demo and submission, README structure item 10): the licence, the pinned
 * versions and the "Measured in the ChatGPT desktop app" section, which is read from
 * `docs/research/day-one-checks.md` at build time when the file exists.
 */
import licence from '../../LICENSE?raw';
import pkg from '../../package.json';
import { parseMeasured, type MeasuredBlock } from './measured.ts';

export interface AboutProps {
  onClose: () => void;
}

const measuredFiles = import.meta.glob('../../docs/research/day-one-checks.md', {
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
export function About({ onClose }: AboutProps) {
  const markdown = measuredMarkdown();
  const measured = markdown === null ? null : parseMeasured(markdown);
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
        <h3>Licence</h3>
        <pre className="licence">{licence}</pre>
      </section>
    </aside>
  );
}
