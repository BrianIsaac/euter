/**
 * What the diagnostics panel and `get_diagnostics` report about the page's surroundings
 * (plan Architecture item 10): identity, the model context objects, the origin-trial token, the
 * response headers and the permission states. The panel refreshes the store; the tool reads it.
 */

export interface Brand {
  brand: string;
  version: string;
}

export interface EnvironmentSnapshot {
  userAgent: string;
  brands: Brand[] | null;
  platform: string | null;
  secureContext: boolean;
  originAgentCluster: boolean | null;
  documentModelContext: boolean;
  navigatorModelContext: boolean;
  sameContextObject: boolean | null;
  originTrialToken: { present: boolean; prefix: string };
}

export interface PolicyHeaders {
  status: number | null;
  permissionsPolicy: string | null;
  originAgentCluster: string | null;
  error: string | null;
}

export type PermissionReading = PermissionState | 'unsupported' | 'error';

export interface AudioReading {
  state: string;
  sampleRate: number;
  baseLatency: number | null;
  outputLatency: number | null;
}

export interface EnvironmentState {
  snapshot: EnvironmentSnapshot;
  headers: PolicyHeaders | null;
  permissions: { microphone: PermissionReading | null; midi: PermissionReading | null };
  audio: { before: AudioReading | null; after: AudioReading | null };
}

export interface EnvironmentStore {
  get(): EnvironmentState;
  update(patch: Partial<EnvironmentState>): void;
  subscribe(listener: () => void): () => void;
}

interface NavigatorWithHints extends Navigator {
  userAgentData?: { brands?: Brand[]; platform?: string };
}

/**
 * Reads the synchronous facts about the page.
 *
 * @param win - The window to read; defaults to the global.
 * @returns The snapshot.
 */
export function readEnvironment(win: Window = window): EnvironmentSnapshot {
  const nav = win.navigator as NavigatorWithHints;
  const doc = win.document;
  const documentContext = doc.modelContext;
  const navigatorContext = nav.modelContext;
  const meta = doc.querySelector<HTMLMetaElement>('meta[http-equiv="origin-trial"]');
  const token = meta?.content.trim() ?? '';
  const cluster: unknown = win.originAgentCluster;
  return {
    userAgent: nav.userAgent,
    brands: nav.userAgentData?.brands ?? null,
    platform: nav.userAgentData?.platform ?? null,
    secureContext: Boolean(win.isSecureContext),
    originAgentCluster: typeof cluster === 'boolean' ? cluster : null,
    documentModelContext: documentContext !== undefined && documentContext !== null,
    navigatorModelContext: navigatorContext !== undefined && navigatorContext !== null,
    sameContextObject:
      documentContext && navigatorContext ? documentContext === navigatorContext : null,
    originTrialToken: { present: token.length > 0, prefix: token.slice(0, 12) },
  };
}

/**
 * Fetches the page's own response headers with a same-origin request.
 *
 * @param fetchFn - The fetch to use; defaults to the global.
 * @returns The `Permissions-Policy` and `Origin-Agent-Cluster` header values, or the error.
 */
export async function fetchPolicyHeaders(fetchFn: typeof fetch = fetch): Promise<PolicyHeaders> {
  try {
    const response = await fetchFn('/', { method: 'GET', cache: 'no-store' });
    return {
      status: response.status,
      permissionsPolicy: response.headers.get('permissions-policy'),
      originAgentCluster: response.headers.get('origin-agent-cluster'),
      error: null,
    };
  } catch (error) {
    return {
      status: null,
      permissionsPolicy: null,
      originAgentCluster: null,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

/**
 * Queries a permission state where the Permissions API supports the name.
 *
 * @param name - `microphone` or `midi`.
 * @param permissions - The Permissions object; defaults to `navigator.permissions`.
 * @returns The state, `unsupported` when the name is unknown, `error` otherwise.
 */
export async function queryPermission(
  name: 'microphone' | 'midi',
  permissions: Permissions | undefined = globalThis.navigator?.permissions,
): Promise<PermissionReading> {
  if (!permissions) {
    return 'unsupported';
  }
  try {
    const status = await permissions.query({ name } as PermissionDescriptor);
    return status.state;
  } catch (error) {
    return error instanceof TypeError ? 'unsupported' : 'error';
  }
}

/**
 * Creates the store the panel writes and the tool reads.
 *
 * @param snapshot - The initial synchronous snapshot.
 * @returns The store.
 */
export function createEnvironmentStore(snapshot: EnvironmentSnapshot): EnvironmentStore {
  let state: EnvironmentState = {
    snapshot,
    headers: null,
    permissions: { microphone: null, midi: null },
    audio: { before: null, after: null },
  };
  const listeners = new Set<() => void>();
  return {
    get(): EnvironmentState {
      return state;
    },
    update(patch: Partial<EnvironmentState>): void {
      state = { ...state, ...patch };
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
