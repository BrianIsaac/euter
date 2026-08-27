import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('main', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    );
  });

  afterEach(() => {
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
});
