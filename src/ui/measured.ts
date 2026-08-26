/**
 * Parses `docs/research/day-one-checks.md` (the operator's measurements) into blocks the About
 * panel renders: headings, paragraphs, list items and pipe tables.
 */

export type MeasuredBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] };

export interface MeasuredDocument {
  blocks: MeasuredBlock[];
  /** True when at least one table cell under a "Result" column has content. */
  filled: boolean;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(line.trim());
}

/**
 * Parses the markdown.
 *
 * @param markdown - The file contents.
 * @returns The blocks and whether any result cell is filled.
 */
export function parseMeasured(markdown: string): MeasuredDocument {
  const lines = markdown.split(/\r?\n/);
  const blocks: MeasuredBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let table: { headers: string[]; rows: string[][] } | null = null;

  const flush = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
    if (list.length > 0) {
      blocks.push({ kind: 'list', items: list });
      list = [];
    }
    if (table) {
      blocks.push({ kind: 'table', ...table });
      table = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1]?.length ?? 1, text: heading[2] ?? '' });
      continue;
    }
    if (trimmed.startsWith('|')) {
      if (paragraph.length > 0 || list.length > 0) {
        flush();
      }
      if (isSeparatorRow(trimmed)) {
        continue;
      }
      const cells = splitRow(trimmed);
      if (!table) {
        table = { headers: cells, rows: [] };
      } else {
        table.rows.push(cells);
      }
      continue;
    }
    if (table) {
      flush();
    }
    const item = /^[-*]\s+(.*)$/.exec(trimmed);
    if (item) {
      if (paragraph.length > 0) {
        flush();
      }
      list.push(item[1] ?? '');
      continue;
    }
    if (list.length > 0) {
      flush();
    }
    paragraph.push(trimmed);
  }
  flush();

  const filled = blocks.some((block) => {
    if (block.kind !== 'table') {
      return false;
    }
    const column = block.headers.findIndex((header) => /^result$/i.test(header));
    return column >= 0 && block.rows.some((row) => (row[column] ?? '').trim() !== '');
  });

  return { blocks, filled };
}
