export interface HarnessOptions {
  url: string;
  driver: string;
  scenarios: string[];
  port: number;
  chrome: string | undefined;
  headless: boolean;
  keepOpen: boolean;
  continueOnFailure: boolean;
  json: string | undefined;
}
export function parseArguments(argv: string[]): HarnessOptions;
export function scenarioPaths(names: string[]): string[];
