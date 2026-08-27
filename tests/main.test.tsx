import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeContext, installContexts } from './helpers/fakeContext.ts';

describe('main', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    );
  });

  afterEach(() => {
    installContexts(undefined, undefined);
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('mounts the app into a container and registers the tools', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const { mount } = await import('../src/main.tsx');
    let runtime: ReturnType<typeof mount> | undefined;
    await act(async () => {
      runtime = mount(container);
    });
    expect(container.querySelector('h1')?.textContent).toBe('Euterpe');
    expect(runtime?.registry.getStatus()).toEqual({ kind: 'unavailable' });
    expect(window.euter).toBe(runtime);
    runtime?.engine.dispose();
  });

  it('unregisters tools and disposes the engine before the app is remounted', async () => {
    const context = createFakeContext();
    installContexts(context, context);
    const container = document.createElement('div');
    document.body.append(container);
    const { mount } = await import('../src/main.tsx');

    const first = mount(container) as ReturnType<typeof mount> & { unmount?: () => void };
    await waitFor(() => expect(first.registry.getStatus().kind).toBe('ready'));
    expect(await context.getTools()).toHaveLength(first.registry.tools.length);
    expect(first.unmount).toBeTypeOf('function');

    act(() => first.unmount?.());
    expect(await context.getTools()).toEqual([]);

    const second = mount(container) as ReturnType<typeof mount> & { unmount?: () => void };
    await waitFor(() => expect(second.registry.getStatus().kind).toBe('ready'));
    expect(await context.getTools()).toHaveLength(second.registry.tools.length);
    act(() => second.unmount?.());
  });
});
