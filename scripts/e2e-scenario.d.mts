export interface ScenarioStep extends Record<string, unknown> {
  action: string;
}
export interface Scenario {
  name: string;
  title: string;
  reset: boolean;
  steps: ScenarioStep[];
}
export interface RegisteredToolSummary {
  name: string;
  description: string | null;
  hasInputSchema?: boolean;
  annotations: Record<string, unknown>;
}
export const OUTPUT_BUDGET: number;
export const ACTIONS: string[];
export function readPath(source: unknown, path: string): unknown;
export function resolve(value: unknown, vars: Record<string, unknown>): unknown;
export function resolveFunction(source: unknown, vars: Record<string, unknown>): string;
export function validateScenario(scenario: unknown, source: string): Scenario;
export function loadScenario(path: string): Scenario;
export function hasBehaviouralExpectation(expect: unknown): boolean;
export function matchRevision(
  actual: unknown,
  spec: number | string,
  previous: number | null,
): string | null;
export function checkEnvelope(
  envelope: unknown,
  expect?: Record<string, unknown>,
  context?: { previousRevision?: number | null; outputChars?: number },
): string[];
export function checkPaths(subject: unknown, expect?: Record<string, unknown>): string[];
export function checkTools(
  tools: RegisteredToolSummary[],
  expect?: Record<string, unknown>,
): string[];
export function captureInto(
  subject: unknown,
  capture: Record<string, string> | undefined,
  vars: Record<string, unknown>,
): string[];
export function untilSatisfied(subject: unknown, until: Record<string, unknown>): boolean;
export function stepLabel(step: Record<string, unknown>): string;
