export const CHROME_CANDIDATES: string[];
export const WEBMCP_SWITCH: string;
export function findChrome(override?: string): string;
export function chromeArguments(options: {
  profileDir: string;
  port: number;
  url: string;
  headless?: boolean;
  extra?: string[];
}): string[];
export function armProfile(dir: string): string;
export function removeProfile(dir: string): void;
export function waitForCdp(port: number, timeoutMs?: number): Promise<Record<string, string>>;
export function launchChrome(options: {
  chrome: string;
  port: number;
  url: string;
  headless?: boolean;
  keepProfile?: boolean;
  onStderr?: (line: string) => void;
}): Promise<{
  pid: number | undefined;
  profileDir: string;
  version: Record<string, string>;
  close(): Promise<void>;
}>;
export interface CdpConnection {
  send(method: string, params?: unknown): Promise<Record<string, unknown>>;
  on(event: string, listener: (params: Record<string, unknown>) => void): () => void;
  close(): void;
}
export function connectCdp(endpoint: string, timeoutMs?: number): Promise<CdpConnection>;
export function findPageTarget(
  port: number,
  url: string,
  timeoutMs?: number,
): Promise<{ id: string; webSocketDebuggerUrl: string; url: string; title: string }>;
export function setPermission(
  browser: Pick<CdpConnection, 'send'>,
  origin: string,
  name: string,
  state: 'granted' | 'denied' | 'prompt',
): Promise<void>;
export function createCdpDriver(page: CdpConnection): Promise<unknown>;
