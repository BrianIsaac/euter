import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './ui/App.tsx';
import { createRuntime, type Runtime } from './webmcp/runtime.ts';

declare global {
  interface Window {
    /**
     * The live runtime, for the console, the diagnostics work and the end-to-end harness. It is
     * the same object the tools act on, so anything done here appears in the activity strip.
     */
    euter?: Runtime;
  }
}

export interface MountedRuntime extends Runtime {
  /** Unmounts React and releases the engine and both WebMCP registrations. */
  unmount(): void;
}

/**
 * Creates the runtime, registers the tools and mounts the app.
 *
 * @param container - The element to render into.
 * @returns The runtime, for the console and tests.
 */
export function mount(container: HTMLElement): MountedRuntime {
  const base = createRuntime();
  const root = createRoot(container);
  let mounted = true;
  const runtime: MountedRuntime = Object.assign(base, {
    unmount(): void {
      if (!mounted) return;
      mounted = false;
      root.unmount();
      base.registry.dispose();
      base.engine.dispose();
      if (window.euter === runtime) {
        delete window.euter;
      }
    },
  });
  window.euter = runtime;
  void runtime.registry.register();
  root.render(
    <StrictMode>
      <App runtime={runtime} />
    </StrictMode>,
  );
  return runtime;
}

const root = document.getElementById('root');
if (root) {
  mount(root);
}
