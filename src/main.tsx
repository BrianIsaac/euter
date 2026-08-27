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

/**
 * Creates the runtime, registers the tools and mounts the app.
 *
 * @param container - The element to render into.
 * @returns The runtime, for the console and tests.
 */
export function mount(container: HTMLElement) {
  const runtime = createRuntime();
  window.euter = runtime;
  void runtime.registry.register();
  createRoot(container).render(
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
