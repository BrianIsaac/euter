export interface HeaderLine {
  name: string;
  value: string;
  detach: boolean;
}
export interface HeaderRule {
  pattern: string;
  headers: HeaderLine[];
}
export function parseHeadersFile(text: string): HeaderRule[];
export function compilePattern(pattern: string): RegExp;
export function headersFor(rules: HeaderRule[], path: string): Map<string, string>;
