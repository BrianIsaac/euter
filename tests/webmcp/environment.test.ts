import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEnvironmentStore,
  fetchPolicyHeaders,
  queryPermission,
  readEnvironment,
} from '../../src/webmcp/environment.ts';
import { createFakeContext, installContexts } from '../helpers/fakeContext.ts';

describe('environment', () => {
  afterEach(() => {
    installContexts(undefined, undefined);
    document.head
      .querySelectorAll('meta[http-equiv="origin-trial"]')
      .forEach((meta) => meta.remove());
  });

  it('reads identity, contexts and the origin-trial token', () => {
    const shared = createFakeContext();
    installContexts(shared, shared);
    const meta = document.createElement('meta');
    meta.httpEquiv = 'origin-trial';
    meta.content = 'AbCdEfGhIjKlMnOp==';
    document.head.append(meta);
    const snapshot = readEnvironment();
    expect(snapshot.userAgent).toBe(navigator.userAgent);
    expect(snapshot.brands).toBeNull();
    expect(snapshot.documentModelContext).toBe(true);
    expect(snapshot.navigatorModelContext).toBe(true);
    expect(snapshot.sameContextObject).toBe(true);
    expect(snapshot.originTrialToken).toEqual({ present: true, prefix: 'AbCdEfGhIjKl' });
    expect(typeof snapshot.secureContext).toBe('boolean');
  });

  it('reports absent contexts and an empty token', () => {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'origin-trial';
    meta.content = '';
    document.head.append(meta);
    const snapshot = readEnvironment();
    expect(snapshot.documentModelContext).toBe(false);
    expect(snapshot.navigatorModelContext).toBe(false);
    expect(snapshot.sameContextObject).toBeNull();
    expect(snapshot.originTrialToken).toEqual({ present: false, prefix: '' });
  });

  it('reports distinct context objects', () => {
    installContexts(createFakeContext(), createFakeContext());
    expect(readEnvironment().sameContextObject).toBe(false);
  });

  it('fetches the policy headers from the page itself', async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response('', {
          status: 200,
          headers: { 'permissions-policy': 'tools=(self)', 'origin-agent-cluster': '?1' },
        }),
    );
    expect(await fetchPolicyHeaders(fetchFn as unknown as typeof fetch)).toEqual({
      status: 200,
      permissionsPolicy: 'tools=(self)',
      originAgentCluster: '?1',
      error: null,
    });
    expect(fetchFn).toHaveBeenCalledWith('/', { method: 'GET', cache: 'no-store' });
  });

  it('reports a fetch failure as data', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await fetchPolicyHeaders(fetchFn as unknown as typeof fetch)).toEqual({
      status: null,
      permissionsPolicy: null,
      originAgentCluster: null,
      error: 'TypeError: Failed to fetch',
    });
  });

  it('queries permission states and degrades honestly', async () => {
    const granted = { query: vi.fn(async () => ({ state: 'granted' as PermissionState })) };
    expect(await queryPermission('microphone', granted as unknown as Permissions)).toBe('granted');
    const unsupported = {
      query: vi.fn(async () => {
        throw new TypeError('unknown name');
      }),
    };
    expect(await queryPermission('midi', unsupported as unknown as Permissions)).toBe(
      'unsupported',
    );
    const failing = {
      query: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    expect(await queryPermission('midi', failing as unknown as Permissions)).toBe('error');
    expect(await queryPermission('midi', undefined)).toBe('unsupported');
  });

  it('stores updates and notifies subscribers', () => {
    const store = createEnvironmentStore(readEnvironment());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.update({ permissions: { microphone: 'granted', midi: null } });
    expect(store.get().permissions).toEqual({ microphone: 'granted', midi: null });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.update({ headers: null });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
