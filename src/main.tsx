import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './ui/App.tsx';
import { createRuntime } from './webmcp/runtime.ts';

/**
 * Creates the runtime, registers the tools and mounts the app.
 *
 * @param container - The element to render into.
 * @returns The runtime, for the console and tests.
 */
export function mount(container: HTMLElement) {
  const runtime = createRuntime();
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
