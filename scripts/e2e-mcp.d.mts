export interface McpPage {
  id: number;
  title: string;
  url: string;
  selected: boolean;
}
export interface WebmcpToolSummary {
  name: string;
  description: string | null;
  hasInputSchema: boolean;
  annotations: Record<string, unknown>;
}
export interface SnapshotElement {
  uid: string;
  role: string;
  name: string | null;
}
export interface ElementTarget {
  role?: string;
  name?: string;
  name_includes?: string;
}
export interface StdioClient {
  call(method: string, params?: unknown): Promise<Record<string, unknown>>;
  notify(method: string, params?: unknown): void;
  close(): Promise<void>;
  pid: number | undefined;
}
export const PROTOCOL_VERSION: string;
export function splitFrames(buffer: string): { messages: unknown[]; rest: string };
export function parsePages(text: string): McpPage[];
export function parseWebmcpTools(text: string): WebmcpToolSummary[];
export function parseToolOutput(text: string): {
  status: string | null;
  envelope: unknown;
  chars: number;
};
export function parseEvaluateResult(text: string): unknown;
export function parseSnapshot(text: string): SnapshotElement[];
export function findUid(elements: SnapshotElement[], target: ElementTarget, nth?: number): string;
export function createStdioClient(options: {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  onStderr?: (line: string) => void;
  onRequest?: (method: string, params: Record<string, unknown>) => unknown;
  timeoutMs?: number;
}): StdioClient;
export function toolText(result: Record<string, unknown>, label: string): string;
export function createMcpDriver(client: StdioClient, pageId: () => number): unknown;
