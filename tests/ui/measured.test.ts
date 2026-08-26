import { describe, expect, it } from 'vitest';
import { parseMeasured } from '../../src/ui/measured.ts';

const sample = `# Day-one checks

Measured by the operator.

## Checks

| # | Check | Result |
| --- | --- | --- |
| 0 | Site tools | |
| 1 | Microphone | |

- first note
- second note

Closing line
continued.
`;

describe('parseMeasured', () => {
  it('parses headings, paragraphs, tables and lists in order', () => {
    const { blocks, filled } = parseMeasured(sample);
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Day-one checks' },
      { kind: 'paragraph', text: 'Measured by the operator.' },
      { kind: 'heading', level: 2, text: 'Checks' },
      {
        kind: 'table',
        headers: ['#', 'Check', 'Result'],
        rows: [
          ['0', 'Site tools', ''],
          ['1', 'Microphone', ''],
        ],
      },
      { kind: 'list', items: ['first note', 'second note'] },
      { kind: 'paragraph', text: 'Closing line continued.' },
    ]);
    expect(filled).toBe(false);
  });

  it('detects a filled result cell', () => {
    const { filled } = parseMeasured('| # | Result |\n| --- | --- |\n| 0 | pass |\n');
    expect(filled).toBe(true);
  });

  it('handles a table followed directly by text and an empty document', () => {
    const { blocks } = parseMeasured('| a | b |\n| --- | --- |\n| 1 | 2 |\ntext after\n');
    expect(blocks.map((block) => block.kind)).toEqual(['table', 'paragraph']);
    expect(parseMeasured('').blocks).toEqual([]);
  });
});
